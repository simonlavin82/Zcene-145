const fs = require('fs');

async function main() {
  const fileContent = fs.readFileSync('scratch/gcp_raw_logs.json', 'utf8');
  if (!fileContent.trim()) {
    console.log("Log file is empty.");
    return;
  }
  
  const entries = JSON.parse(fileContent);
  console.log(`Parsed ${entries.length} log entries:`);
  
  // Sort entries chronologically (oldest first)
  entries.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  
  for (const entry of entries) {
    const timestamp = entry.timestamp;
    const severity = entry.severity || 'DEFAULT';
    const msg = entry.textPayload || entry.jsonPayload?.message || JSON.stringify(entry.jsonPayload);
    console.log(`[${timestamp}] [${severity}] ${msg}`);
  }
}

main().catch(console.error);
