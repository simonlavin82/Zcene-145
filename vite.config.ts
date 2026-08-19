import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    base: '/',
    server: {
      port: 3000,
      host: '0.0.0.0',
      allowedHosts: [
        'www.zcene.online',
        'remix-145-zcene-live-800155534113.us-west1.run.app'
      ],
      proxy: {
        '/api': {
          target: 'https://zcene.online',
          changeOrigin: true,
          timeout: 60000,
          proxyTimeout: 60000,
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq, req) => {
              console.log(`[Proxy Request] Path: ${req.url} -> Target: ${proxyReq.path}`);
            });
            proxy.on('proxyRes', (proxyRes, req) => {
              console.log(`[Proxy Response] Status: ${proxyRes.statusCode} for ${req.url}`);
            });
            proxy.on('error', (err: any, req, res) => {
              if (err.code === 'ECONNREFUSED') {
                // Silently handle missing backend, application will fallback to Firebase direct reads
                if (res && typeof (res as any).writeHead === 'function') {
                    (res as any).writeHead(503, { 'Content-Type': 'application/json' });
                    (res as any).end(JSON.stringify({ error: 'Backend service unavailable (falling back to local cache)' }));
                }
              } else {
                console.error(`[Proxy Error] ${err.message} for ${req.url}`);
              }
            });
          }
        }
      }
    },
    plugins: [react(), tailwindcss()],
    define: {
      'process.env.API_KEY': env.GEMINI_API_KEY ? JSON.stringify(env.GEMINI_API_KEY) : 'window.GEMINI_API_KEY',
      'process.env.GEMINI_API_KEY': env.GEMINI_API_KEY ? JSON.stringify(env.GEMINI_API_KEY) : 'window.GEMINI_API_KEY'
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
        ...(env.VITE_USE_MOCKS === 'true' ? {
          'firebase/app': path.resolve(__dirname, './mocks/firebaseAppMock.ts'),
          'firebase/auth': path.resolve(__dirname, './mocks/firebaseAuthMock.ts'),
          'firebase/firestore': path.resolve(__dirname, './mocks/firebaseFirestoreMock.ts')
        } : {})
      }
    }
  };
});