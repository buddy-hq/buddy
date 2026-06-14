import { describe, expect, test } from "bun:test"
import {
  BENCH_CHAT_LAYOUT_FLOATING,
  openBench,
  resolveBenchRouteViewTransitionTypes,
} from "../src/lib/bench-navigation"
import { encodeDirectory } from "../src/lib/directory-token"

describe("bench navigation", () => {
  const directory = "/repo/project"
  const directoryToken = encodeDirectory(directory)

  test("maps Markdown targets to the clean Bench document route", () => {
    expect(openBench(directory, { type: "markdown", path: "docs/worksheet.md" })).toEqual({
      to: "/$directory/markdown",
      params: { directory: directoryToken },
      search: { path: "docs/worksheet.md" },
    })
  })

  test("maps kind-specific artifact targets to their Bench routes", () => {
    expect(
      openBench(directory, {
        type: "artifact",
        kind: "media-presentation",
        artifactID: "artifact-1",
        itemID: "item-1",
      }),
    ).toEqual({
      to: "/$directory/artifacts/media-presentation/$artifactID",
      params: { directory: directoryToken, artifactID: "artifact-1" },
      search: { item: "item-1" },
    })

    expect(
      openBench(directory, {
        type: "artifact",
        kind: "question-set",
        artifactID: "question-set-1",
      }),
    ).toEqual({
      to: "/$directory/artifacts/question-set/$artifactID",
      params: { directory: directoryToken, artifactID: "question-set-1" },
    })
  })

  test("adds floating chat search when requested", () => {
    expect(
      openBench(
        directory,
        {
          type: "artifact",
          kind: "html-widget",
          artifactID: "widget-1",
        },
        { chatLayout: BENCH_CHAT_LAYOUT_FLOATING },
      ),
    ).toEqual({
      to: "/$directory/artifacts/html-widget/$artifactID",
      params: { directory: directoryToken, artifactID: "widget-1" },
      search: { benchChat: "floating" },
    })
  })

  test("classifies chat and Bench route view transitions", () => {
    expect(
      resolveBenchRouteViewTransitionTypes({
        fromLocation: { pathname: `/${directoryToken}/chat` },
        toLocation: { pathname: `/${directoryToken}/artifacts/html-widget/widget-1` },
        pathChanged: true,
      }),
    ).toEqual(["bench-route", "bench-open"])

    expect(
      resolveBenchRouteViewTransitionTypes({
        fromLocation: { pathname: `/${directoryToken}/whiteboard` },
        toLocation: { pathname: `/${directoryToken}/chat` },
        pathChanged: true,
      }),
    ).toEqual(["bench-route", "bench-close"])

    expect(
      resolveBenchRouteViewTransitionTypes({
        fromLocation: { pathname: "/settings" },
        toLocation: { pathname: `/${directoryToken}/chat` },
        pathChanged: true,
      }),
    ).toBe(false)
  })
})
