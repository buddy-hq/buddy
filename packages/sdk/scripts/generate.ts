#!/usr/bin/env bun
import { createClient } from "@hey-api/openapi-ts"
import fs from "fs/promises"
import path from "path"
import { generateSpecs } from "hono-openapi"

// Generate SDK from running backend
const API_URL = process.env.API_URL || "http://localhost:3000/doc"
const OPENAPI_PATH = path.resolve("openapi.json")

console.log(`Generating SDK from ${API_URL}...`)

type OpenAPISchema = {
  paths?: Record<string, unknown>
  [key: string]: unknown
}

function normalizePaths(schema: OpenAPISchema) {
  if (!schema.paths) {
    return schema
  }

  const normalized: Record<string, unknown> = {}
  for (const [routePath, definition] of Object.entries(schema.paths)) {
    if (routePath === "/api") {
      normalized["/"] = definition
      continue
    }

    if (routePath.startsWith("/api/")) {
      normalized[routePath.slice(4)] = definition
      continue
    }

    normalized[routePath] = definition
  }

  return {
    ...schema,
    paths: normalized,
  }
}

async function loadSchema() {
  try {
    const response = await fetch(API_URL)
    if (!response.ok) {
      throw new Error(`Failed to fetch OpenAPI schema from ${API_URL}: ${response.status}`)
    }
    const schema = (await response.json()) as OpenAPISchema
    return normalizePaths(schema)
  } catch {
    const { app } = await import("../../buddy/src/index.ts")
    const schema = (await generateSpecs(app, {
      documentation: {
        info: {
          title: "Buddy API",
          version: "1.0.0",
          description: "Buddy API Documentation",
        },
        openapi: "3.1.1",
      },
    })) as OpenAPISchema

    return normalizePaths(schema)
  }
}

const schema = await loadSchema()
await fs.writeFile(OPENAPI_PATH, JSON.stringify(schema, null, 2), "utf-8")

await createClient({
  input: OPENAPI_PATH,
  output: {
    path: "./src/gen",
    tsConfigPath: path.resolve("tsconfig.json"),
    clean: true,
  },
  plugins: [
    {
      name: "@hey-api/typescript",
      exportFromIndex: false,
    },
    {
      name: "@hey-api/sdk",
      operations: {
        strategy: "single",
        containerName: "BuddyClient",
        methods: "instance",
      },
      exportFromIndex: false,
      auth: false,
      paramsStructure: "flat",
    },
    {
      name: "@hey-api/client-fetch",
      exportFromIndex: false,
      baseUrl: "/api",
    },
  ],
})

await fs.rm(OPENAPI_PATH, { force: true })

console.log("✅ SDK generated successfully!")
