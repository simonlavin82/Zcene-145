"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const processCurationJob_1 = require("./processCurationJob");
const dotenv_1 = require("dotenv");
(0, dotenv_1.config)({ path: ".env.local" });
const mockEvent = {
    data: {
        data: () => ({
            artists: "Snapcase",
            status: "curating"
        }),
        id: "job-1787326178963-owuz9cspd"
    }
};
async function run() {
    try {
        // The Cloud Function is a firestore trigger. Let's see how it's exported.
        console.log("processCurationJob type:", typeof processCurationJob_1.processCurationJob);
        // Since it's an onDocumentCreated, it expects a FirestoreEvent.
        // Let's just execute it manually if we can, or just read the code to see what could throw.
    }
    catch (e) {
        console.error("Crash:", e);
    }
}
run();
//# sourceMappingURL=test_job.js.map