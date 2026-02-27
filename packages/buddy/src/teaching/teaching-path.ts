import path from "node:path"
import type { TeachingLanguage } from "./types.js"

function safeSessionID(sessionID: string) {
  const normalized = sessionID.trim()
  if (!normalized) {
    return "default"
  }

  return normalized.replace(/[^a-zA-Z0-9._-]/g, "_")
}

function extension(language: TeachingLanguage) {
  return language === "tsx" ? ".tsx" : ".ts"
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
  if (ext === ".ts" || ext === ".tsx") {
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
  normalizeRelativePath(relativePath: string, language: TeachingLanguage = "ts") {
    return withLanguageExtension(sanitizeRelativePath(relativePath), language)
  },
  languageFromRelativePath(relativePath: string): TeachingLanguage {
    return relativePath.endsWith(".tsx") ? "tsx" : "ts"
  },
  workspaceFile(directory: string, sessionID: string, relativePath: string) {
    return path.join(TeachingPath.filesRoot(directory, sessionID), sanitizeRelativePath(relativePath))
  },
  checkpointSnapshotFile(directory: string, sessionID: string, relativePath: string) {
    return path.join(TeachingPath.checkpointsRoot(directory, sessionID), sanitizeRelativePath(relativePath))
  },
}
