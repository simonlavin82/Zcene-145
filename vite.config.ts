import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
      allowedHosts: [
        'www.zcene.online',
        'remix-145-zcene-live-800155534113.us-west1.run.app'
      ],
      proxy: {
        '/api/gemini': {
          target: 'https://generativelanguage.googleapis.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/gemini/, ''),
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq) => {
              if (env.GEMINI_API_KEY) {
                proxyReq.setHeader('x-goog-api-key', env.GEMINI_API_KEY);
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
        '@': path.resolve(__dirname, '.')
      }
    }
  };
});