import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@shared": path.resolve(__dirname, "shared"),
      "@": path.resolve(__dirname, "client/src")
    }
  },
  test: {
    include: ["server/**/*.test.ts", "client/src/**/*.test.tsx"],
    environment: "node",
    passWithNoTests: true
  }
});

