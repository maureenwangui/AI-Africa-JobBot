const collectReliefWeb    = require("./reliefweb");
const collectAdzuna       = require("./adzuna");
const collectRemoteOK     = require("./remoteok");     // filtered to Kenya-eligible remote roles
const collectBrightMonday = require("./brightmonday"); // HTML scrape
const collectFuzu         = require("./fuzu");         // HTML scrape

async function runCollector(name, fn) {
    try {
        const count = await fn();
        console.log(`✅ ${name}: ${count} jobs imported`);
        return count;
    } catch (err) {
        console.error(`${name} collector failed:`, err.message);
        return 0;
    }
}

async function collectJobs() {

    console.log("====================================");
    console.log("Starting Kenya Job Collection");
    console.log("====================================");

    let totalImported = 0;

    totalImported += await runCollector("ReliefWeb",     collectReliefWeb);
    totalImported += await runCollector("Adzuna",        collectAdzuna);
    totalImported += await runCollector("RemoteOK",      collectRemoteOK);
    totalImported += await runCollector("BrighterMonday", collectBrightMonday);
    totalImported += await runCollector("Fuzu",          collectFuzu);

    // Work254 — could not confirm this domain/site actually exists during
    // research (no working URL found). Add it here once you confirm the
    // real URL — happy to build its collector once we have that.
    // const collectWork254 = require("./work254");
    // totalImported += await runCollector("Work254", collectWork254);

    console.log("====================================");
    console.log(`Total Imported: ${totalImported} jobs`);
    console.log("Finished Job Collection");
    console.log("====================================");

    return totalImported;
}

module.exports = {
    collectJobs
};
