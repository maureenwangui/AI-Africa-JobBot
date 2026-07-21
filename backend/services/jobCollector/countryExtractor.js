// services/jobCollector/countryExtractor.js

function extractCountry(job) {
    const text = [
        job.location || "",
        job.city || "",
        job.country || "",
        job.title || "",
        job.position || "",
        job.description || ""
    ]
    .join(" ")
    .toLowerCase();

    const countries = {
        KENYA: ["kenya", "nairobi", "mombasa", "kisumu", "nakuru"],
        UGANDA: ["uganda", "kampala"],
        TANZANIA: ["tanzania", "dar es salaam", "arusha"],
        RWANDA: ["rwanda", "kigali"],
        BURUNDI: ["burundi", "bujumbura"],
        SOUTH_SUDAN: ["south sudan", "juba"],
        ETHIOPIA: ["ethiopia", "addis ababa"],
        NIGERIA: ["nigeria", "lagos", "abuja"],
        GHANA: ["ghana", "accra"],
        SOUTH_AFRICA: ["south africa", "johannesburg", "cape town"],
        EGYPT: ["egypt", "cairo"],
        MOROCCO: ["morocco", "casablanca"],
        USA: ["usa", "united states", "new york", "california", "texas"],
        UK: ["uk", "united kingdom", "england", "london"],
        CANADA: ["canada", "toronto", "vancouver"],
        INDIA: ["india"],
        GERMANY: ["germany"],
        FRANCE: ["france"],
        SPAIN: ["spain"],
        ITALY: ["italy"],
        NETHERLANDS: ["netherlands"],
        AUSTRALIA: ["australia", "sydney", "melbourne"]
    };

    for (const [country, keywords] of Object.entries(countries)) {
        if (keywords.some(keyword => text.includes(keyword))) {
            return country;
        }
    }

    return null;
}

module.exports = { extractCountry };