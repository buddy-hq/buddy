import {
  BENCH_BOARD_ART,
  BENCH_BROWSER_ART,
  BENCH_CHAT_ART,
  BENCH_CREATION_ART,
  BENCH_FILES_ART,
  BENCH_NEW_NOTE_ART,
  BENCH_NOTES_ART,
  BENCH_NOTE_ART,
  BENCH_PRACTICE_ART,
  BENCH_RESOURCE_ART,
} from "@/components/bench/bench-action-art"

// ---------------------------------------------------------------------------
// One fictional notebook ("Learning science") shared by every direction, so the
// comparison is about the interaction and not the sample data.
// ---------------------------------------------------------------------------

export type HomeKind = "book" | "note" | "board" | "practice" | "chat" | "page" | "file" | "creation"

export const COVER_TONES = {
  clay: "bg-orange-200 text-orange-950",
  sea: "bg-sky-200 text-sky-950",
  moss: "bg-emerald-200 text-emerald-950",
  rose: "bg-rose-200 text-rose-950",
  ink: "bg-slate-700 text-slate-50",
} as const

export type CoverTone = keyof typeof COVER_TONES

export type HomeItem = {
  readonly id: string
  readonly kind: HomeKind
  readonly title: string
  readonly detail: string
  readonly when: string
  readonly author?: string
  readonly progress?: number
  readonly due?: number
  readonly cover?: CoverTone
  readonly host?: string
  readonly preview?: string
}

export const KIND_LABEL = {
  book: "Book",
  note: "Note",
  board: "Board",
  practice: "Practice",
  chat: "Chat",
  page: "Page",
  file: "File",
  creation: "Creation",
} as const satisfies Record<HomeKind, string>

export const KIND_PLURAL = {
  book: "Books",
  note: "Notes",
  board: "Boards",
  practice: "Practice",
  chat: "Chats",
  page: "Web",
  file: "Files",
  creation: "Creations",
} as const satisfies Record<HomeKind, string>

export const KIND_ART = {
  book: BENCH_RESOURCE_ART,
  note: BENCH_NOTE_ART,
  board: BENCH_BOARD_ART,
  practice: BENCH_PRACTICE_ART,
  chat: BENCH_CHAT_ART,
  page: BENCH_BROWSER_ART,
  file: BENCH_FILES_ART,
  creation: BENCH_CREATION_ART,
} as const satisfies Record<HomeKind, string>

export const ITEMS: readonly HomeItem[] = [
  { id: "b1", kind: "book", title: "Learning to Learn", author: "Maya Ellis", detail: "Ch. 4 · Making room for recall", when: "2h ago", progress: 0.62, cover: "clay" },
  { id: "p1", kind: "practice", title: "Memory deck", detail: "12 cards due", when: "due today", due: 12 },
  { id: "n1", kind: "note", title: "Recall experiments", detail: "My notes", when: "20m ago", preview: "Try spacing the second review two days out and log what sticks." },
  { id: "c1", kind: "chat", title: "Why forgetting curves flatten", detail: "Chat", when: "1h ago" },
  { id: "w1", kind: "board", title: "Forgetting curve", detail: "Board", when: "yesterday" },
  { id: "b2", kind: "book", title: "The Shape of Ideas", author: "Jonah Reed", detail: "Ch. 2 · A useful first sketch", when: "yesterday", progress: 0.18, cover: "sea" },
  { id: "g1", kind: "page", title: "Spaced repetition – Wikipedia", host: "en.wikipedia.org", detail: "en.wikipedia.org", when: "yesterday" },
  { id: "n2", kind: "note", title: "Chapter 4 highlights", detail: "Chat notes", when: "yesterday", preview: "“Leave a little space between reading and remembering.”" },
  { id: "p2", kind: "practice", title: "Chapter 4 quiz", detail: "8 questions", when: "2d ago" },
  { id: "b3", kind: "book", title: "Memory Palaces", author: "R. Adler", detail: "Ch. 7 · Walking the route", when: "3d ago", progress: 0.4, cover: "ink" },
  { id: "c2", kind: "chat", title: "Spacing vs. cramming", detail: "Chat", when: "2d ago" },
  { id: "w2", kind: "board", title: "Memory systems map", detail: "Board", when: "last week" },
  { id: "n3", kind: "note", title: "Questions for Buddy", detail: "My notes", when: "3d ago", preview: "Why does retrieval beat rereading even when it feels slower?" },
  { id: "k1", kind: "creation", title: "Recall timeline", detail: "Diagram", when: "3d ago" },
  { id: "b4", kind: "book", title: "Field Notes", author: "Lena Park", detail: "Finished", when: "last week", progress: 1, cover: "moss" },
  { id: "g2", kind: "page", title: "Augmenting Long-term Memory", host: "michaelnotebook.com", detail: "michaelnotebook.com", when: "last week" },
  { id: "f1", kind: "file", title: "reading-plan.md", detail: "plans", when: "last week" },
  { id: "b5", kind: "book", title: "Ways of Seeing", author: "Alex Morgan", detail: "Not started", when: "added 3d ago", progress: 0, cover: "rose" },
  { id: "f2", kind: "file", title: "experiment-data.csv", detail: "data", when: "2 weeks ago" },
]

