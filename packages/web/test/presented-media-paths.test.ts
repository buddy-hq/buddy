import { afterEach, describe, expect, mock, test } from "bun:test"
import {
  buildPresentedMediaFileActionInput,
  collectPresentedMediaCandidatePaths,
  isLikelyPresentedMediaPathCandidate,
  normalizePresentedMediaCandidatePath,
  readPresentedMediaAvailability,
  resolvePresentedMediaPathInfo,
  resolvePresentedMediaAvailability,
  type PresentedMediaItem,
} from "../src/lib/presented-media"
import { withFetchPreconnect } from "../src/lib/fetch-transport"
import { parseRequestUrl } from "./parse-test-values"

const originalFetch = globalThis.fetch

describe("presented media path helpers", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  test("keeps slashless paths relative to the notebook", () => {
    expect(
      normalizePresentedMediaCandidatePath(
        "Users/prashantbhudwal/Documents/Buddy/teaching/generated/worksheet.pdf",
      ),
    ).toBe("Users/prashantbhudwal/Documents/Buddy/teaching/generated/worksheet.pdf")
  })

  test("strips surrounding markdown wrappers", () => {
    expect(normalizePresentedMediaCandidatePath("(generated/worksheet.pdf)")).toBe(
      "generated/worksheet.pdf",
    )
    expect(normalizePresentedMediaCandidatePath("[generated/worksheet.pdf]")).toBe(
      "generated/worksheet.pdf",
    )
  })

  test("collects likely local media candidates and skips noisy workspace paths", () => {
    expect(collectPresentedMediaCandidatePaths("generated/worksheet.pdf")).toEqual([
      "generated/worksheet.pdf",
    ])
    expect(
      collectPresentedMediaCandidatePaths("node_modules/pkg/image.png dist/output.pdf"),
    ).toEqual([])
  })

  test("collects explicit workspace-relative candidates with spaces and unicode characters", () => {
    expect(
      collectPresentedMediaCandidatePaths(
        [
          "./generated/Mark Richards; Neal Ford - Fundamentals of Software Architecture.pdf",
          "./generated/Command R+ Blog Header.png",
          "./generated/Рильке, Райнер Мария - Letters to a Young Poet.epub",
        ].join("\n"),
      ),
    ).toEqual([
      "./generated/Mark Richards; Neal Ford - Fundamentals of Software Architecture.pdf",
      "./generated/Command R+ Blog Header.png",
      "./generated/Рильке, Райнер Мария - Letters to a Young Poet.epub",
    ])
  })

  test("recognizes local file paths in plain assistant text without swallowing prose or web URLs", () => {
    expect(isLikelyPresentedMediaPathCandidate("generated/worksheet.pdf")).toBe(true)
    expect(isLikelyPresentedMediaPathCandidate("/tmp/worksheet.pdf")).toBe(true)
    expect(isLikelyPresentedMediaPathCandidate("~/Downloads/worksheet.pdf")).toBe(true)
    expect(isLikelyPresentedMediaPathCandidate("file:///tmp/worksheet.pdf")).toBe(true)
    expect(isLikelyPresentedMediaPathCandidate("C:\\Users\\buddy\\worksheet.pdf")).toBe(true)
    expect(isLikelyPresentedMediaPathCandidate("../worksheet.pdf")).toBe(true)
    expect(isLikelyPresentedMediaPathCandidate("https://example.com/worksheet.pdf")).toBe(false)
    expect(
      collectPresentedMediaCandidatePaths(
        "See /Users/example/Desktop/office image.png and /tmp/worksheet.pdf.",
      ),
    ).toEqual(["/Users/example/Desktop/office image.png", "/tmp/worksheet.pdf"])
    expect(collectPresentedMediaCandidatePaths("See https://example.com/worksheet.pdf.")).toEqual(
      [],
    )
    expect(collectPresentedMediaCandidatePaths("//cdn.example.com/worksheet.pdf")).toEqual([])
    expect(
      collectPresentedMediaCandidatePaths(
        "Saved to /Users/me/Desktop/draft. The final file is report.pdf.",
      ),
    ).toEqual([])
    expect(collectPresentedMediaCandidatePaths("score / 5. see /tmp/report.pdf")).toEqual([
      "/tmp/report.pdf",
    ])
    expect(collectPresentedMediaCandidatePaths("See ../output and then read notes.pdf")).toEqual([])
    expect(collectPresentedMediaCandidatePaths("See /tmp/foo.bar, then open baz.pdf")).toEqual([
      "/tmp/foo.bar",
    ])
    expect(collectPresentedMediaCandidatePaths("See /tmp/report.final.pdf.")).toEqual([
      "/tmp/report.final.pdf",
    ])
    expect(collectPresentedMediaCandidatePaths("Open /tmp/notes then check report.pdf")).toEqual([])
    expect(
      collectPresentedMediaCandidatePaths(
        "Saved to /Users/me/Desktop/draft; the final file is report.pdf",
      ),
    ).toEqual([])
    expect(collectPresentedMediaCandidatePaths("see //cdn.example.com/worksheet.pdf")).toEqual([])
    expect(collectPresentedMediaCandidatePaths("tmp/report.pdf")).toEqual([])
    expect(collectPresentedMediaCandidatePaths("var/folders/ab/file.pdf")).toEqual([
      "var/folders/ab/file.pdf",
    ])
    expect(collectPresentedMediaCandidatePaths("/Users/me/Downloads/report (1).pdf")).toEqual([
      "/Users/me/Downloads/report (1).pdf",
    ])
    expect(
      collectPresentedMediaCandidatePaths("C:\\Program Files (x86)\\Adobe\\Reader.pdf"),
    ).toEqual(["C:\\Program Files (x86)\\Adobe\\Reader.pdf"])
    expect(
      collectPresentedMediaCandidatePaths("file:///tmp/missing.pdf ~/Downloads/missing.pdf"),
    ).toEqual(["file:///tmp/missing.pdf", "~/Downloads/missing.pdf"])
    expect(collectPresentedMediaCandidatePaths("Saved to \\Users\\buddy\\worksheet.pdf.")).toEqual([
      "\\Users\\buddy\\worksheet.pdf",
    ])
    expect(collectPresentedMediaCandidatePaths("Open \\\\server\\share\\report.pdf")).toEqual([
      "\\\\server\\share\\report.pdf",
    ])
    expect(collectPresentedMediaCandidatePaths("generated/report (1).pdf")).toEqual([
      "generated/report (1).pdf",
    ])
    expect(collectPresentedMediaCandidatePaths("generated/report(1).pdf")).toEqual([
      "generated/report(1).pdf",
    ])
    expect(collectPresentedMediaCandidatePaths("src/app/(auth)/page.tsx")).toEqual([
      "src/app/(auth)/page.tsx",
    ])
    expect(collectPresentedMediaCandidatePaths("./artifacts/report (1).pdf")).toEqual([
      "./artifacts/report (1).pdf",
    ])
    expect(collectPresentedMediaCandidatePaths("Open generated/report (1).pdf please")).toEqual([
      "generated/report (1).pdf",
    ])
    expect(collectPresentedMediaCandidatePaths("See (generated/report (1).pdf)")).toEqual([
      "generated/report (1).pdf",
    ])
    expect(collectPresentedMediaCandidatePaths("Week 1/worksheet.pdf")).toEqual([
      "Week 1/worksheet.pdf",
    ])
    expect(collectPresentedMediaCandidatePaths("Project (final)/notes.pdf")).toEqual([
      "Project (final)/notes.pdf",
    ])
    expect(collectPresentedMediaCandidatePaths("Open Week 1/worksheet.pdf")).toEqual([
      "Week 1/worksheet.pdf",
    ])
    expect(collectPresentedMediaCandidatePaths("/tmp/Dr. Smith.pdf")).toEqual([
      "/tmp/Dr. Smith.pdf",
    ])
    expect(collectPresentedMediaCandidatePaths("/Users/me/Smith, John/taxes.pdf")).toEqual([
      "/Users/me/Smith, John/taxes.pdf",
    ])
    expect(collectPresentedMediaCandidatePaths("/Users/me/Desktop/Tom and Jerry.pdf")).toEqual([
      "/Users/me/Desktop/Tom and Jerry.pdf",
    ])
  })

  test("keeps units, rates and ratios written with a slash as plain text", () => {
    const proseWithSlash = [
      "p50 = 17.88 tokens/s, p99 = 30.01 tokens/s, max = 32.98 tokens/s.",
      "tokens/s, max = 32.98",
      "Speed is 5 km/h and it costs 9.99",
      "items/sec, max = 3.5 items/sec.",
      "ratio 1/2 = 0.5",
      "open 24/7 for 9.99",
      "3/4=0.75",
      "see api/v1.2",
      "tokens/s",
      "km/h",
      "items/sec",
      "and/or",
      "24/7",
      "1/2",
      "token/s",
      "req/s",
      "MB/s",
      "tokens/s, see README.md",
      "tokens/s, saved results in report.csv",
      "token/s; see README.md",
      "MB/s and README.md",
      "and/or see README.md",
      "50 tokens/s. see README.md",
      "req/s, max = 32.98ms",
      "ratio 1/2, report.csv",
    ]

    expect(proseWithSlash.map((text) => [text, collectPresentedMediaCandidatePaths(text)])).toEqual(
      proseWithSlash.map((text) => [text, []]),
    )
  })

  test("finds later file paths without borrowing their extension for a unit", () => {
    const cases: [string, string[]][] = [
      ["50 tokens/s, see docs/report.pdf", ["docs/report.pdf"]],
      ["50 token/s. see docs/report.pdf", ["docs/report.pdf"]],
      ["50 req/s and docs/report.pdf", ["docs/report.pdf"]],
      ["50 tokens/s, see generated/report(1).pdf", ["generated/report(1).pdf"]],
      ["See src/app/(auth)/page.tsx; 50 tokens/s", ["src/app/(auth)/page.tsx"]],
      ["units MB/s; artifact ./report.csv", ["./report.csv"]],
      ["ratio 1/2, see /tmp/report.pdf", ["/tmp/report.pdf"]],
      ["MB/s, saved to C:\\Reports\\final report.pdf", ["C:\\Reports\\final report.pdf"]],
      ["req/s, read \\\\server\\share\\report.pdf", ["\\\\server\\share\\report.pdf"]],
    ]

    expect(cases.map(([text]) => [text, collectPresentedMediaCandidatePaths(text)])).toEqual(cases)
  })

  test("stops a relative path before a decimal number that follows it", () => {
    expect(collectPresentedMediaCandidatePaths("Saved generated/a.pdf. Next 3.5 tokens/s")).toEqual(
      ["generated/a.pdf"],
    )
    expect(
      collectPresentedMediaCandidatePaths("See ./artifacts/report 1.5.pdf and 3.5 tokens/s"),
    ).toEqual(["./artifacts/report 1.5.pdf"])
  })

  test("keeps real path shapes with numbers, equals signs and spaced folders", () => {
    expect(collectPresentedMediaCandidatePaths("/var/log/syslog.1")).toEqual(["/var/log/syslog.1"])
    expect(collectPresentedMediaCandidatePaths("~/logs/app.2")).toEqual(["~/logs/app.2"])
    expect(collectPresentedMediaCandidatePaths("C:\\logs\\app.3")).toEqual(["C:\\logs\\app.3"])
    expect(
      collectPresentedMediaCandidatePaths("p50 = 17.88 tokens/s, see /tmp/report.pdf"),
    ).toEqual(["/tmp/report.pdf"])
    expect(collectPresentedMediaCandidatePaths("docs/v1.2/guide.pdf")).toEqual([
      "docs/v1.2/guide.pdf",
    ])
    expect(collectPresentedMediaCandidatePaths("./generated/report v1.2.pdf")).toEqual([
      "./generated/report v1.2.pdf",
    ])
    expect(collectPresentedMediaCandidatePaths("./2024/Q3 report.pdf")).toEqual([
      "./2024/Q3 report.pdf",
    ])
    expect(collectPresentedMediaCandidatePaths("reports/a=b.pdf")).toEqual(["reports/a=b.pdf"])
    expect(collectPresentedMediaCandidatePaths("year=2024/month=01/part.parquet")).toEqual([
      "year=2024/month=01/part.parquet",
    ])
    expect(collectPresentedMediaCandidatePaths("./generated/My Folder/file.pdf")).toEqual([
      "./generated/My Folder/file.pdf",
    ])
    expect(collectPresentedMediaCandidatePaths("notes/Week 1/worksheet.pdf")).toEqual([
      "notes/Week 1/worksheet.pdf",
    ])
    expect(collectPresentedMediaCandidatePaths("Week 2/data.csv")).toEqual(["Week 2/data.csv"])
  })

  test("stops a relative path at a sentence break", () => {
    const cases: [string, string[]][] = [
      ["Speed is 5 km/h. See README.md", []],
      ["(Speed is 5 km/h. See README.md)", []],
      ["Speed is 5 km/h. See notes/README.md", ["notes/README.md"]],
      ["Speed is 5 km/h. See README.md and notes/a.md", ["notes/a.md"]],
      ["Done. See generated/a.pdf", ["generated/a.pdf"]],
      ["Saved generated/a.pdf. Next generated/b.pdf.", ["generated/a.pdf", "generated/b.pdf"]],
      ["Plan: ok. Open Week 1/worksheet.pdf", ["Week 1/worksheet.pdf"]],
      ["README.md", []],
      ["See README.md", []],
    ]

    expect(cases.map(([text]) => [text, collectPresentedMediaCandidatePaths(text)])).toEqual(cases)
  })

  test("keeps periods inside explicitly relative spaced names", () => {
    const names = [
      "./generated/Dr. Smith.pdf",
      "./generated/John F. Kennedy - Profiles.pdf",
      "./generated/Tolkien, J.R.R. Collection/report.pdf",
      "generated/report (v1. Final).pdf",
      "./generated/v1.2 final/report.pdf",
      "./generated/Vol. 2 notes.pdf",
    ]

    expect(names.map((text) => [text, collectPresentedMediaCandidatePaths(text)])).toEqual(
      names.map((text) => [text, [text]]),
    )
  })

  test("keeps two relative paths in one sentence as two paths", () => {
    const cases: [string, string[]][] = [
      ["Compare generated/a.pdf and generated/b.pdf", ["generated/a.pdf", "generated/b.pdf"]],
      ["See notes/a.md, notes/b.md", ["notes/a.md", "notes/b.md"]],
      ["See notes/a.md and notes/b.md.", ["notes/a.md", "notes/b.md"]],
      ["See generated/a.pdf; generated/b.pdf", ["generated/a.pdf", "generated/b.pdf"]],
      [
        "Compare generated/a.pdf, generated/b.pdf and generated/c.pdf.",
        ["generated/a.pdf", "generated/b.pdf", "generated/c.pdf"],
      ],
      ["Compare (generated/a.pdf) and (generated/b.pdf)", ["generated/a.pdf", "generated/b.pdf"]],
      ["Open Week 1/a.pdf and Week 2/b.pdf", ["Week 1/a.pdf", "Week 2/b.pdf"]],
      [
        "./generated/Smith, John/a.pdf and ./generated/Jones, Jane/b.pdf",
        ["./generated/Smith, John/a.pdf", "./generated/Jones, Jane/b.pdf"],
      ],
    ]

    expect(cases.map(([text]) => [text, collectPresentedMediaCandidatePaths(text)])).toEqual(cases)
  })

  test("keeps spaced relative names whole", () => {
    const names = [
      "Week 1/worksheet.pdf",
      "./generated/Command R+ Blog Header.png",
      "./generated/Mark Richards; Neal Ford - Fundamentals of Software Architecture.pdf",
      "./generated/Рильке, Райнер Мария - Letters to a Young Poet.epub",
      "generated/report (1).pdf",
      "notes/Week 1/worksheet.pdf",
    ]

    expect(names.map((text) => [text, collectPresentedMediaCandidatePaths(text)])).toEqual(
      names.map((text) => [text, [text]]),
    )
    expect(collectPresentedMediaCandidatePaths("Open Week 1/worksheet.pdf")).toEqual([
      "Week 1/worksheet.pdf",
    ])
    expect(collectPresentedMediaCandidatePaths("Open generated/report (1).pdf please")).toEqual([
      "generated/report (1).pdf",
    ])
  })

  test("bounds path scanning on oversized assistant text", () => {
    expect(collectPresentedMediaCandidatePaths(`${"a/b ".repeat(2000)}x.pdf`)).toEqual([])
  })

  test("checks media availability through the typed object route", async () => {
    const calls: string[] = []
    globalThis.fetch = withFetchPreconnect(
      mock(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = parseRequestUrl(input)
        const method = input instanceof Request ? input.method : (init?.method ?? "GET")
        calls.push(`${method} ${url}`)

        if (
          method === "GET" &&
          url.includes("/api/objects/media-presentation/object_1/items/item_1/availability") &&
          url.includes("directory=%2Frepo")
        ) {
          return Response.json({
            status: "available",
            message: null,
          })
        }

        throw new Error(`Unexpected fetch: ${method} ${url}`)
      }),
      originalFetch,
    )

    const availability = await readPresentedMediaAvailability("/repo", "object_1", localMediaItem)

    expect(availability.status).toBe("available")
    expect(calls.some((call) => call.includes("/api/objects/media-presentation/resolve"))).toBe(
      false,
    )
    expect(
      calls.some((call) =>
        call.includes("/api/objects/media-presentation/object_1/items/item_1/availability"),
      ),
    ).toBe(true)
  })

  test("resolves file open metadata from a local workspace path", async () => {
    const calls: string[] = []
    globalThis.fetch = withFetchPreconnect(
      mock(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = parseRequestUrl(input)
        const method = input instanceof Request ? input.method : (init?.method ?? "GET")
        calls.push(`${method} ${url}`)

        throw new Error(`Unexpected fetch: ${method} ${url}`)
      }),
      originalFetch,
    )

    const resolved = await resolvePresentedMediaPathInfo({
      directory: "/repo",
      path: "notes/worksheet.md",
    })

    expect(resolved.workspacePath).toBe("notes/worksheet.md")
    expect(
      buildPresentedMediaFileActionInput({
        item: resolved,
        canOpenDefaultApp: true,
        canReveal: true,
      }),
    ).toMatchObject({
      path: "notes/worksheet.md",
      absolutePath: "",
      name: "worksheet.md",
      available: true,
      canOpenInBuddy: true,
      canOpenDefaultApp: true,
      canReveal: true,
      mimeType: undefined,
      sizeBytes: undefined,
    })
    expect(calls).toEqual([])
  })

  test("treats oversized media as available when the backend can serve it", async () => {
    globalThis.fetch = withFetchPreconnect(
      mock(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = parseRequestUrl(input)
        const method = input instanceof Request ? input.method : (init?.method ?? "GET")

        if (
          method === "GET" &&
          url.includes("/api/objects/media-presentation/object_1/items/item_1/availability") &&
          url.includes("directory=%2Frepo")
        ) {
          return Response.json({
            status: "available",
            message: null,
          })
        }

        throw new Error(`Unexpected fetch: ${method} ${url}`)
      }),
      originalFetch,
    )

    const availability = await readPresentedMediaAvailability("/repo", "object_1", {
      ...localMediaItem,
      mediaKind: "image",
      renderMode: "image",
      sizeBytes: 1024 * 1024 * 1024,
    })

    expect(availability.status).toBe("available")
  })

  test("returns missing when the presented media source no longer exists", async () => {
    globalThis.fetch = withFetchPreconnect(
      mock(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = parseRequestUrl(input)
        const method = input instanceof Request ? input.method : (init?.method ?? "GET")

        if (
          method === "GET" &&
          url.includes("/api/objects/media-presentation/object_1/items/item_1/availability") &&
          url.includes("directory=%2Frepo")
        ) {
          return Response.json({
            status: "missing",
            message: "File not found",
          })
        }

        throw new Error(`Unexpected fetch: ${method} ${url}`)
      }),
      originalFetch,
    )

    const result = await resolvePresentedMediaAvailability("/repo", "object_1", localMediaItem)

    expect(result.availability.status).toBe("missing")
    expect(result.item.rawUrl).toContain("/api/objects/media-presentation/object_1/raw/item_1")
  })
})

const localMediaItem: PresentedMediaItem = {
  id: "item_1",
  inputPath: "/tmp/notes.pdf",
  absolutePath: "/tmp/notes.pdf",
  displayPath: "/tmp/notes.pdf",
  workspacePath: null,
  fileName: "notes.pdf",
  mediaKind: "pdf",
  renderMode: "pdf",
  mimeType: "application/pdf",
  sizeBytes: 42,
  modifiedAt: null,
  rawUrl:
    "/api/objects/media-presentation/object_1/raw/item_1?directory=%2Frepo&fileName=notes.pdf",
  actionCapabilities: {
    canOpenDefaultApp: true,
    canRevealInFileManager: true,
    canOpenInBuddy: false,
  },
  availability: {
    status: "available",
    message: null,
  },
}
