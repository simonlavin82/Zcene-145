import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 8080;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!GEMINI_API_KEY) {
  console.warn("WARNING: GEMINI_API_KEY is not set in the environment. The API proxy will likely fail.");
}

// Proxy all requests starting with /api/gemini/ to the Google GenAI API
app.use(
  '/api/gemini',
  createProxyMiddleware({
    target: 'https://generativelanguage.googleapis.com',
    changeOrigin: true,
    pathRewrite: {
      '^/api/gemini': '', // Remove the /api/gemini prefix when forwarding
    },
    on: {
      proxyReq: (proxyReq, req, res) => {
        // Inject the API key securely on the backend
        if (GEMINI_API_KEY) {
          proxyReq.setHeader('x-goog-api-key', GEMINI_API_KEY);
        }
      },
    },
  })
);

// Serve the static files from the React/Vite build output
app.use(express.static(path.join(__dirname, 'dist')));

// Fallback for SPA (React Router)
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Zcene Server listening on port ${PORT}`);
});
