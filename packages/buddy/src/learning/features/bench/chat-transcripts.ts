import { openCodeRuntimePaths } from "../../../opencode-runtime/env"

const IN_MEMORY_DATABASE = ":memory:"
const WINDOWS_PLATFORM = "win32"
const CHAT_TRANSCRIPT_TABLES =
  "session_v2(id, parent_id, title), session_message(id, session_id, type, seq, time_created, data JSON)"
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
  const databasePath = openCodeRuntimePaths().database
  if (databasePath === IN_MEMORY_DATABASE) {
    return {
      howToRead:
        "Chat tabs are not readable through Bench, and this runtime keeps chats in memory, so their transcripts cannot be read from disk.",
    }
  }
  return {
    databasePath,
    howToRead: `Chat tabs are not readable through Bench. A chat tab's target.sessionID identifies its transcript in this SQLite database: ${CHAT_TRANSCRIPT_TABLES}. Read session_message rows ordered by seq; user text is data.text, assistant text and tool outputs are in data.content. Use your own tools read-only, filtering by that session ID.${sqliteToolNote()}`,
  }
}

function chatMentionPointer(): string {
  const databasePath = openCodeRuntimePaths().database
  if (databasePath === IN_MEMORY_DATABASE) {
    return "This runtime keeps chats in memory, so the transcript of the chat mentioned just before cannot be read from disk."
  }
  return `The chat mentioned just before has its transcript in the SQLite database ${databasePath}, tables ${CHAT_TRANSCRIPT_TABLES}. Read session_message rows ordered by seq; user text is data.text, assistant text and tool outputs are in data.content. Use your own tools read-only, filtering by that chat's ID.${sqliteToolNote()}`
}

export { chatMentionPointer, chatTranscriptPointer }
export type { ChatTranscriptPointer }
