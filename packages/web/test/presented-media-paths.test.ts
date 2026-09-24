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

  test("collects workspace-relative candidates with spaces and unicode characters", () => {
    expect(
      collectPresentedMediaCandidatePaths(
        [
          "generated/Mark Richards; Neal Ford - Fundamentals of Software Architecture.pdf",
          "generated/Command R+ Blog Header.png",
          "generated/Рильке, Райнер Мария - Letters to a Young Poet.epub",
        ].join("\n"),
      ),
    ).toEqual([
      "generated/Mark Richards; Neal Ford - Fundamentals of Software Architecture.pdf",
      "generated/Command R+ Blog Header.png",
      "generated/Рильке, Райнер Мария - Letters to a Young Poet.epub",
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
