import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  outDir: '../public',
  vite: {
    plugins: [tailwindcss()],
    server: {
      proxy: {
        '/learn': 'http://localhost:8787',
        '/inject': 'http://localhost:8787',
        '/query': 'http://localhost:8787',
        '/stats': 'http://localhost:8787',
        '/learnings': 'http://localhost:8787',
        '/mcp': 'http://localhost:8787',
      },
    },
  },
});
