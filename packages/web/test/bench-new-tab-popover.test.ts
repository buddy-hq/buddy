import { describe, expect, test } from "bun:test"
import type { InAppBrowserHistoryEntry } from "../src/lib/in-app-browser-history"
import {
  benchNewTabNotebookQuery,
  isDefiniteBenchNewTabFilePath,
  resolveBenchNewTabBrowserInputAction,
  searchBenchNewTabBrowserHistory,
} from "../src/lib/bench-new-tab-browser"

describe("Bench new-tab Browser option", () => {
  test("turns a typed address into an immediate Browser action", () => {
    expect(resolveBenchNewTabBrowserInputAction("example.com/docs", "duckduckgo")).toEqual({
      kind: "url",
      placement: "primary",
      url: "https://example.com/docs",
      title: "example.com/docs",
      description: "https://example.com/docs",
    })
  })

  test("labels ordinary text as an explicit web search", () => {
    const action = resolveBenchNewTabBrowserInputAction("browser architecture", "google")
    expect(action).toMatchObject({
      kind: "search",
      placement: "fallback",
      title: "Search Google for “browser architecture”",
      description: "Google",
    })
    expect(new URL(action?.url ?? "").searchParams.get("q")).toBe("browser architecture")
  })

  test("does not turn blocked protocols into Browser actions", () => {
    expect(
      resolveBenchNewTabBrowserInputAction("javascript:alert(1)", "duckduckgo"),
    ).toBeUndefined()
  })

  test("keeps definite paths out of web search and defers ambiguous filenames", () => {
    for (const path of [
      "./README.md",
      "../README.md",
      "/workspace/README.md",
      "C:\\workspace\\README.md",
      "src\\README.md",
    ]) {
      expect(isDefiniteBenchNewTabFilePath(path)).toBe(true)
      expect(resolveBenchNewTabBrowserInputAction(path, "google")).toBeUndefined()
    }

    expect(resolveBenchNewTabBrowserInputAction("README.md", "google")).toMatchObject({
      kind: "url",
      placement: "fallback",
    })
    expect(resolveBenchNewTabBrowserInputAction("src/README.md", "google")).toMatchObject({
      kind: "url",
      placement: "fallback",
    })

    expect(
      benchNewTabNotebookQuery({ directory: "/workspace", query: "/workspace/src/README.md" }),
    ).toBe("src/README.md")
    expect(benchNewTabNotebookQuery({ directory: "/workspace", query: "./src/README.md" })).toBe(
      "src/README.md",
    )
    expect(benchNewTabNotebookQuery({ directory: "/workspace", query: "src\\README.md" })).toBe(
      "src/README.md",
    )
    expect(
      benchNewTabNotebookQuery({
        directory: "C:\\workspace",
        query: "C:\\workspace\\src\\README.md",
      }),
    ).toBe("src/README.md")
  })

  test("ranks matching Browser history by title, address, then recency", () => {
    const history = [
      { url: "https://google.com/search?q=docs", title: "Docs search", visitedAt: 4 },
      { url: "https://docs.example.com/", title: "Reference", visitedAt: 3 },
      { url: "https://example.com/docs", title: "Docs", visitedAt: 1 },
      { url: "https://example.com/old", title: "Docs archive", visitedAt: 2 },
      { url: "https://example.com/ignored", title: "Unrelated", visitedAt: 5 },
    ] satisfies readonly InAppBrowserHistoryEntry[]

    expect(searchBenchNewTabBrowserHistory(history, "docs").map((entry) => entry.url)).toEqual([
      "https://example.com/docs",
      "https://google.com/search?q=docs",
      "https://example.com/old",
      "https://docs.example.com/",
    ])
  })
})