export const ITEM_BY_ID = new Map(ITEMS.map((item) => [item.id, item]))

export function itemByID(id: string): HomeItem {
  const item = ITEM_BY_ID.get(id)
  if (!item) throw new Error(`Unknown mock item ${id}`)
  return item
}

/** Recent activity, newest first, without finished books or loose files. */
export const RECENTS: readonly HomeItem[] = ITEMS.filter(
  (item) => item.kind !== "file" && item.progress !== 1,
).slice(0, 6)

export const READING: readonly HomeItem[] = ITEMS.filter(
  (item) => item.kind === "book" && item.progress !== undefined && item.progress < 1,
)

export const DEFAULT_PIN_IDS = ["b1", "p1", "w1", "n3", "g1"] as const

// ---------------------------------------------------------------------------
// Commands — things you can do, as opposed to things you can open
// ---------------------------------------------------------------------------

export type HomeCommandGroup = "create" | "buddy" | "open"

export type HomeCommand = {
  readonly id: string
  readonly title: string
  readonly group: HomeCommandGroup
  readonly keywords: string
  readonly art: string
  /** One line of what happens, shown muted beside the title. */
  readonly description: string
  /** Placeholder for the inline text the command takes, if any. */
  readonly argument?: string
  /** Scope the command browses, for the Open commands. */
  readonly scope?: HomeKind
}

export const COMMANDS: readonly HomeCommand[] = [
  { id: "new-note", title: "New note", description: "Start a blank note", group: "create", keywords: "create write note", art: BENCH_NEW_NOTE_ART, argument: "Note title" },
  { id: "new-board", title: "New board", description: "Sketch on a whiteboard", group: "create", keywords: "create whiteboard draw board sketch", art: BENCH_BOARD_ART, argument: "Board name" },
  { id: "new-tab", title: "New browser tab", description: "Open a page beside your notes", group: "create", keywords: "browser web url tab open page", art: BENCH_BROWSER_ART, argument: "URL or search" },
  { id: "add-resource", title: "Add a book or PDF", description: "Import a PDF or EPUB to read here", group: "create", keywords: "add resource import pdf epub book upload", art: BENCH_RESOURCE_ART },
  { id: "ask", title: "Ask Buddy", description: "Ask a question in the chat", group: "buddy", keywords: "ask question chat explain", art: BENCH_CHAT_ART, argument: "Question" },
  { id: "quiz", title: "Quiz me on…", description: "Questions from a book or note", group: "buddy", keywords: "quiz test practice questions", art: BENCH_PRACTICE_ART, argument: "Book, chapter or note" },
  { id: "flashcards", title: "Make flashcards from…", description: "A deck from what you read", group: "buddy", keywords: "flashcards cards deck practice", art: BENCH_PRACTICE_ART, argument: "Book, chapter or note" },
  { id: "summarize", title: "Summarize…", description: "The gist of a chapter or page", group: "buddy", keywords: "summary summarize explain", art: BENCH_CREATION_ART, argument: "Book, chapter or page" },
  { id: "open-books", title: "Books", description: "Everything you are reading", group: "open", keywords: "resources library books pdf epub sources", art: BENCH_RESOURCE_ART, scope: "book" },
  { id: "open-notes", title: "Notes", description: "Your notes and chat notes", group: "open", keywords: "notes library", art: BENCH_NOTES_ART, scope: "note" },
  { id: "open-boards", title: "Boards", description: "Whiteboards and diagrams", group: "open", keywords: "boards whiteboards", art: BENCH_BOARD_ART, scope: "board" },
  { id: "open-practice", title: "Practice", description: "Decks and quizzes", group: "open", keywords: "practice flashcards quizzes decks", art: BENCH_PRACTICE_ART, scope: "practice" },
  { id: "open-files", title: "Files", description: "The notebook folder", group: "open", keywords: "files explorer folder", art: BENCH_FILES_ART, scope: "file" },
]

