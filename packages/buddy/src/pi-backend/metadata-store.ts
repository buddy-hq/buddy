import fs from "node:fs"
import path from "node:path"
import { Global } from "../storage/global"

const BUDDY_AGENT_STATE_DIR_NAME = "agent"
const BUDDY_SESSION_METADATA_FILE_NAME = "session-metadata.json"
const METADATA_KEY_SEPARATOR = "\u001f"
const JSON_INDENT_SPACES = 2

export type PiSessionMetadata = {
  title?: string
  archived?: number
  revert?: {
    messageID: string
    partID?: string
    snapshot?: string
    diff?: string
  }
  revertState?: {
    originalLeafId?: string | null
    workspaceSnapshotKey?: string
  }
}

type MetadataFile = Record<string, PiSessionMetadata>

function metadataFilePath() {
  const directory = path.join(Global.Path.state, BUDDY_AGENT_STATE_DIR_NAME)
  fs.mkdirSync(directory, { recursive: true })
  return path.join(directory, BUDDY_SESSION_METADATA_FILE_NAME)
}

function metadataKey(input: { directory: string; sessionID: string }) {
  return `${input.directory}${METADATA_KEY_SEPARATOR}${input.sessionID}`
}

function readMetadataFile(): MetadataFile {
  const filepath = metadataFilePath()
  if (!fs.existsSync(filepath)) return {}

  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(filepath, "utf8"))
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {}
    const metadata: MetadataFile = {}
    for (const [key, value] of Object.entries(parsed)) {
      if (!value || typeof value !== "object" || Array.isArray(value)) continue
      const revert =
        "revert" in value &&
        value.revert &&
        typeof value.revert === "object" &&
        !Array.isArray(value.revert) &&
        "messageID" in value.revert &&
        typeof value.revert.messageID === "string"
          ? {
              messageID: value.revert.messageID,
              ...("partID" in value.revert && typeof value.revert.partID === "string"
                ? { partID: value.revert.partID }
                : {}),
              ...("snapshot" in value.revert && typeof value.revert.snapshot === "string"
                ? { snapshot: value.revert.snapshot }
                : {}),
              ...("diff" in value.revert && typeof value.revert.diff === "string"
                ? { diff: value.revert.diff }
                : {}),
            }
          : undefined

      metadata[key] = {
        ...("title" in value && typeof value.title === "string" ? { title: value.title } : {}),
        ...("archived" in value && typeof value.archived === "number"
          ? { archived: value.archived }
          : {}),
        ...(revert ? { revert } : {}),
        ...("revertState" in value &&
        value.revertState &&
        typeof value.revertState === "object" &&
        !Array.isArray(value.revertState)
          ? {
              revertState: {
                ...("originalLeafId" in value.revertState &&
                (typeof value.revertState.originalLeafId === "string" ||
                  value.revertState.originalLeafId === null)
                  ? { originalLeafId: value.revertState.originalLeafId }
                  : {}),
                ...("workspaceSnapshotKey" in value.revertState &&
                typeof value.revertState.workspaceSnapshotKey === "string"
                  ? { workspaceSnapshotKey: value.revertState.workspaceSnapshotKey }
                  : {}),
              },
            }
          : {}),
      }
    }
    return metadata
  } catch {
    return {}
  }
}

function writeMetadataFile(metadata: MetadataFile) {
  fs.writeFileSync(metadataFilePath(), JSON.stringify(metadata, null, JSON_INDENT_SPACES))
}

export function readPiSessionMetadata(input: { directory: string; sessionID: string }) {
  return readMetadataFile()[metadataKey(input)]
}

export function updatePiSessionMetadata(input: {
  directory: string
  sessionID: string
  patch: PiSessionMetadata
}) {
  const metadata = readMetadataFile()
  const key = metadataKey(input)
  const next = {
    ...metadata[key],
    ...input.patch,
  }
  metadata[key] = next
  writeMetadataFile(metadata)
  return next
}
