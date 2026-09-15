const axios = require("axios");
const prisma = require("../../confiq/prisma");
const { classifyRegion } = require("./regionClassifier");
const { extractCountry } = require("./countryExtractor");

// RemoteOK is a global remote-jobs board. We only keep listings that are
// plausibly open to someone applying FROM Kenya: explicitly Kenya-tagged,
// Africa/East-Africa-wide, or open to "anywhere"/"worldwide" remote workers.
// Anything scoped to a specific non-African country/timezone (e.g. "US only",
// "EU only") is skipped.
const KENYA_ELIGIBLE_REGIONS = new Set(["GLOBAL", "AFRICA", "EAST_AFRICA"]);

async function collectRemoteOK() {
  console.log("Collecting Kenya-eligible remote jobs from RemoteOK...");

  try {
    const response = await axios.get("https://remoteok.com/api", {
      headers: {
        "User-Agent": "Mozilla/5.0",
      },
    });

    console.log("✅ Connected to RemoteOK");

    const jobs = response.data.slice(1); // first item is metadata

    console.log(`📦 Downloaded ${jobs.length} jobs`);

    let imported = 0;
    let skippedNotEligible = 0;

    for (const item of jobs) {
      if (!item.position || !item.company) {
        continue;
      }

      const region = classifyRegion(item);
      const country = extractCountry(item);
      const openToKenya = country === "KENYA" || KENYA_ELIGIBLE_REGIONS.has(region);

      if (!openToKenya) {
        skippedNotEligible++;
        continue;
      }

      console.log(`➡️ ${item.company} - ${item.position}`);

      const company = await prisma.company.upsert({
        where: {
          name: item.company,
        },
        update: {},
        create: {
          name: item.company || "Unknown Company",
        },
      });

      const exists = await prisma.job.findFirst({
        where: {
          title: item.position,
          companyId: company.id,
        },
      });

      if (exists) {
        console.log(`⏭ Already exists: ${item.position}`);
        continue;
      }

      await prisma.job.create({
        data: {
          companyId: company.id,
          title: item.position,
          description: item.description || "",
          location: item.location || "Remote",

          country: country === "KENYA" ? "KENYA" : null,
          region,

          remoteType: "REMOTE",
          employmentType: "FULL_TIME",
          source: "RemoteOK",
          applyUrl: item.url || "",
          status: "ACTIVE",
        },
      });

      imported++;
    }

    console.log(`Imported ${imported} jobs (skipped ${skippedNotEligible} not open to Kenya).`);

    return imported;
  } catch (err) {
    console.error("❌ RemoteOK Import Error");
    console.error(err.message);
    return 0;
  }
}

module.exports = collectRemoteOK;
