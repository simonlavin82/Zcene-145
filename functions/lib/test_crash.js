"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const curatorService_1 = require("./services/curatorService");
const dotenv_1 = require("dotenv");
(0, dotenv_1.config)({ path: ".env.local" });
async function run() {
    try {
        const res = await (0, curatorService_1.validateSeedOriginBackend)("Snapcase");
        console.log("Success:", res);
    }
    catch (e) {
        console.error("Crash:", e);
    }
}
run();
//# sourceMappingURL=test_crash.js.map