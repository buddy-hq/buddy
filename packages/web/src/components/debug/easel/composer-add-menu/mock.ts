import {
  AppWindowIcon,
  CpuSettingsIcon,
  GitBranch,
  GraduationCapIcon,
  Layers,
  Lightbulb,
  NoteIcon,
  PenLineIcon,
  PencilRuler,
  PlugIcon,
  PresentationIcon,
  QuoteIcon,
  Redo2Icon,
  RubiksCube,
  ScanText,
  Sigma,
  SquarePen,
  Undo2Icon,
  UploadIcon,
  WorkflowIcon,
  type AppIcon,
} from "@/icons/app-icons"
import {
  BENCH_BOARD_ART,
  BENCH_CHAT_ART,
  BENCH_NOTE_ART,
  BENCH_RESOURCE_ART,
} from "@/components/bench/bench-action-art"

// ---------------------------------------------------------------------------
// Everything the composer can trigger, sorted by where the result lands. That is
// the segregation rule: if two things land in the same place, they are the same
// kind of thing and share a section.
// ---------------------------------------------------------------------------

export type EntryGroup = "attach" | "reference" | "make" | "skill" | "mode" | "chat"

export type RefKind = "tab" | "book" | "note" | "chat" | "board" | "file"

export type MenuEntry = {
  readonly id: string
  readonly group: EntryGroup
  readonly title: string
  readonly description: string
  readonly keywords?: string
  readonly icon?: AppIcon
  readonly art?: string
  readonly letter?: string
  readonly refKind?: RefKind
  readonly shortcut?: string
  readonly disabledReason?: string
  /** A category row that opens a sub-list instead of doing something. */
  readonly drill?: EntryGroup
}

export const GROUP_META = {
  attach: {
    label: "Attach",
    lands: "Attachment tray",
    effect: "A copy goes with this message.",
    examples: "Files and images, current tab, screenshot, sketch, quote",
  },
  reference: {
    label: "From this notebook",
    lands: "Pill in the text",
    effect: "Buddy reads it where it lives; nothing is copied.",
    examples: "Open tabs, books, notes, chats, boards, files",
  },
  make: {
    label: "Make",
    lands: "Intent chip",
    effect: "Buddy turns this message into a thing.",
    examples: "Quiz, flashcards, diagram, board, note",
  },
  skill: {
    label: "Skills",
    lands: "Intent chip",
    effect: "Buddy answers this message a particular way.",
    examples: "Socratic tutor, Feynman check, essay feedback",
  },
  mode: {
    label: "Mode",
    lands: "Toolbar toggle",
    effect: "Stays on for every message until you turn it off.",
    examples: "Note mode, think longer",
  },
  chat: {
    label: "This chat",
    lands: "Happens now",
    effect: "Acts on the conversation; nothing is sent.",
    examples: "New, branch, compact, undo, model, connectors",
  },
} as const satisfies Record<EntryGroup, { label: string; lands: string; effect: string; examples: string }>

export const GROUP_ORDER: readonly EntryGroup[] = ["attach", "make", "skill", "mode", "reference", "chat"]

export const REF_LABEL = {
  tab: "Open tabs",
  book: "Books",
  note: "Notes",
  chat: "Chats",
  board: "Boards",
  file: "Files",
} as const satisfies Record<RefKind, string>

export const REF_ORDER: readonly RefKind[] = ["tab", "book", "note", "chat", "board", "file"]

