import { spawn } from 'child_process';

const server = spawn('node', ['--env-file=.env', 'server.js'], { stdio: 'inherit' });

setTimeout(async () => {
  try {
    const res = await fetch(`http://127.0.0.1:8080/api/gemini/v1beta/models/gemini-2.5-flash:generateContent`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json', 
        'x-goog-api-key': 'backend-proxy-key',
        'Accept-Encoding': 'identity'
      },
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: "Hello" }] }] })
    });
    console.log('Status:', res.status);
    const text = await res.text();
    console.log('Response:', text.substring(0, 500));
  } catch(e) {
    console.error(e);
  } finally {
    server.kill();
  }
}, 2000);
