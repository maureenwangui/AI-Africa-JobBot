// services/jobCollector/reliefweb.js
// ReliefWeb — humanitarian / NGO / development jobs, filtered to Kenya.
// Free public API, no key required. Docs: https://apidoc.reliefweb.int
const axios = require("axios");
const prisma = require("../../confiq/prisma");

const RELIEFWEB_API = "https://api.reliefweb.int/v1/jobs";

async function collectReliefWeb() {
  console.log("Collecting Kenya jobs from ReliefWeb...");

  try {
    const response = await axios.post(
      `${RELIEFWEB_API}?appname=africa-jobbot`,
      {
        filter: {
          field: "country.iso3",
          value: "ken",
        },
        fields: {
          include: [
            "title",
            "body-html",
            "url",
            "url_alias",
            "source.name",
            "country.name",
            "city.name",
            "type.name",
            "career_categories.name",
            "date.closing",
            "date.created",
          ],
        },
        sort: ["date.created:desc"],
        limit: 100,
      },
      { headers: { "Content-Type": "application/json" } }
    );

    const items = response.data?.data || [];
    console.log(`📦 Downloaded ${items.length} ReliefWeb jobs for Kenya`);

    let imported = 0;

    for (const item of items) {
      const f = item.fields || {};
      if (!f.title) continue;

      const companyName = f.source?.[0]?.name || "Unknown Organization";
      const city = f.city?.[0]?.name || "";
      const applyUrl = f.url_alias || f.url || "";

      const company = await prisma.company.upsert({
        where: { name: companyName },
        update: {},
        create: { name: companyName, country: "KENYA" },
      });

      const exists = await prisma.job.findFirst({
        where: { title: f.title, companyId: company.id },
      });

      if (exists) {
        console.log(`⏭ Already exists: ${f.title}`);
        continue;
      }

      await prisma.job.create({
        data: {
          companyId: company.id,
          title: f.title,
          description: f["body-html"] || "",
          location: city ? `${city}, Kenya` : "Kenya",
          city,
          country: "KENYA",
          region: "EAST_AFRICA",
          remoteType: "ONSITE",
          employmentType: "FULL_TIME",
          applicationDeadline: f.date?.closing ? new Date(f.date.closing) : null,
          source: "ReliefWeb",
          applyUrl,
          status: "ACTIVE",
        },
      });

      imported++;
    }

    console.log(`Imported ${imported} ReliefWeb jobs.`);
    return imported;
  } catch (err) {
    console.error("❌ ReliefWeb Import Error");
    console.error(err.response?.data || err.message);
    return 0;
  }
}

module.exports = collectReliefWeb;
