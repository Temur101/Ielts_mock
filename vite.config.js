import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { ieltsGeminiApiPlugin } from './src/lib/ai/api-plugin.js';

export default defineConfig({
  plugins: [
    react(),
    ieltsGeminiApiPlugin(),
  ],
  server: {
    port: 5173,
    host: true,
  },
});
