import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Only the production build gets a CSP meta tag. In dev, Vite's HMR needs inline scripts.
const csp = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  "connect-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
].join('; ');

export default defineConfig({
  base: './',
  plugins: [
    react(),
    {
      name: 'island-csp',
      apply: 'build',
      transformIndexHtml: (html) =>
        html.replace('<!--CSP-->', `<meta http-equiv="Content-Security-Policy" content="${csp}" />`),
    },
  ],
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  build: { outDir: 'dist', emptyOutDir: true },
});
