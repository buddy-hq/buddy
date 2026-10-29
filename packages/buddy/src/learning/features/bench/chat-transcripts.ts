type ChatTranscriptPointer = {
  howToRead: string
}

function chatTranscriptPointer(): ChatTranscriptPointer {
  return {
    howToRead:
      "Chat tabs are not readable through Bench. Read a chat tab's transcript with bench_read_chat using its target.sessionID.",
  }
}

function chatMentionPointer(): string {
  return "Read the chat mentioned just before with bench_read_chat using its ID."
}

export { chatMentionPointer, chatTranscriptPointer }
export type { ChatTranscriptPointer }
