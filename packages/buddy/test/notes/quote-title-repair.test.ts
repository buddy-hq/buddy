import { describe, expect, test } from "bun:test"
import fsp from "node:fs/promises"
import path from "node:path"
import { Config } from "../../src/config"
import { listNotes, readNote, updateNote } from "../../src/notes/library"
import { withNotesMutationLock } from "../../src/notes/mutation-lock"
import {
  repairLegacyQuoteTitles,
  repairLegacyQuoteTitlesInNotesLibrary,
} from "../../src/notes/quote-title-repair"
import { writeTextFileAtomic } from "../../src/storage/atomic-file"
import { tmpdir } from "../helpers/tmpdir"

const LEGACY_URL_TITLE =
  "> [!quote]+ Costs $5, equation $x$, key:value, http://example.com/ab, नमस्ते 😀 python snakecase = 1"
const REPAIRED_URL_TITLE =
  "> [!quote]+ Costs $5, equation $x$, key:value, http://example.com/a_b, नमस्ते 😀 snake_case = 1"
const LEGACY_PATH_TITLE =
  "> [!quote]- UI path test: tokens/s and/or UI/backend 3/4 are plain prose. First file /private/var/folders/6b/tpzqtks48d18kr7zb8w4t80…"
const REPAIRED_PATH_TITLE =
  "> [!quote]- UI path test: tokens/s and/or UI/backend 3/4 are plain prose. First file /private/var/folders/6b/_tpzqtks48d18kr7zb8w4t8…"
const URL_MESSAGE_QUOTE = [
  "> Costs $5, equation $x$, key:value, http://example.com/a_b, नमस्ते 😀",
  ">",
  "> ```python",
  "> snake_case = 1",
  "> ```",
  ">",
  "> [Open message](buddy://chat/ses_1?message=msg_1)",
]
const PATH_MESSAGE_QUOTE = [
  "> UI path test: tokens/s and/or UI/backend 3/4 are plain prose. First file /private/var/folders/6b/_tpzqtks48d18kr7zb8w4t800000gn/T/notebooks/Checkpoint QA/target.md. Second file ~/notes/target with spaces.md",
  ">",
  "> [Open message](buddy://chat/ses_1?message=msg_3)",
]
const CHAT_NOTE_STAMP = [
  "---",
  "# kept by another tool",
  'custom: "amber:42"',
  'custom-list: ["one", "two"]',
  "type: buddy-session-note",
  "buddy-id: 01K00000000000000000000001",
  "buddy-notebook-id: notebook-test",
  "notebook: 'Checkpoint QA'",
  "buddy-session-id: ses_1",
  "buddy-last-capture-day: 2026-10-02",
  "---",
]

function chatNoteBodyLines(titles: { url: string; path: string }) {
  return [
    "**October 2, 2026**",
    "",
    "*21:00*",
    "",
    titles.url,
    ...URL_MESSAGE_QUOTE,
    "",
    "Written by hand with snake_case and `code`",
    "",
    "*21:25*",
    "",
    "> [!quote]+ acknowledged",
    "> acknowledged",
    ">",
    "> [Open message](buddy://chat/ses_1?message=msg_2)",
    "",
    "*21:27*",
    "",
    titles.path,
    ...PATH_MESSAGE_QUOTE,
    "",
    "My takeaway",
    "",
    "*21:50*",
    "",
    REPAIRED_URL_TITLE,
    ...URL_MESSAGE_QUOTE,
    "",
  ]
}

function chatNoteSource(titles: { url: string; path: string }) {
  return `\uFEFF${[...CHAT_NOTE_STAMP, ...chatNoteBodyLines(titles)].join("\r\n")}`
}

