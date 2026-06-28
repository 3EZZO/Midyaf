import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";


export default defineConfig({
  root: path.resolve(__dirname),
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Midyaf',
        short_name: 'Midyaf',
        description: 'AI-powered royal hospitality and event logistics command center for Riyadh',
        theme_color: '#000000',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      },
      devOptions: {
        enabled: true,
        type: 'module',
      }
    })
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@shared": path.resolve(__dirname, "../shared")
    }
  },
  server: {
    port: 3000,
    proxy: {
      "/api": "http://localhost:5005",
      "/socket.io": {
        target: "ws://localhost:5005",
        ws: true
      }
    },
    fs: {
      allow: [path.resolve(__dirname), path.resolve(__dirname, "../shared")]
    }
  },
  build: {
    outDir: "dist",
    emptyOutDir: true
  }
});
