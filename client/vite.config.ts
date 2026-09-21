import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  root: path.resolve(__dirname),
  plugins: [
    react(),
    VitePWA({
      registerType: "prompt",
      manifest: {
        id: "/",
        name: "Midyaf",
        short_name: "Midyaf",
        description:
          "AI-powered royal hospitality and sovereign event logistics command center",
        lang: "ar",
        dir: "rtl",
        start_url: "/",
        scope: "/",
        display: "standalone",
        orientation: "any",
        theme_color: "#090C15",
        background_color: "#090C15",
        icons: [
          { src: "pwa-192x192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512x512.png", sizes: "512x512", type: "image/png" },
          {
            src: "pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable"
          }
        ]
      },
      workbox: {
        // Keep the demo alive on venue Wi-Fi: map tiles and fonts are served
        // from cache once a rehearsal has warmed them.
        // Hosts must match components/map/constants.ts TILE_LAYERS.
        runtimeCaching: [
          {
            // World_Imagery (server.) and the Dark Gray fallback (services.)
            urlPattern: /^https:\/\/(server|services)\.arcgisonline\.com\//i,
            handler: "CacheFirst",
            options: {
              cacheName: "map-tiles-esri",
              expiration: {
                maxEntries: 2000,
                maxAgeSeconds: 60 * 60 * 24 * 30
              },
              cacheableResponse: { statuses: [0, 200] }
            }
          },
          {
            urlPattern: /^https:\/\/[a-c]\.tile\.openstreetmap\.org\//i,
            handler: "CacheFirst",
            options: {
              cacheName: "map-tiles-osm",
              expiration: {
                maxEntries: 1000,
                maxAgeSeconds: 60 * 60 * 24 * 30
              },
              cacheableResponse: { statuses: [0, 200] }
            }
          }
        ]
      },
      devOptions: {
        enabled: false
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
      // The self-hosted @fontsource files live in the root node_modules, which
      // is outside the client root; without this the dev server 403s them.
      allow: [
        path.resolve(__dirname),
        path.resolve(__dirname, "../shared"),
        path.resolve(__dirname, "../node_modules")
      ]
    }
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules")) {
            if (id.includes("leaflet")) return "vendor-leaflet";
            if (id.includes("lucide-react")) return "vendor-lucide";
            if (id.includes("socket.io-client") || id.includes("engine.io"))
              return "vendor-socket";
            if (id.includes("react") || id.includes("scheduler"))
              return "vendor-react";
          }
        }
      }
    }
  }
});
