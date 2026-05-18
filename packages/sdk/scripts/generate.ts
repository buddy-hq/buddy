#!/usr/bin/env bun
import { createClient } from "@hey-api/openapi-ts"
import fs from "fs/promises"
import path from "path"

// Generate SDK from running backend
const API_URL = process.env.API_URL || "http://localhost:3000/doc"
const OPENAPI_PATH = path.resolve("openapi.json")

console.log(`Generating SDK from ${API_URL}...`)

type OpenAPISchema = {
  paths?: Record<string, unknown>
  [key: string]: unknown
}

const SCALAR_OPENAPI_TYPES = new Set(["string", "number", "integer", "boolean"])

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
}

type OpenApiApp = {
  request: (input: string) => Promise<Response>
}

function isOpenApiApp(value: unknown): value is OpenApiApp {
  return isRecord(value) && typeof value.request === "function"
}

async function loadBackendApp() {
  const backendModuleName: string = "@buddy/backend"
  const loaded = await import(backendModuleName)
  if (isRecord(loaded) && "app" in loaded && isOpenApiApp(loaded.app)) {
    return loaded.app
  }

  throw new Error("Unable to load Buddy backend app for OpenAPI generation.")
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

function isScalarAllOfSchema(value: Record<string, unknown>) {
  return typeof value.type === "string" && SCALAR_OPENAPI_TYPES.has(value.type) && Array.isArray(value.allOf)
}

function getScalarAllOfLayers(value: Record<string, unknown>) {
  if (!isScalarAllOfSchema(value)) {
    return undefined
  }

  const allOf = value.allOf
  if (!Array.isArray(allOf)) {
    return undefined
  }

  const layers = allOf.filter(isRecord)
  if (layers.length !== allOf.length) {
    return undefined
  }

  return layers
}

function canFlattenScalarAllOf(
  parent: Record<string, unknown>,
  layers: Record<string, unknown>[],
) {
  const seen = new Map<string, unknown>()
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

function normalizeOpenApiValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeOpenApiValue(item))
  }

  if (!isRecord(value)) {
    return value
  }

  const normalized = Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, normalizeOpenApiValue(item)]),
  )

  // @hey-api/openapi-ts currently degrades primitive schemas shaped like
  // `{ type: "string", allOf: [{ pattern: "^ses" }] }` to `unknown`.
  // Flatten equivalent scalar constraints before generation so the SDK keeps
  // concrete string/number types without changing runtime validation.
  if (!isScalarAllOfSchema(normalized)) {
    return normalized
  }

  const layers = getScalarAllOfLayers(normalized)
  if (!layers) {
    return normalized
  }
  if (!canFlattenScalarAllOf(normalized, layers)) {
    return normalized
  }

  const { allOf: _allOf, ...rest } = normalized
  return Object.assign({}, ...layers, rest)
}

function normalizeSchemaForSdk(schema: OpenAPISchema): OpenAPISchema {
  const normalized = normalizeOpenApiValue(schema)
  if (!isRecord(normalized)) {
    return schema
  }

  return {
    ...normalized,
    ...(isRecord(normalized.paths) ? { paths: normalized.paths } : {}),
  }
}

async function loadSchema() {
  try {
    const response = await fetch(API_URL)
    if (!response.ok) {
      throw new Error(`Failed to fetch OpenAPI schema from ${API_URL}: ${response.status}`)
    }
    const schema = (await response.json()) as OpenAPISchema
    return normalizeSchemaForSdk(normalizePaths(schema))
  } catch {
    const app = await loadBackendApp()
    const response = await app.request("/doc")
    if (!response.ok) {
      throw new Error(`Failed to fetch OpenAPI schema from backend app: ${response.status}`)
    }
    const schema = (await response.json()) as OpenAPISchema
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
