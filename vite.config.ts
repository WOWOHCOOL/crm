import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
  plugins: [react(), cloudflare()],
  base: '/',
  build: {
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('node_modules')) {
            if (id.includes('react') || id.includes('react-dom') || id.includes('react-router')) return 'vendor';
            if (id.includes('antd') || id.includes('@ant-design')) return 'antd';
            if (id.includes('@tanstack')) return 'query';
            if (id.includes('@supabase')) return 'supabase';
            if (id.includes('recharts')) return 'charts';
          }
        },
      },
    },
  },
});
