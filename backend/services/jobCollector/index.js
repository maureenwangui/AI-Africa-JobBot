const collectRemoteOK = require("./remoteok");

// Future collectors
// const collectRemotive = require("./remotive");
// const collectJobicy = require("./jobicy");
// const collectBrightMonday = require("./brightmonday");
// const collectLinkedIn = require("./linkedin");

async function collectJobs() {

    console.log("====================================");
    console.log("Starting Africa Job Collection");
    console.log("====================================");

    let totalImported = 0;

    try {
        const remoteImported = await collectRemoteOK();

        console.log(`✅ RemoteOK: ${remoteImported} jobs imported`);

        totalImported += remoteImported;

    } catch (err) {

        console.error("RemoteOK collector failed:", err.message);

    }

    /*
    try {

        const remotiveImported = await collectRemotive();

        console.log(`✅ Remotive: ${remotiveImported} jobs imported`);

        totalImported += remotiveImported;

    } catch (err) {

        console.error("Remotive collector failed:", err.message);

    }

    try {

        const jobicyImported = await collectJobicy();

        console.log(`✅ Jobicy: ${jobicyImported} jobs imported`);

        totalImported += jobicyImported;

    } catch (err) {

        console.error("Jobicy collector failed:", err.message);

    }

    try {

        const brightMondayImported = await collectBrightMonday();

        console.log(`✅ BrightMonday: ${brightMondayImported} jobs imported`);

        totalImported += brightMondayImported;

    } catch (err) {

        console.error("BrightMonday collector failed:", err.message);

    }
    */

    console.log("====================================");
    console.log(`Total Imported: ${totalImported} jobs`);
    console.log("Finished Job Collection");
    console.log("====================================");

    return totalImported;
}

module.exports = {
    collectJobs
};