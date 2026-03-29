import { defineConfig } from 'vite';

export default defineConfig({
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
