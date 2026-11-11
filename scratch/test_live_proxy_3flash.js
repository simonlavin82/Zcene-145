fetch(`https://zcene.online/api/gemini/v1beta/models/gemini-3-flash-preview:generateContent`, {
  method: 'POST',
  headers: { 
    'Content-Type': 'application/json', 
    'x-goog-api-key': 'backend-proxy-key',
    'Accept-Encoding': 'identity'
  },
  body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: "Hello" }] }] })
}).then(async res => {
  console.log('Status 3-flash:', res.status);
}).catch(err => console.error(err));
