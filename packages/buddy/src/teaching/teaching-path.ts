import path from "node:path"
import type { TeachingLanguage } from "./types.js"

const LANGUAGE_EXTENSIONS: Record<TeachingLanguage, string> = {
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
}

const EXTENSION_TO_LANGUAGE = Object.fromEntries(
  Object.entries(LANGUAGE_EXTENSIONS).map(([language, extension]) => [extension, language]),
) as Record<string, TeachingLanguage>

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

  return normalized.replace(/[^a-zA-Z0-9._-]/g, "_")
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
  if (!collapsed || collapsed === "." || collapsed.startsWith("../") || collapsed.includes("/../")) {
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
  lessonFile(directory: string, sessionID: string, language: TeachingLanguage) {
    return path.join(TeachingPath.root(directory, sessionID), `lesson${extension(language)}`)
  },
  checkpointFile(directory: string, sessionID: string, language: TeachingLanguage) {
    return path.join(TeachingPath.root(directory, sessionID), `checkpoint${extension(language)}`)
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
    return path.join(TeachingPath.filesRoot(directory, sessionID), sanitizeRelativePath(relativePath))
  },
  checkpointSnapshotFile(directory: string, sessionID: string, relativePath: string) {
    return path.join(TeachingPath.checkpointsRoot(directory, sessionID), sanitizeRelativePath(relativePath))
  },
}