const LEGACY_CHAT_NOTE = chatNoteSource({ url: LEGACY_URL_TITLE, path: LEGACY_PATH_TITLE })
const REPAIRED_CHAT_NOTE = chatNoteSource({ url: REPAIRED_URL_TITLE, path: REPAIRED_PATH_TITLE })
const PASTED_LEGACY_QUOTE = [
  "Pasted from a chat note",
  "",
  LEGACY_URL_TITLE,
  ...URL_MESSAGE_QUOTE,
  "",
]
const NOTES_WITHOUT_REPAIRS = [
  [
    "Chat notes/Captured after the fix.md",
    REPAIRED_CHAT_NOTE.replace("01K00000000000000000000001", "01K00000000000000000000002"),
  ],
  ["Ordinary Markdown.md", PASTED_LEGACY_QUOTE.join("\n")],
  [
    "Standalone Buddy note.md",
    [
      "---",
      "type: buddy-note",
      "buddy-id: 01K00000000000000000000003",
      "buddy-notebook-id: notebook-test",
      "notebook: 'Checkpoint QA'",
      "---",
      ...PASTED_LEGACY_QUOTE,
    ].join("\n"),
  ],
] as const

async function configureNotesHome(directory: string) {
  const previous = await Config.getGlobal()
  await Config.replaceGlobal({
    ...previous,
    notebook_home: directory,
    notes_directory: path.join(directory, "Notes"),
  })
  return previous
}

async function modifiedTimes(filepaths: readonly string[]) {
  return Promise.all(filepaths.map(async (filepath) => (await fsp.stat(filepath)).mtimeMs))
}

async function writeLibraryFile(home: string, relativePath: string, source: string) {
  const filepath = path.join(home, "Notes", relativePath)
  await fsp.mkdir(path.dirname(filepath), { recursive: true })
  await fsp.writeFile(filepath, source, "utf8")
  return filepath
}

