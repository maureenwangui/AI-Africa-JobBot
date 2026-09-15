// services/jobCollector/brightmonday.js
// BrighterMonday Kenya (brightermonday.co.ke) — Kenya's largest local job board.
// No public API, so this parses the server-rendered listing pages with cheerio.
//
// NOTE: this is HTML scraping, not an official API. BrighterMonday's markup
// can change without notice, which would break the selectors below — if a
// run suddenly imports 0 jobs, that's the first thing to check (log a
// sample $.html() and re-diff the selectors). Kept deliberately defensive
// (each card is parsed in its own try/catch) so one bad card never kills
// the whole run.
const axios = require("axios");
const cheerio = require("cheerio");
const prisma = require("../../confiq/prisma");

const BASE_URL = "https://www.brightermonday.co.ke";
const PAGES_TO_SCRAPE = 5; // ~16 jobs/page → ~80 jobs per run

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

async function collectBrightMonday() {
  console.log("Collecting Kenya jobs from BrighterMonday...");

  let imported = 0;

  try {
    for (let page = 1; page <= PAGES_TO_SCRAPE; page++) {
      const url = page === 1 ? `${BASE_URL}/jobs` : `${BASE_URL}/jobs?page=${page}`;

      let $;
      try {
        $ = await fetchPage(url);
      } catch (err) {
        console.error(`❌ BrighterMonday page ${page} fetch failed:`, err.message);
        break; // stop paginating if the site rejects/blocks us
      }

      // Job detail links follow the pattern /listings/<slug> — this is the
      // most stable anchor to key off, independent of CSS class names.
      const jobLinks = $('a[href^="/listings/"], a[href*="brightermonday.co.ke/listings/"]');

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

          const title = $link.text().trim() || $link.attr("title")?.trim();
          if (!title) continue;

          const applyUrl = href.startsWith("http") ? href : `${BASE_URL}${href}`;

          // The job card is the nearest ancestor block containing this link.
          // Walk up a few levels to capture company/location/description text
          // that sits alongside the title link, without relying on class names.
          const $card = $link.closest("article, li, div").length
            ? $link.closest("article, li, div")
            : $link.parent().parent();

          const cardText = $card
            .text()
            .replace(/\s+/g, " ")
            .trim();

          // Company: try an explicit /company/ link inside the card first.
          let company = $card.find('a[href*="/company/"]').first().text().trim();
          if (!company) company = "Unknown Company";

          // City: BrighterMonday tags cards with known location words.
          const knownCities = [
            "Nairobi",
            "Mombasa",
            "Kisumu",
            "Nakuru",
            "Thika",
            "Rest of Kenya",
            "Outside Kenya",
            "Remote (Work From Home)",
            "Kenya",
          ];
          const city = knownCities.find((c) => cardText.includes(c)) || "";

          const remoteType = city.toLowerCase().includes("remote") ? "REMOTE" : "ONSITE";

          if (!title || title.length < 3) continue;

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
              location: city || "Kenya",
              city: city && city !== "Kenya" && city !== "Outside Kenya" ? city : "",
              country: "KENYA",
              region: "EAST_AFRICA",
              remoteType,
              employmentType: cardText.includes("Part Time") ? "PART_TIME" : "FULL_TIME",
              source: "BrighterMonday",
              applyUrl,
              status: "ACTIVE",
            },
          });

          imported++;
        } catch (cardErr) {
          console.error("⏭ Skipped a BrighterMonday card due to parse error:", cardErr.message);
        }
      }
    }

    console.log(`Imported ${imported} BrighterMonday jobs.`);
    return imported;
  } catch (err) {
    console.error("❌ BrighterMonday Import Error");
    console.error(err.message);
    return imported;
  }
}

module.exports = collectBrightMonday;
