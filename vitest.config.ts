import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["server/**/*.test.ts", "client/src/**/*.test.tsx"],
    environment: "node",
    passWithNoTests: true
  }
});
