#!/usr/bin/env bun
import { createClient } from "@hey-api/openapi-ts"
import fs from "fs/promises"
import path from "path"
import { z } from "zod"

// Generate SDK from running backend
const API_URL = process.env.API_URL || "http://localhost:3000/doc"
const OPENAPI_PATH = path.resolve("openapi.json")

console.log(`Generating SDK from ${API_URL}...`)

const JsonValueSchema = z.json()
const JsonObjectSchema = z.record(z.string(), JsonValueSchema)
const OpenApiDocumentSchema = JsonObjectSchema.and(
  z.object({ paths: JsonObjectSchema.optional() }),
)
const ScalarAllOfSchema = z.object({
  type: z.enum(["string", "number", "integer", "boolean"]),
  allOf: z.array(JsonObjectSchema),
})

type JsonValue = z.infer<typeof JsonValueSchema>
type JsonObject = z.infer<typeof JsonObjectSchema>
type OpenApiDocument = z.infer<typeof OpenApiDocumentSchema>

async function loadBackendApp() {
  const loaded = await import("@buddy/backend")
  return loaded.app
}

function normalizePaths(schema: OpenApiDocument): OpenApiDocument {
  if (!schema.paths) {
    return schema
  }

  const normalized: JsonObject = {}
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

function canFlattenScalarAllOf(parent: JsonObject, layers: JsonObject[]) {
  const seen = new Map<string, JsonValue>()
  for (const [key, value] of Object.entries(parent)) {
    if (key === "allOf") continue
    seen.set(key, value)
  }

  for (const layer of layers) {
    if (["$ref", "allOf", "anyOf", "oneOf", "not"].some((key) => key in layer)) {
      return false
    }

    for (const [key, value] of Object.entries(layer)) {
      const existing = seen.get(key)
      if (existing !== undefined && existing !== value) {
        return false
      }
      seen.set(key, value)
    }
  }

  return true
}

function normalizeOpenApiValue(value: JsonValue): JsonValue {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeOpenApiValue(item))
  }

  if (!(value instanceof Object)) {
    return value
  }

  return normalizeOpenApiObject(value)
}

function normalizeOpenApiObject(value: JsonObject): JsonObject {
  const normalized = Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, normalizeOpenApiValue(item)]),
  )

  // @hey-api/openapi-ts currently degrades primitive schemas shaped like
  // `{ type: "string", allOf: [{ pattern: "^ses" }] }` to `unknown`.
  // Flatten equivalent scalar constraints before generation so the SDK keeps
  // concrete string/number types without changing runtime validation.
  const scalarAllOf = ScalarAllOfSchema.safeParse(normalized)
  if (!scalarAllOf.success) {
    return normalized
  }
  if (!canFlattenScalarAllOf(normalized, scalarAllOf.data.allOf)) {
    return normalized
  }

  const { allOf: _allOf, ...rest } = normalized
  return Object.assign({}, ...scalarAllOf.data.allOf, rest)
}

function normalizeSchemaForSdk(schema: OpenApiDocument): OpenApiDocument {
  return OpenApiDocumentSchema.parse(normalizeOpenApiObject(schema))
}

async function loadSchema() {
  try {
    const response = await fetch(API_URL)
    if (!response.ok) {
      throw new Error(`Failed to fetch OpenAPI schema from ${API_URL}: ${response.status}`)
    }
    const schema = OpenApiDocumentSchema.parse(await response.json())
    return normalizeSchemaForSdk(normalizePaths(schema))
  } catch {
    const app = await loadBackendApp()
    const response = await app.request("/doc")
    if (!response.ok) {
      throw new Error(`Failed to fetch OpenAPI schema from backend app: ${response.status}`)
    }
    const schema = OpenApiDocumentSchema.parse(await response.json())
    return normalizeSchemaForSdk(normalizePaths(schema))
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
