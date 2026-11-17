import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
    plugins: [react()],
    resolve: {
      alias: {
        '@': root,
      },
    },
    build: {
        rollupOptions: {
            output: {
                manualChunks(id) {
                    if (!id.includes('node_modules'))
                        return;
                    if (id.includes('recharts'))
                        return 'charts';
                    if (id.includes('leaflet') || id.includes('react-leaflet'))
                        return 'maps';
                    if (id.includes('react-dom') || id.includes('react-router') || id.includes('/react/'))
                        return 'react-vendor';
                    if (id.includes('zustand') || id.includes('@tanstack') || id.includes('axios'))
                        return 'data-vendor';
                },
            },
        },
    },
    server: {
        host: '0.0.0.0',
        port: 5173,
        proxy: {
            '/api': { target: 'http://localhost:4000', changeOrigin: true },
        },
    },
    preview: {
        host: '0.0.0.0',
        port: 4173,
    },
});
