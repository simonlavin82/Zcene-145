"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const processCurationJob_1 = require("./processCurationJob");
process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
// Mock the event
const event = {
    data: {
        data: () => ({
            userId: "test",
            status: "pending",
            jobType: "graph_generation",
            inputPayload: {
                artists: "Snapcase",
                projectId: "test_project"
            }
        })
    },
    params: { jobId: "job-1787326178963-owuz9cspd" }
};
async function test() {
    try {
        console.log("Running processCurationJob manually...");
        // @ts-ignore
        await processCurationJob_1.processCurationJob.run(event);
        console.log("Done.");
    }
    catch (err) {
        console.error("Crash:", err);
    }
}
test();
//# sourceMappingURL=test_run.js.map