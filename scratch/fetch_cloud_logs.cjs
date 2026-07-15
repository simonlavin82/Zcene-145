const { cert } = require('firebase-admin');

const serviceAccount = require('../firebase-service-account.json');
const cred = cert(serviceAccount);

async function main() {
  console.log("Getting access token...");
  const tokenObj = await cred.getAccessToken();
  const token = tokenObj.access_token;
  
  const projectId = 'zcene-production';
  const filter = 'resource.type="cloud_run_revision" AND resource.labels.service_name="oncurationjobcreated"';
  
  console.log("Fetching logs from GCP Logging API...");
  const response = await fetch(`https://logging.googleapis.com/v2/entries:list`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      resourceNames: [`projects/${projectId}`],
      filter: filter,
      orderBy: 'timestamp desc',
      pageSize: 50
    })
  });
  
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`GCP Logging API error: ${response.status} ${response.statusText} - ${errText}`);
  }
  
  const data = await response.json();
  if (!data.entries || data.entries.length === 0) {
    console.log("No log entries found matching filter.");
    return;
  }
  
  console.log(`Found ${data.entries.length} log entries:`);
  for (const entry of data.entries) {
    const timestamp = entry.timestamp;
    const severity = entry.severity || 'DEFAULT';
    const message = entry.textPayload || entry.jsonPayload?.message || JSON.stringify(entry.jsonPayload);
    console.log(`[${timestamp}] [${severity}] ${message}`);
  }
}

main().catch(console.error);
