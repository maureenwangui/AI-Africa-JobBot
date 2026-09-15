// services/jobCollector/fuzu.js
// Fuzu (fuzu.com/kenya) — Kenya career/recruitment platform.
// No public API, so this parses server-rendered listing pages with cheerio.
//
// NOTE: this is HTML scraping, not an official API — Fuzu's markup can
// change without notice, which would break the selectors below. Kept
// defensive (each card parsed in its own try/catch) so one bad card never
// kills the whole run.
const axios = require("axios");
const cheerio = require("cheerio");
const prisma = require("../../confiq/prisma");

const BASE_URL = "https://www.fuzu.com";
const PAGES_TO_SCRAPE = 5; // ~10 jobs/page → ~50 jobs per run

async function fetchPage(url) {
  const { data } = await axios.get(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
    },
    timeout: 15000,
  });
  return cheerio.load(data);
}

async function collectFuzu() {
  console.log("Collecting Kenya jobs from Fuzu...");

  let imported = 0;

  try {
    for (let page = 1; page <= PAGES_TO_SCRAPE; page++) {
      const url = `${BASE_URL}/kenya/job?page=${page}`;

      let $;
      try {
        $ = await fetchPage(url);
      } catch (err) {
        console.error(`❌ Fuzu page ${page} fetch failed:`, err.message);
        break;
      }

      // Individual job pages use the PLURAL "/kenya/jobs/<slug>" path, while
      // listing/category/city pages use singular "/kenya/job/...". That
      // plural/singular split is the stable anchor here (not a CSS class).
      const jobLinks = $('a[href*="/kenya/jobs/"]');

      if (jobLinks.length === 0) {
        console.log(`No job cards found on page ${page} — stopping.`);
        break;
      }

      console.log(`📦 Page ${page}: ${jobLinks.length} listing links found`);

      const seenOnPage = new Set();

      for (const el of jobLinks.toArray()) {
        try {
          const $link = $(el);
          const href = $link.attr("href");
          if (!href || seenOnPage.has(href)) continue;
          seenOnPage.add(href);

          const title = $link.text().trim();
          if (!title || title.length < 3) continue;

          const applyUrl = href.startsWith("http") ? href : `${BASE_URL}${href}`;

          // Card = nearest block ancestor around the title link (usually the
          // <h2>/<h3> wrapping it, one level up from that).
          const $titleBlock = $link.closest("h1, h2, h3").length
            ? $link.closest("h1, h2, h3")
            : $link.parent();
          const $card = $titleBlock.parent();

          const cardText = $card.text().replace(/\s+/g, " ").trim();

          // Company name: the plain text immediately before the title
          // heading inside the card (Fuzu lists it just above the job title).
          let company = $card
            .contents()
            .filter(function () {
              return this.type === "text" || this.name === "p" || this.name === "span";
            })
            .first()
            .text()
            .trim();
          if (!company) {
            company = $card.find("p, span").first().text().trim();
          }
          if (!company || company.length > 100) company = "Unknown Company";

          // City: Fuzu tags each card with a city link right after the title.
          const cityLink = $card.find('a[href*="/kenya/job/"]').first().text().trim();
          const city = cityLink && cityLink !== "Kenya" ? cityLink.replace("•", "").trim() : "";

          const companyRecord = await prisma.company.upsert({
            where: { name: company },
            update: {},
            create: { name: company, country: "KENYA" },
          });

          const exists = await prisma.job.findFirst({
            where: { title, companyId: companyRecord.id },
          });

          if (exists) {
            console.log(`⏭ Already exists: ${title}`);
            continue;
          }

          await prisma.job.create({
            data: {
              companyId: companyRecord.id,
              title,
              description: cardText.slice(0, 2000),
              location: city ? `${city}, Kenya` : "Kenya",
              city,
              country: "KENYA",
              region: "EAST_AFRICA",
              remoteType: "ONSITE",
              employmentType: "FULL_TIME",
              source: "Fuzu",
              applyUrl,
              status: "ACTIVE",
            },
          });

          imported++;
        } catch (cardErr) {
          console.error("⏭ Skipped a Fuzu card due to parse error:", cardErr.message);
        }
      }
    }

    console.log(`Imported ${imported} Fuzu jobs.`);
    return imported;
  } catch (err) {
    console.error("❌ Fuzu Import Error");
    console.error(err.message);
    return imported;
  }
}

module.exports = collectFuzu;
