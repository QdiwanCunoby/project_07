import type { Config } from "jest";

const config: Config = {
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: ["**/*.test.ts"],
  // Carica .env.test in ogni file di test PRIMA degli import di src/ (env.ts e PrismaClient leggono process.env)
  setupFiles: ["<rootDir>/tests/setup-env.ts"],
  // Coverage su tutto src/, anche sui file che nessun test importa (altrimenti la percentuale sarebbe gonfiata)
  collectCoverageFrom: ["src/**/*.ts", "!src/**/*.test.ts", "!src/index.ts", "!src/types/**"],
  coverageThreshold: {
    global: { branches: 75, lines: 80 },
  },
};

export default config;
