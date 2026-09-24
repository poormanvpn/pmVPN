import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      // The isomorphic keyring module only — the rest of crypto-ssh needs node:crypto.
      '@pmvpn/crypto-ssh/keyring': fileURLToPath(new URL('../crypto-ssh/src/keyring.ts', import.meta.url)),
    },
  },
  server: {
    port: 1420,
    host: true,  // expose to LAN (0.0.0.0)
    proxy: {
      '/api': {
        target: 'http://localhost:2203',
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
});
