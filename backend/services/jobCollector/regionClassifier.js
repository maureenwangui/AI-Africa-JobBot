// services/jobCollector/regionClassifier.js

const { extractCountry } = require("./countryExtractor");

function classifyRegion(job) {
  const text = [
    job.location || "",
    job.city || "",
    job.country || "",
    job.title || "",
    job.position || "",
    job.description || "",
  ]
    .join(" ")
    .toLowerCase();

  // -------------------------------------------------
  // GLOBAL JOBS
  // -------------------------------------------------
  if (
    text.includes("worldwide") ||
    text.includes("global") ||
    text.includes("anywhere") ||
    text.includes("work from anywhere") ||
    text.includes("remote worldwide")
  ) {
    return "GLOBAL";
  }

  // -------------------------------------------------
  // AFRICA-WIDE JOBS
  // -------------------------------------------------
  if (
    text.includes("africa") ||
    text.includes("african") ||
    text.includes("open to africa")
  ) {
    return "AFRICA";
  }

  // -------------------------------------------------
  // EAST AFRICA-WIDE JOBS
  // -------------------------------------------------
  if (
    text.includes("east africa") ||
    text.includes("east african")
  ) {
    return "EAST_AFRICA";
  }

  // -------------------------------------------------
  // DETECT COUNTRY
  // -------------------------------------------------
  const country = extractCountry(job);

  switch (country) {

    // East Africa
    case "KENYA":
    case "UGANDA":
    case "TANZANIA":
    case "RWANDA":
    case "BURUNDI":
    case "SOUTH_SUDAN":
      return "EAST_AFRICA";

    // Africa
    case "ETHIOPIA":
    case "NIGERIA":
    case "GHANA":
    case "SOUTH_AFRICA":
    case "EGYPT":
    case "MOROCCO":
      return "AFRICA";

    // Europe
    case "GERMANY":
    case "FRANCE":
    case "SPAIN":
    case "ITALY":
    case "NETHERLANDS":
    case "UK":
      return "EUROPE";

    // North America
    case "USA":
    case "CANADA":
      return "NORTH_AMERICA";

    // Asia
    case "INDIA":
      return "ASIA";

    // Australia
    case "AUSTRALIA":
      return "AUSTRALIA";

    default:
      return "OTHER";
  }
}

module.exports = { classifyRegion };