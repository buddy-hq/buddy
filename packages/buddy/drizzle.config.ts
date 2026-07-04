import os from "node:os"
import path from "node:path"
import { defineConfig } from "drizzle-kit"
import {
  BUDDY_APP_NAME,
  BUDDY_ENV,
  XDG_DEFAULT_SEGMENTS,
  resolveConfiguredPath,
} from "./src/storage/constants"

const dataDirectory = path.resolve(
  resolveConfiguredPath(process.env[BUDDY_ENV.DATA_DIR]) ??
    path.join(os.homedir(), ...XDG_DEFAULT_SEGMENTS.data, BUDDY_APP_NAME),
)

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/**/*.sql.ts",
  out: "./migration",
  dbCredentials: {
    url: path.join(dataDirectory, "buddy.db"),
  },
})
