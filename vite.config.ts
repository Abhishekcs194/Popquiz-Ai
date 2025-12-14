import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react()],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.RAWG_API_KEY': JSON.stringify(env.RAWG_API_KEY || env.VITE_RAWG_API_KEY),
        'process.env.TMDB_API_KEY': JSON.stringify(env.TMDB_API_KEY || env.VITE_TMDB_API_KEY),
        'process.env.TENOR_API_KEY': JSON.stringify(env.TENOR_API_KEY || env.VITE_TENOR_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
