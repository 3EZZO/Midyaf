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
      includeAssets: [
        "favicon.ico",
        "apple-touch-icon.png",
        "icons/apple-touch-icon-v2.png",
        "icons/favicon-v2.svg",
        "icons/favicon-v2.png",
        "sw-push.js"
      ],
      manifest: {
        id: "/",
        name: "Midyaf",
        short_name: "Midyaf",
        description:
          "AI-powered royal hospitality and event logistics operations center",
        lang: "ar",
        dir: "rtl",
        start_url: "/",
        scope: "/",
        display: "standalone",
        orientation: "any",
        theme_color: "#0D0E12",
        background_color: "#0D0E12",
        icons: [
          {
            src: "/icons/pwa-192x192-v2.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any"
          },
          {
            src: "/icons/pwa-512x512-v2.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any"
          },
          {
            src: "/icons/pwa-maskable-512x512-v2.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable"
          }
        ]
      },
      workbox: {
        importScripts: ["/sw-push.js"],
        // Keep the app alive offline on venue Wi-Fi / basement car parks: all
        // entry deps, portal chunks, fonts, and v2 brand assets are precached.
        // Only unused font subsets and duplicate root icon fallbacks are omitted.
        globPatterns: ["**/*.{js,css,html,woff2,png,jpeg,svg,ico,webmanifest}"],
        globIgnores: [
          "**/*-{cyrillic,cyrillic-ext,greek,greek-ext,vietnamese}-*",
          "pwa-192x192.png",
          "pwa-512x512.png",
          "pwa-maskable-512x512.png",
          "apple-touch-icon.png",
          "favicon.png",
          "favicon.svg"
        ],
        // Server routes are never the SPA: a navigation to a report PDF or an
        // upload must reach the network, not the cached index.html.
        navigateFallbackDenylist: [
          /^\/api\//,
          /^\/uploads\//,
          /^\/socket\.io\//
        ],
        // Drop precaches from older builds when this service worker activates.
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            // Content-hashed lazy portal JS/CSS/font chunks: cache on first use.
            urlPattern: /\/assets\/.*\.(?:js|css|woff2)$/i,
            handler: "CacheFirst",
            options: {
              cacheName: "midyaf-assets-v1",
              expiration: {
                maxEntries: 120,
                maxAgeSeconds: 60 * 60 * 24 * 30
              },
              cacheableResponse: { statuses: [200] }
            }
          },
          {
            // Only two Esri base maps: World_Imagery (server.) and the
            // tactical Dark Gray Canvas (services.). No street map and no
            // OpenStreetMap volunteer tile server is requested or cached.
            // Tiles load with CORS, so only real 200s are cached: an error
            // or opaque (status 0) response is never replayed from cache.
            // The cache name is versioned; older caches, including
            // "map-tiles-esri-v2" with retired street tiles, are deleted by
            // the app at startup (components/map/constants.ts RETIRED_TILE_CACHES).
            urlPattern: /^https:\/\/(server|services)\.arcgisonline\.com\//i,
            handler: "CacheFirst",
            options: {
              cacheName: "map-tiles-esri-v3",
              expiration: {
                maxEntries: 2000,
                maxAgeSeconds: 60 * 60 * 24 * 30
              },
              cacheableResponse: { statuses: [200] }
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
            if (/[\\/]node_modules[\\/](recharts|d3-[^\\/]+)[\\/]/.test(id))
              return "vendor-charts";
            // Keep clsx + tailwind-merge (used by cn.ts across the login entry)
            // in vendor-react so Rollup never places clsx inside vendor-charts
            // (recharts also imports clsx) and forces login to preload charts.
            // Strict package-name match so react-markdown, react-i18next,
            // @radix-ui/react-*, and qrcode.react stay code-split with their callers.
            if (/[\\/]node_modules[\\/](react|react-dom|scheduler|clsx|tailwind-merge)[\\/]/.test(id))
              return "vendor-react";
          }
        }
      }
    }
  }
});
