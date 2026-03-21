import os from 'node:os'
import path from 'node:path'
import { defineConfig } from 'drizzle-kit'

const dataDirectory = path.resolve(
  process.env.BUDDY_DATA_DIR ?? path.join(os.homedir(), '.local', 'share', 'buddy'),
)

export default defineConfig({
  dialect: 'sqlite',
  schema: './src/**/*.sql.ts',
  out: './migration',
  dbCredentials: {
    url: path.join(dataDirectory, 'buddy.db'),
  },
})
