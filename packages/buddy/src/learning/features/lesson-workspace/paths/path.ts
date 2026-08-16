import path from "node:path"
import type { TeachingLanguage } from "../model/types"

const LANGUAGE_EXTENSIONS = {
  txt: ".txt",
  ts: ".ts",
  tsx: ".tsx",
  js: ".js",
  jsx: ".jsx",
  py: ".py",
  go: ".go",
  rs: ".rs",
  java: ".java",
  kt: ".kt",
  php: ".php",
  rb: ".rb",
  swift: ".swift",
  cs: ".cs",
  fs: ".fs",
  c: ".c",
  cpp: ".cpp",
  sh: ".sh",
  yaml: ".yml",
  json: ".json",
  md: ".md",
  html: ".html",
  css: ".css",
  sql: ".sql",
  lua: ".lua",
  dart: ".dart",
  zig: ".zig",
  vue: ".vue",
  svelte: ".svelte",
  astro: ".astro",
  ml: ".ml",
  ex: ".ex",
  gleam: ".gleam",
  nix: ".nix",
  tf: ".tf",
  typ: ".typ",
  clj: ".clj",
  hs: ".hs",
  jl: ".jl",
  xml: ".xml",
} satisfies Record<TeachingLanguage, string>

function isTeachingLanguage(value: string): value is TeachingLanguage {
  return value in LANGUAGE_EXTENSIONS
}

const EXTENSION_TO_LANGUAGE: { [extension: string]: TeachingLanguage } = {}
for (const language of Object.keys(LANGUAGE_EXTENSIONS)) {
  if (!isTeachingLanguage(language)) continue
  EXTENSION_TO_LANGUAGE[LANGUAGE_EXTENSIONS[language]] = language
}
const DOT_PATH_SEGMENTS = new Set([".", ".."])

EXTENSION_TO_LANGUAGE[".yaml"] = "yaml"
EXTENSION_TO_LANGUAGE[".htm"] = "html"
EXTENSION_TO_LANGUAGE[".cc"] = "cpp"
EXTENSION_TO_LANGUAGE[".cxx"] = "cpp"
EXTENSION_TO_LANGUAGE[".bash"] = "sh"
EXTENSION_TO_LANGUAGE[".zsh"] = "sh"

function safeSessionID(sessionID: string) {
  const normalized = sessionID.trim()
  if (!normalized) {
    return "default"
  }

  const safeID = normalized.replace(/[^a-zA-Z0-9._-]/g, "_")
  if (DOT_PATH_SEGMENTS.has(safeID)) {
    throw new Error("Session ID must stay inside the teaching workspace")
  }

  return safeID
}

function extension(language: TeachingLanguage) {
  return LANGUAGE_EXTENSIONS[language]
}

function sanitizeRelativePath(input: string) {
  const normalized = input.trim().replaceAll("\\", "/")
  if (!normalized) {
    throw new Error("File path is required")
  }

  const collapsed = path.posix.normalize(normalized).replace(/^\/+/, "")
  if (
    !collapsed ||
    DOT_PATH_SEGMENTS.has(collapsed) ||
    collapsed.startsWith("../") ||
    collapsed.includes("/../")
  ) {
    throw new Error("File path must stay inside the teaching workspace")
  }

  return collapsed
}

function withLanguageExtension(filepath: string, language: TeachingLanguage) {
  const ext = path.posix.extname(filepath)
  if (ext && EXTENSION_TO_LANGUAGE[ext]) {
    return filepath.slice(0, filepath.length - ext.length) + extension(language)
  }
  return `${filepath}${extension(language)}`
}

export const TeachingPath = {
  extension,
  root(directory: string, sessionID: string) {
    return path.join(directory, ".buddy", "teaching", safeSessionID(sessionID))
  },
  metadata(directory: string, sessionID: string) {
    return path.join(TeachingPath.root(directory, sessionID), "workspace.json")
  },
  filesRoot(directory: string, sessionID: string) {
    return path.join(TeachingPath.root(directory, sessionID), "files")
  },
  checkpointsRoot(directory: string, sessionID: string) {
    return path.join(TeachingPath.root(directory, sessionID), "checkpoints")
  },
  normalizeRelativePath(relativePath: string, language?: TeachingLanguage) {
    const sanitized = sanitizeRelativePath(relativePath)
    if (language) {
      return withLanguageExtension(sanitized, language)
    }

    const ext = path.posix.extname(sanitized)
    if (ext && EXTENSION_TO_LANGUAGE[ext]) {
      return sanitized
    }

    throw new Error("File path must include a supported extension or an explicit language")
  },
  languageFromRelativePath(relativePath: string): TeachingLanguage {
    const ext = path.posix.extname(relativePath)
    const language = EXTENSION_TO_LANGUAGE[ext]
    if (language) {
      return language
    }
    throw new Error(`Unsupported teaching file extension: ${ext || "(none)"}`)
  },
  workspaceFile(directory: string, sessionID: string, relativePath: string) {
    return path.join(
      TeachingPath.filesRoot(directory, sessionID),
      sanitizeRelativePath(relativePath),
    )
  },
  checkpointSnapshotFile(directory: string, sessionID: string, relativePath: string) {
    return path.join(
      TeachingPath.checkpointsRoot(directory, sessionID),
      sanitizeRelativePath(relativePath),
    )
  },
}
