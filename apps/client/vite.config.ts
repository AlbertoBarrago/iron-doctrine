import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { buildAssets } from '../../scripts/build-assets.mjs';

export default defineConfig({
  plugins: [
    {
      name: 'iron-production-assets',
      async buildStart() {
        await buildAssets();
      },
    },
    react(),
  ],
  server: {
    // Cross-origin isolation enables SharedArrayBuffer for zero-copy snapshot transfer.
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  worker: {
    format: 'es',
  },
});
