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

export const TeachingPath = {
  root(directory: string, sessionID: string) {
    return path.join(directory, ".buddy", "teaching", safeSessionID(sessionID))
  },
  metadata(directory: string, sessionID: string) {
    return path.join(TeachingPath.root(directory, sessionID), "workspace.json")
  },
  lessonFile(directory: string, sessionID: string, language: TeachingLanguage) {
    return path.join(TeachingPath.root(directory, sessionID), `lesson${extension(language)}`)
  },
  checkpointFile(directory: string, sessionID: string, language: TeachingLanguage) {
    return path.join(TeachingPath.root(directory, sessionID), `checkpoint${extension(language)}`)
  },
}
