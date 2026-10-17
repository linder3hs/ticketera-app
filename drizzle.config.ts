import { existsSync } from "node:fs";

import { defineConfig } from "drizzle-kit";

// Local: variables from .env. In the migrate container they come from the environment.
if (existsSync(".env")) process.loadEnvFile(".env");

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema",
  out: "./drizzle",
  dbCredentials: { url: process.env.DATABASE_URL! },
});