describe("Legacy quote title repair", () => {
  test("rewrites only the legacy titles and keeps each line's own ending", () => {
    const legacy = chatNoteBodyLines({ url: LEGACY_URL_TITLE, path: LEGACY_PATH_TITLE })
    const repaired = chatNoteBodyLines({ url: REPAIRED_URL_TITLE, path: REPAIRED_PATH_TITLE })
    const firstLineFeedLine = legacy.indexOf("*21:25*")
    const withMixedLineEndings = (lines: readonly string[]) =>
      [
        lines.slice(0, firstLineFeedLine).join("\r\n"),
        lines.slice(firstLineFeedLine).join("\n"),
      ].join("\r\n")

    expect(repairLegacyQuoteTitles(withMixedLineEndings(legacy))).toBe(
      withMixedLineEndings(repaired),
    )
  })

  test("repairs a legacy title that was cut through an emoji", () => {
    const quote = [
      `> ${"a".repeat(115)} x_y_z😀 tail`,
      ">",
      "> [Open message](buddy://chat/ses_1?message=msg_1)",
      "",
    ]

    expect(
      repairLegacyQuoteTitles([`> [!quote]+ ${"a".repeat(115)} xyz\uFFFD…`, ...quote].join("\n")),
    ).toBe([`> [!quote]+ ${"a".repeat(115)} x_y_…`, ...quote].join("\n"))
  })

  test.each([
    ["a title the learner rewrote", ["> [!quote]+ My own heading", ...URL_MESSAGE_QUOTE]],
    ["a legacy title followed by a space", [`${LEGACY_URL_TITLE} `, ...URL_MESSAGE_QUOTE]],
    [
      "a legacy title whose quoted message was edited afterwards",
      [LEGACY_URL_TITLE, ...URL_MESSAGE_QUOTE.with(3, "> snake_case = 2")],
    ],
    [
      "a legacy title whose quoted message was reformatted afterwards",
      [
        "> [!quote]+ Setup Use snakecase",
        "> # Setup",
        "> Use snake_case",
        ">",
        "> [Open message](buddy://chat/ses_1?message=msg_1)",
      ],
    ],
    [
      "a legacy title whose message link was repointed",
      [
        LEGACY_URL_TITLE,
        ...URL_MESSAGE_QUOTE.slice(0, -1),
        "> [Open message](https://example.com/chat)",
      ],
    ],
    [
      "a legacy title whose quote was extended below the message link",
      [LEGACY_URL_TITLE, ...URL_MESSAGE_QUOTE, "> Added underneath"],
    ],
    [
      "a legacy quote that continues an earlier blockquote",
      ["> Quoted by hand", LEGACY_URL_TITLE, ...URL_MESSAGE_QUOTE],
    ],
    [
      "a legacy quote pasted into a code block",
      ["```markdown", LEGACY_URL_TITLE, ...URL_MESSAGE_QUOTE, "```"],
    ],
    ["a title today's capture wrote", [REPAIRED_URL_TITLE, ...URL_MESSAGE_QUOTE]],
  ])("leaves %s untouched", (_, lines) => {
    const content = ["*21:00*", "", ...lines, "", "My takeaway", ""].join("\r\n")

    expect(repairLegacyQuoteTitles(content)).toBe(content)
  })

  test("repairs chat notes on disk once and leaves every other byte and file alone", async () => {
    await using home = await tmpdir()
    const previous = await configureNotesHome(home.path)

    try {
      const legacyPath = await writeLibraryFile(home.path, "Chat notes/Legacy.md", LEGACY_CHAT_NOTE)
      const otherPaths = await Promise.all(
        NOTES_WITHOUT_REPAIRS.map(([relativePath, source]) =>
          writeLibraryFile(home.path, relativePath, source),
        ),
      )
      const otherModifiedTimes = await modifiedTimes(otherPaths)
      const opened = await readNote("Chat notes/Legacy.md")

      expect(await repairLegacyQuoteTitlesInNotesLibrary()).toBe(1)

      expect(await fsp.readFile(legacyPath, "utf8")).toBe(REPAIRED_CHAT_NOTE)
      expect(
        await Promise.all(otherPaths.map((filepath) => fsp.readFile(filepath, "utf8"))),
      ).toEqual(NOTES_WITHOUT_REPAIRS.map(([, source]) => source))
      expect(await modifiedTimes(otherPaths)).toEqual(otherModifiedTimes)
      await expect(
        updateNote({
          path: "Chat notes/Legacy.md",
          content: `${opened.content}Unsaved edit`,
          expectedVersion: opened.version,
        }),
      ).rejects.toMatchObject({ status: 409 })
      expect(await fsp.readFile(legacyPath, "utf8")).toBe(REPAIRED_CHAT_NOTE)

      const repairedModifiedTimes = await modifiedTimes([legacyPath])
      expect(await repairLegacyQuoteTitlesInNotesLibrary()).toBe(0)
      expect(await modifiedTimes([legacyPath])).toEqual(repairedModifiedTimes)
      expect(await fsp.readFile(legacyPath, "utf8")).toBe(REPAIRED_CHAT_NOTE)
    } finally {
      await Config.replaceGlobal(previous)
    }
  })

  test("builds on what another writer saved while the repair waited for the library", async () => {
    await using home = await tmpdir()
    await using notebook = await tmpdir()
    const previous = await configureNotesHome(home.path)

    try {
      const legacyPath = await writeLibraryFile(home.path, "Chat notes/Legacy.md", LEGACY_CHAT_NOTE)
      const library = await listNotes(notebook.path)
      const saving = Promise.withResolvers<void>()
      const save = withNotesMutationLock(library.directory, async () => {
        await saving.promise
        await writeTextFileAtomic(legacyPath, `${LEGACY_CHAT_NOTE}Saved meanwhile\r\n`)
      })
      const repair = repairLegacyQuoteTitlesInNotesLibrary()
      await listNotes(notebook.path)
      saving.resolve()
      await save

      expect(await repair).toBe(1)
      expect(await fsp.readFile(legacyPath, "utf8")).toBe(
        `${REPAIRED_CHAT_NOTE}Saved meanwhile\r\n`,
      )
    } finally {
      await Config.replaceGlobal(previous)
    }
  })
})
