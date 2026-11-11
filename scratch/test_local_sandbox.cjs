const { generateGraphDataBackend } = require('../functions/lib/services/curatorService.js');

// Inject API Key
process.env.GEMINI_API_KEY = 'AQ.Ab8RN6Kr_t7aKgc1YX8QqeoOcrBftopz1FXWPfh26q0mmftdEw';

async function runSandbox() {
  console.log("=========================================================");
  console.log("   ZCENE LOCAL SANDBOX TESTING");
  console.log("=========================================================\n");

  const targetSeed = "Spaced";
  console.log(`[Sandbox] Testing generateGraphDataBackend with payload: ${targetSeed}`);

  try {
    const start = Date.now();
    const result = await generateGraphDataBackend(targetSeed);
    const duration = Date.now() - start;

    console.log(`\n[Sandbox] SUCCESS! Completed in ${duration}ms`);
    console.log("[Sandbox] Returned Graph Nodes:");
    result.nodes.forEach(n => {
      console.log(`  - ${n.id} (${n.type})`);
    });
    console.log(`[Sandbox] Synthesis Rationale snippet:\n`, result.synthesisRationale ? result.synthesisRationale.substring(0, 200) + '...' : 'NONE');

  } catch (error) {
    console.error("\n=========================================================");
    console.error("   ❌ CATCH BLOCK TRIGGERED - RAW ERROR DUMP");
    console.error("=========================================================");
    
    // Dump everything we can
    console.error("Name:", error.name);
    console.error("Message:", error.message);
    if (error.status) console.error("Status:", error.status);
    if (error.code) console.error("Code:", error.code);
    
    console.error("\nRaw Error Object:", JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
    console.error("\nStack Trace:");
    console.error(error.stack);
  }
}

runSandbox().then(() => process.exit(0));
