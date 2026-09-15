// services/jobCollector/adzuna.js
// Adzuna — aggregates real, locally-posted vacancies for Kenya (api.adzuna.com/.../jobs/ke/...).
// Free tier API keys: https://developer.adzuna.com/
const axios = require("axios");
const prisma = require("../../confiq/prisma");

const ADZUNA_API = "https://api.adzuna.com/v1/api/jobs/ke/search";

function mapEmploymentType(contractTime) {
  if (contractTime === "part_time") return "PART_TIME";
  return "FULL_TIME";
}

async function collectAdzuna() {
  const appId = process.env.ADZUNA_APP_ID;
  const appKey = process.env.ADZUNA_APP_KEY;

  if (!appId || !appKey) {
    console.log("Adzuna not configured (ADZUNA_APP_ID / ADZUNA_APP_KEY missing) — skipping");
    return 0;
  }

  console.log("Collecting Kenya jobs from Adzuna...");

  try {
    let imported = 0;

    // Adzuna paginates 1-indexed; pull a few pages worth of Kenya listings.
    for (let page = 1; page <= 3; page++) {
      const response = await axios.get(`${ADZUNA_API}/${page}`, {
        params: {
          app_id: appId,
          app_key: appKey,
          results_per_page: 50,
          "content-type": "application/json",
        },
      });

      const results = response.data?.results || [];
      if (!results.length) break;

      console.log(`📦 Page ${page}: ${results.length} Adzuna listings`);

      for (const item of results) {
        if (!item.title || !item.company?.display_name) continue;

        const companyName = item.company.display_name;
        const city = item.location?.area?.[item.location.area.length - 1] || "";

        const company = await prisma.company.upsert({
          where: { name: companyName },
          update: {},
          create: { name: companyName, country: "KENYA" },
        });

        const exists = await prisma.job.findFirst({
          where: { title: item.title, companyId: company.id },
        });

        if (exists) {
          console.log(`⏭ Already exists: ${item.title}`);
          continue;
        }

        await prisma.job.create({
          data: {
            companyId: company.id,
            title: item.title,
            description: item.description || "",
            location: item.location?.display_name || "Kenya",
            city,
            country: "KENYA",
            region: "EAST_AFRICA",
            remoteType: "ONSITE",
            employmentType: mapEmploymentType(item.contract_time),
            salaryMin: item.salary_min ? Math.round(item.salary_min) : null,
            salaryMax: item.salary_max ? Math.round(item.salary_max) : null,
            currency: "KES",
            source: "Adzuna",
            applyUrl: item.redirect_url || "",
            status: "ACTIVE",
          },
        });

        imported++;
      }
    }

    console.log(`Imported ${imported} Adzuna jobs.`);
    return imported;
  } catch (err) {
    console.error("❌ Adzuna Import Error");
    console.error(err.response?.data || err.message);
    return 0;
  }
}

module.exports = collectAdzuna;