export const ENTRIES: readonly MenuEntry[] = [
  { id: "files", group: "attach", title: "Files and images", description: "Upload from your computer", keywords: "upload file image photo pdf paperclip", icon: UploadIcon },
  { id: "current-tab", group: "attach", title: "Current tab", description: "Learning to Learn · p. 84", keywords: "page tab bench reading", icon: AppWindowIcon },
  { id: "screenshot", group: "attach", title: "Screenshot of tab", description: "Send what you're looking at", keywords: "capture screen image snapshot", icon: ScanText },
  { id: "sketch", group: "attach", title: "Sketch", description: "Draw something to send", keywords: "draw drawing pen", icon: PencilRuler },
  { id: "quote", group: "attach", title: "Quote selection", description: "Select text in a tab first", keywords: "quote highlight excerpt", icon: QuoteIcon, disabledReason: "Select text in a tab first" },

  { id: "quiz", group: "make", title: "Quiz", description: "Questions on this chat or a book", keywords: "test practice questions", icon: GraduationCapIcon },
  { id: "flashcards", group: "make", title: "Flashcards", description: "A deck from this conversation", keywords: "cards deck practice review", icon: Layers },
  { id: "diagram", group: "make", title: "Diagram", description: "Explain it as a picture", keywords: "mermaid chart figure visual", icon: WorkflowIcon },
  { id: "board", group: "make", title: "Board", description: "Work it out on a whiteboard", keywords: "whiteboard draw canvas", icon: PresentationIcon },
  { id: "note", group: "make", title: "Note", description: "Save the gist of this chat", keywords: "write summary save", icon: NoteIcon },

  { id: "socratic", group: "skill", title: "Socratic tutor", description: "Answers with questions", keywords: "tutor questions teach", icon: RubiksCube },
  { id: "feynman", group: "skill", title: "Feynman check", description: "Explain it back, find the gaps", keywords: "explain teach back", icon: RubiksCube },
  { id: "essay", group: "skill", title: "Essay feedback", description: "Line-by-line comments", keywords: "writing review feedback", icon: RubiksCube },

  { id: "note-mode", group: "mode", title: "Note mode", description: "Write to your notes, not to Buddy", keywords: "notes capture", icon: PenLineIcon },
  { id: "think", group: "mode", title: "Think longer", description: "Slower, more careful answers", keywords: "reasoning thinking effort deep", icon: Lightbulb },

  { id: "tab-1", group: "reference", refKind: "tab", title: "Learning to Learn", description: "Open tab · p. 84", art: BENCH_RESOURCE_ART },
  { id: "tab-2", group: "reference", refKind: "tab", title: "Spaced repetition – Wikipedia", description: "Open tab · en.wikipedia.org", letter: "W" },
  { id: "book-1", group: "reference", refKind: "book", title: "The Shape of Ideas", description: "Book · Ch. 2", art: BENCH_RESOURCE_ART },
  { id: "book-2", group: "reference", refKind: "book", title: "Memory Palaces", description: "Book · Ch. 7", art: BENCH_RESOURCE_ART },
  { id: "note-1", group: "reference", refKind: "note", title: "Recall experiments", description: "Note · 20m ago", art: BENCH_NOTE_ART },
  { id: "note-2", group: "reference", refKind: "note", title: "Chapter 4 highlights", description: "Chat note · yesterday", art: BENCH_NOTE_ART },
  { id: "chat-1", group: "reference", refKind: "chat", title: "Why forgetting curves flatten", description: "Chat · 1h ago", art: BENCH_CHAT_ART },
  { id: "chat-2", group: "reference", refKind: "chat", title: "Spacing vs. cramming", description: "Chat · 2d ago", art: BENCH_CHAT_ART },
  { id: "board-1", group: "reference", refKind: "board", title: "Forgetting curve", description: "Board · yesterday", art: BENCH_BOARD_ART },
  { id: "file-1", group: "reference", refKind: "file", title: "reading-plan.md", description: "plans/", letter: "M" },

  { id: "new", group: "chat", title: "New chat", description: "Start fresh in this notebook", icon: SquarePen, shortcut: "⌘N" },
  { id: "branch", group: "chat", title: "Branch from here", description: "Continue in a new chat", keywords: "fork", icon: GitBranch },
  { id: "compact", group: "chat", title: "Compact", description: "Summarize to free up context", keywords: "summarize context", icon: Sigma },
  { id: "undo", group: "chat", title: "Undo last turn", description: "Take back your last message", icon: Undo2Icon },
  { id: "redo", group: "chat", title: "Redo", description: "Nothing to redo", icon: Redo2Icon, disabledReason: "Nothing to redo" },
  { id: "model", group: "chat", title: "Model", description: "Claude Sonnet 5", keywords: "switch provider", icon: CpuSettingsIcon },
  { id: "connectors", group: "chat", title: "Connectors", description: "Manage MCP tools", keywords: "mcp tools plugins", icon: PlugIcon },
]

export function entriesIn(group: EntryGroup): MenuEntry[] {
  return ENTRIES.filter((entry) => entry.group === group)
}

export function matchesQuery(entry: MenuEntry, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return `${entry.title} ${entry.description} ${entry.keywords ?? ""}`.toLowerCase().includes(q)
}

/** A short line describing what picking the entry did, for the frame's status pill. */
export function effectMessage(entry: MenuEntry): string {
  switch (entry.group) {
    case "attach":
      return `${entry.title} added to the attachment tray`
    case "reference":
      return `@${entry.title} inserted — Buddy will read it`
    case "make":
    case "skill":
      return `${entry.title} set as this message's intent`
    case "mode":
      return `${entry.title} toggled in the toolbar`
    case "chat":
      return `${entry.title} — happens now, nothing sent`
  }
}
