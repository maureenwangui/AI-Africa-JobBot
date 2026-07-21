const axios = require("axios");
const prisma = require("../../confiq/prisma");
const { classifyRegion } = require("./regionClassifier");
const { extractCountry } = require("./countryExtractor");

async function collectRemoteOK() {
  console.log("Collecting jobs from Remote OK...");

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

    for (const item of jobs) {
      if (!item.position || !item.company) {
        continue;
    }

      console.log(`➡️ ${item.company} - ${item.position}`);

      // Find or create company
      const company = await prisma.company.upsert({
        where: {
          name: item.company,
        },
        update: {},
        create: {
          name: item.company || "Unknown Company",
        },
      });

      // Skip duplicates
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
      
      const region = classifyRegion(item);
      const country = extractCountry(item);
      
      await prisma.job.create({
        data: {
          companyId: company.id,
          title: item.position,
          description: item.description || "",
          location: item.location || "Remote",

          country,
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

    console.log(`Imported ${imported} jobs.`);

    return imported;
  } catch (err) {
    console.error("❌ RemoteOK Import Error");
    console.error(err);
    return 0;
  }
}

module.exports = collectRemoteOK;