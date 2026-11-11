fetch(`https://zcene.online/api/gemini/v1beta/models/gemini-2.5-flash:generateContent`, {
  method: 'POST',
  headers: { 
    'Content-Type': 'application/json', 
    'x-goog-api-key': 'backend-proxy-key',
    'Accept-Encoding': 'identity'
  },
  body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: "Hello" }] }] })
}).then(async res => {
  console.log('Status:', res.status);
  const text = await res.text();
  console.log('Response:', text.substring(0, 500));
}).catch(err => console.error(err));
