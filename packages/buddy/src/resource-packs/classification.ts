import { createHash } from "node:crypto"
import path from "node:path"
import { nativeResourceDefinitionFromPath } from "@buddy/workspace-file-policy"
import {
  RESOURCE_PACK_LARGE_TEXT_THRESHOLD_BYTES,
  RESOURCE_PACK_ROOT_DIR,
  type ResourceClassification,
  type ResourceFormat,
} from "./contracts"

const RESOURCE_LIKE_EXTENSIONS = new Set([".html", ".htm", ".xhtml"])
const DIRECT_TEXT_EXTENSIONS = new Set([
  ".txt",
  ".md",
  ".markdown",
  ".json",
  ".jsonc",
  ".yaml",
  ".yml",
  ".csv",
])
const DIRECT_CODE_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".mts",
  ".cts",
  ".json5",
  ".css",
  ".scss",
  ".sass",
  ".less",
  ".py",
  ".rb",
  ".go",
  ".rs",
  ".java",
  ".kt",
  ".kts",
  ".swift",
  ".c",
  ".cc",
  ".cpp",
  ".h",
  ".hpp",
  ".sh",
  ".bash",
  ".zsh",
  ".ps1",
  ".php",
  ".lua",
  ".sql",
  ".proto",
  ".toml",
  ".ini",
  ".cfg",
  ".conf",
  ".svelte",
  ".vue",
  ".astro",
  ".mdx",
  ".xml",
])

export function classifyResourcePath(
  sourcePath: string,
  sourceSizeBytes?: number,
): ResourceClassification {
  const extension = path.extname(sourcePath).toLowerCase()
  const nativeResource = nativeResourceDefinitionFromPath(sourcePath)

  if (nativeResource) {
    return {
      kind: "pack",
      format: nativeResource.format,
      mime: "text/plain",
    }
  }

  if (RESOURCE_LIKE_EXTENSIONS.has(extension)) {
    return {
      kind: "pack",
      format: resourceFormatForExtension(extension),
      mime: "text/plain",
    }
  }

  if (DIRECT_TEXT_EXTENSIONS.has(extension)) {
    return {
      kind:
        sourceSizeBytes !== undefined && sourceSizeBytes > RESOURCE_PACK_LARGE_TEXT_THRESHOLD_BYTES
          ? "pack"
          : "direct",
      format: resourceFormatForExtension(extension),
      mime: "text/plain",
    }
  }

  if (DIRECT_CODE_EXTENSIONS.has(extension)) {
    return {
      kind: "direct",
      format: "code",
      mime: "text/plain",
    }
  }

  return {
    kind: "direct",
    format: "unknown",
    mime: "text/plain",
  }
}

export function createResourcePackKey(directory: string, sourcePath: string) {
  const sourceRelpath = path.relative(directory, sourcePath) || path.basename(sourcePath)
  const segments = sourceRelpath.split(path.sep)
  if (segments.length >= 2 && segments[0] === RESOURCE_PACK_ROOT_DIR) {
    const resourceFolder = segments[1]?.trim()
    if (resourceFolder) return resourceFolder
  }
  const slug = sourceRelpath
    .replace(/[^\w.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
  const hash = createHash("sha256").update(sourceRelpath).digest("hex").slice(0, 12)
  return `${slug || "resource"}-${hash}`
}

function resourceFormatForExtension(extension: string): ResourceFormat {
  switch (extension) {
    case ".html":
    case ".htm":
    case ".xhtml":
      return extension.slice(1) as Extract<ResourceFormat, "html" | "htm" | "xhtml">
    case ".md":
    case ".markdown":
      return "markdown"
    case ".txt":
      return "text"
    case ".json":
    case ".jsonc":
      return extension.slice(1) as Extract<ResourceFormat, "json" | "jsonc">
    case ".yaml":
    case ".yml":
    case ".csv":
      return extension.slice(1) as Extract<ResourceFormat, "yaml" | "yml" | "csv">
    default:
      return "unknown"
  }
}
