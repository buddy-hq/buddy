import { DatabasePath as OpenCodeDatabasePath } from "@buddy/opencode-adapter/storage-db"

const IN_MEMORY_DATABASE = ":memory:"
const WINDOWS_PLATFORM = "win32"
const CHAT_TRANSCRIPT_TABLES =
  "session(id, parent_id, title), message(session_id, data JSON), part(session_id, message_id, data JSON)"
const WINDOWS_SQLITE_NOTE =
  " Windows does not ship a sqlite3 command; if none is available, install a SQLite client first."

type ChatTranscriptPointer = {
  databasePath?: string
  howToRead: string
}

function sqliteToolNote(): string {
  return process.platform === WINDOWS_PLATFORM ? WINDOWS_SQLITE_NOTE : ""
}

function chatTranscriptPointer(): ChatTranscriptPointer {
  const databasePath = OpenCodeDatabasePath()
  if (databasePath === IN_MEMORY_DATABASE) {
    return {
      howToRead:
        "Chat tabs are not readable through Bench, and this runtime keeps chats in memory, so their transcripts cannot be read from disk.",
    }
  }
  return {
    databasePath,
    howToRead: `Chat tabs are not readable through Bench. A chat tab's target.sessionID identifies its transcript in this SQLite database: ${CHAT_TRANSCRIPT_TABLES}. Read it with your own tools, read-only, filtering by that session ID.${sqliteToolNote()}`,
  }
}

function chatMentionPointer(): string {
  const databasePath = OpenCodeDatabasePath()
  if (databasePath === IN_MEMORY_DATABASE) {
    return "This runtime keeps chats in memory, so the transcript of the chat mentioned just before cannot be read from disk."
  }
  return `The chat mentioned just before has its transcript in the SQLite database ${databasePath}, tables ${CHAT_TRANSCRIPT_TABLES}. Read it with your own tools, read-only, filtering by that chat's ID.${sqliteToolNote()}`
}

export { chatMentionPointer, chatTranscriptPointer }
export type { ChatTranscriptPointer }