export const COMMAND_BY_ID = new Map(COMMANDS.map((command) => [command.id, command]))

export function commandByID(id: string): HomeCommand {
  const command = COMMAND_BY_ID.get(id)
  if (!command) throw new Error(`Unknown mock command ${id}`)
  return command
}

// ---------------------------------------------------------------------------
// Matching — prefix beats word-start beats substring; titles beat details
// ---------------------------------------------------------------------------

function score(query: string, title: string, rest: string): number | undefined {
  const q = query.trim().toLowerCase()
  if (!q) return 0
  const t = title.toLowerCase()
  if (t.startsWith(q)) return 0
  if (t.split(/[\s·–-]+/u).some((word) => word.startsWith(q))) return 1
  if (t.includes(q)) return 2
  if (rest.toLowerCase().includes(q)) return 3
  return undefined
}

export function searchItems(query: string, scope?: HomeKind): HomeItem[] {
  return ITEMS.flatMap((item) => {
    if (scope && item.kind !== scope) return []
    const value = score(query, item.title, `${item.detail} ${item.author ?? ""} ${item.preview ?? ""}`)
    return value === undefined ? [] : [{ item, value }]
  })
    .toSorted((left, right) => left.value - right.value)
    .map(({ item }) => item)
}

export function searchCommands(query: string, groups?: readonly HomeCommandGroup[]): HomeCommand[] {
  if (!query.trim()) return []
  return COMMANDS.flatMap((command) => {
    if (groups && !groups.includes(command.group)) return []
    const value = score(query, command.title, command.keywords)
    return value === undefined ? [] : [{ command, value }]
  })
    .toSorted((left, right) => left.value - right.value)
    .map(({ command }) => command)
}

/** Words that turn into a scope when followed by Tab, Chrome-omnibox style. */
export function scopeFromKeyword(query: string): HomeKind | undefined {
  const q = query.trim().toLowerCase()
  if (q.length < 3) return undefined
  const entry = Object.entries(KIND_PLURAL).find(([, plural]) => plural.toLowerCase().startsWith(q))
  return entry ? parseKind(entry[0]) : undefined
}

export function parseKind(value: string): HomeKind | undefined {
  switch (value) {
    case "book":
    case "note":
    case "board":
    case "practice":
    case "chat":
    case "page":
    case "file":
    case "creation":
      return value
    default:
      return undefined
  }
}

export function looksLikeUrl(query: string): boolean {
  return /^(https?:\/\/)?[\w-]+(\.[\w-]+)+(\/\S*)?$/u.test(query.trim())
}

/** What the primary button on an item says, so resuming reads as resuming. */
export function primaryVerb(item: HomeItem): string {
  if (item.kind === "book") return item.progress && item.progress < 1 ? `Resume · ${item.detail.split(" · ")[0]}` : "Open"
  if (item.kind === "practice" && item.due) return `Review ${item.due} cards`
  if (item.kind === "chat") return "Continue chat"
  return "Open"
}
