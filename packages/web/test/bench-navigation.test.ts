import { describe, expect, test } from "bun:test"
import {
  BENCH_AUTO_OPEN_POLICY_WHITEBOARD,
  BENCH_CHAT_LAYOUT_DOCKED,
  BENCH_CHAT_LAYOUT_FLOATING,
  BENCH_LAYOUT_PROFILE_BALANCED,
  BENCH_LAYOUT_PROFILE_BENCH_FIRST,
  BENCH_MODE_REQUEST_POLICY,
  classifyBenchTransition,
  isBenchRoutePathname,
  readBenchOpenPolicyStateFromLocation,
  readBenchTargetFromLocation,
  resolveBenchLayoutDefaults,
  resolveBenchOpenPolicy,
  resolveBenchRouteViewTransitionTypes,
  resolveBenchSurfaceDefaults,
  type BenchOpenDecision,
  type BenchOpenPolicyState,
  type BenchOpenRequest,
  type BenchPresentationPreferences,
  type BenchTarget,
} from "../src/lib/bench-navigation"
import { encodeDirectory } from "../src/lib/directory-token"

const DIRECTORY = "/workspace/buddy"
const RESOURCE_OBJECT_TARGET = {
  type: "object",
  ref: {
    kind: "resource",
    objectID: "resource-1",
    revisionID: null,
    itemID: null,
  },
  viewID: "reader",
} satisfies BenchTarget
const WHITEBOARD_OBJECT_TARGET = {
  type: "object",
  ref: {
    kind: "whiteboard",
    objectID: "whiteboard-1",
    revisionID: null,
    itemID: null,
  },
  viewID: "current",
} satisfies BenchTarget
const HTML_WIDGET_OBJECT_TARGET = {
  type: "object",
  ref: {
    kind: "html-widget",
    objectID: "widget-1",
    revisionID: null,
    itemID: null,
  },
  viewID: "runtime",
} satisfies BenchTarget

const EMPTY_PREFERENCES = {
  modeBySurface: {},
} satisfies BenchPresentationPreferences

function resolveOpenPolicy(input: {
  request: BenchOpenRequest
  current?: BenchOpenPolicyState
  preferences?: BenchPresentationPreferences
  autoOpenSuppressed?: boolean
}): BenchOpenDecision {
  return resolveBenchOpenPolicy({
    request: input.request,
    current: input.current ?? { status: "closed" },
    defaults: resolveBenchSurfaceDefaults(input.request.target),
    preferences: input.preferences ?? EMPTY_PREFERENCES,
    autoOpenSuppressed: input.autoOpenSuppressed ?? false,
  })
}

function openRequest(target: BenchTarget): BenchOpenRequest {
  return {
    directory: DIRECTORY,
    target,
    mode: BENCH_MODE_REQUEST_POLICY,
    autoOpen: null,
  }
}

describe("bench navigation policy", () => {
  test("resolves locked layout profile defaults", () => {
    expect(
      resolveBenchLayoutDefaults({
        profile: BENCH_LAYOUT_PROFILE_BALANCED,
        viewport: { widthPx: 1_200, heightPx: 900, safeTopPx: 24 },
      }),
    ).toMatchObject({
      dockedChatWidthPx: 480,
      dockedChatMinWidthPx: 320,
      dockedChatMaxWidthPx: 660,
      benchMinWidthPx: 320,
      floatingMarginPx: 24,
      floatingMinWidthPx: 440,
      floatingMinHeightPx: 460,
    })

    expect(
      resolveBenchLayoutDefaults({
        profile: BENCH_LAYOUT_PROFILE_BENCH_FIRST,
        viewport: { widthPx: 1_200, heightPx: 900, safeTopPx: 24 },
      }),
    ).toMatchObject({
      dockedChatWidthPx: 380,
      dockedChatMinWidthPx: 320,
      dockedChatMaxWidthPx: 504,
      benchMinWidthPx: 480,
      floatingMarginPx: 24,
      floatingMinWidthPx: 360,
      floatingMinHeightPx: 380,
    })
  })

  test("resolves locked surface defaults", () => {
    expect(resolveBenchSurfaceDefaults(RESOURCE_OBJECT_TARGET)).toEqual({
      mode: BENCH_CHAT_LAYOUT_DOCKED,
      layoutProfile: BENCH_LAYOUT_PROFILE_BALANCED,
    })
    expect(resolveBenchSurfaceDefaults(WHITEBOARD_OBJECT_TARGET)).toEqual({
      mode: BENCH_CHAT_LAYOUT_FLOATING,
      layoutProfile: BENCH_LAYOUT_PROFILE_BENCH_FIRST,
    })
    expect(resolveBenchSurfaceDefaults(HTML_WIDGET_OBJECT_TARGET)).toEqual({
      mode: BENCH_CHAT_LAYOUT_FLOATING,
      layoutProfile: BENCH_LAYOUT_PROFILE_BENCH_FIRST,
    })
  })

  test("uses target default mode when entering bench from closed state", () => {
    expect(resolveOpenPolicy({ request: openRequest(WHITEBOARD_OBJECT_TARGET) })).toMatchObject({
      action: "open",
      mode: BENCH_CHAT_LAYOUT_FLOATING,
      layoutProfile: BENCH_LAYOUT_PROFILE_BENCH_FIRST,
      policyID: "target-default-mode",
      dockedWidth: "use-profile",
      floatingSize: "use-profile",
      floatingPosition: "use-profile",
    })
  })

  test("saved surface mode preference wins over target default", () => {
    expect(
      resolveOpenPolicy({
        request: openRequest(WHITEBOARD_OBJECT_TARGET),
        preferences: {
          modeBySurface: {
            whiteboard: BENCH_CHAT_LAYOUT_DOCKED,
          },
        },
      }),
    ).toMatchObject({
      action: "open",
      mode: BENCH_CHAT_LAYOUT_DOCKED,
      policyID: "saved-surface-mode",
    })
  })

  test("policy mode preserves current live mode while bench is already open", () => {
    const currentTarget = { type: "workspace-file", path: "notes.md", viewer: "markdown" } satisfies BenchTarget
    expect(
      resolveOpenPolicy({
        request: openRequest({ type: "workspace-file", path: "diagram.png", viewer: "file" }),
        current: {
          status: "open",
          directory: DIRECTORY,
          target: currentTarget,
          mode: BENCH_CHAT_LAYOUT_FLOATING,
          layoutProfile: resolveBenchSurfaceDefaults(currentTarget).layoutProfile,
        },
      }),
    ).toMatchObject({
      action: "open",
      mode: BENCH_CHAT_LAYOUT_FLOATING,
      policyID: "preserved-current-mode",
      dockedWidth: "preserve",
      floatingSize: "preserve",
      floatingPosition: "preserve",
    })
  })

  test("auto-open does not replace a different active bench target", () => {
    const currentTarget = { type: "workspace-file", path: "notes.md", viewer: "markdown" } satisfies BenchTarget
    expect(
      resolveOpenPolicy({
        request: {
          directory: DIRECTORY,
          target: WHITEBOARD_OBJECT_TARGET,
          mode: BENCH_MODE_REQUEST_POLICY,
          autoOpen: {
            policyID: BENCH_AUTO_OPEN_POLICY_WHITEBOARD,
            eventKey: "message-1:part-1",
          },
        },
        current: {
          status: "open",
          directory: DIRECTORY,
          target: currentTarget,
          mode: BENCH_CHAT_LAYOUT_DOCKED,
          layoutProfile: resolveBenchSurfaceDefaults(currentTarget).layoutProfile,
        },
      }),
    ).toEqual({
      action: "ignore",
      policyID: "auto-open-not-authorized",
    })
  })

  test("auto-open suppression is resolved by the central open policy", () => {
    expect(
      resolveOpenPolicy({
        request: {
          directory: DIRECTORY,
          target: WHITEBOARD_OBJECT_TARGET,
          mode: BENCH_MODE_REQUEST_POLICY,
          autoOpen: {
            policyID: BENCH_AUTO_OPEN_POLICY_WHITEBOARD,
            eventKey: "message-1:part-1",
          },
        },
        autoOpenSuppressed: true,
      }),
    ).toEqual({
      action: "ignore",
      policyID: "auto-open-suppressed",
    })
  })

  test("classifies bench transitions from policy states", () => {
    const markdownTarget = { type: "workspace-file", path: "notes.md", viewer: "markdown" } satisfies BenchTarget
    const fileTarget = { type: "workspace-file", path: "diagram.png", viewer: "file" } satisfies BenchTarget
    const openMarkdownDocked = {
      status: "open",
      directory: DIRECTORY,
      target: markdownTarget,
      mode: BENCH_CHAT_LAYOUT_DOCKED,
      layoutProfile: resolveBenchSurfaceDefaults(markdownTarget).layoutProfile,
    } satisfies BenchOpenPolicyState

    expect(
      classifyBenchTransition({
        previous: { status: "closed" },
        next: openMarkdownDocked,
      }),
    ).toBe("enter")
    expect(
      classifyBenchTransition({
        previous: openMarkdownDocked,
        next: { status: "closed" },
      }),
    ).toBe("exit")
    expect(
      classifyBenchTransition({
        previous: openMarkdownDocked,
        next: {
          ...openMarkdownDocked,
          target: fileTarget,
          layoutProfile: resolveBenchSurfaceDefaults(fileTarget).layoutProfile,
        },
      }),
    ).toBe("replace")
    expect(
      classifyBenchTransition({
        previous: openMarkdownDocked,
        next: {
          ...openMarkdownDocked,
          mode: BENCH_CHAT_LAYOUT_FLOATING,
        },
      }),
    ).toBe("change-mode")
    expect(
      classifyBenchTransition({
        previous: openMarkdownDocked,
        next: {
          ...openMarkdownDocked,
          target: fileTarget,
          mode: BENCH_CHAT_LAYOUT_FLOATING,
          layoutProfile: resolveBenchSurfaceDefaults(fileTarget).layoutProfile,
        },
      }),
    ).toBe("replace-and-change-mode")
    expect(
      classifyBenchTransition({
        previous: openMarkdownDocked,
        next: openMarkdownDocked,
      }),
    ).toBe("none")
  })

  test("maps route view transitions through bench policy-state classification", () => {
    const directoryParam = encodeDirectory(DIRECTORY)
    const markdownPathname = `/${directoryParam}/markdown`
    const filePathname = `/${directoryParam}/file`
    const chatPathname = `/${directoryParam}/chat`

    expect(
      resolveBenchRouteViewTransitionTypes({
        pathChanged: true,
        fromLocation: { pathname: chatPathname, search: {} },
        toLocation: { pathname: markdownPathname, search: { path: "notes.md" } },
      }),
    ).toEqual(["bench-route", "bench-open"])

    expect(
      resolveBenchRouteViewTransitionTypes({
        pathChanged: true,
        fromLocation: { pathname: markdownPathname, search: { path: "notes.md" } },
        toLocation: { pathname: chatPathname, search: {} },
      }),
    ).toEqual(["bench-route", "bench-close"])

    expect(
      resolveBenchRouteViewTransitionTypes({
        pathChanged: true,
        fromLocation: { pathname: markdownPathname, search: { path: "notes.md" } },
        toLocation: { pathname: filePathname, search: { path: "diagram.png" } },
      }),
    ).toEqual(["bench-route", "bench-swap"])

    expect(
      resolveBenchRouteViewTransitionTypes({
        pathChanged: false,
        hrefChanged: true,
        fromLocation: { pathname: markdownPathname, search: { path: "notes.md" } },
        toLocation: {
          pathname: markdownPathname,
          search: { path: "notes.md", benchChat: BENCH_CHAT_LAYOUT_FLOATING },
        },
      }),
    ).toBe(false)
  })

  test("reads pathless and explicit bench object routes as the same target", () => {
    const directoryParam = encodeDirectory(DIRECTORY)
    const pathlessPathname = `/${directoryParam}/objects/whiteboard/whiteboard-1`
    const explicitPathname = `/${directoryParam}/_bench/objects/whiteboard/whiteboard-1`
    const search = { view: "current", benchChat: BENCH_CHAT_LAYOUT_FLOATING }

    expect(isBenchRoutePathname(pathlessPathname)).toBe(true)
    expect(isBenchRoutePathname(explicitPathname)).toBe(true)
    expect(readBenchTargetFromLocation({ pathname: pathlessPathname, search })).toEqual(
      WHITEBOARD_OBJECT_TARGET,
    )
    expect(readBenchTargetFromLocation({ pathname: explicitPathname, search })).toEqual(
      WHITEBOARD_OBJECT_TARGET,
    )
    expect(
      readBenchOpenPolicyStateFromLocation({
        directory: DIRECTORY,
        pathname: explicitPathname,
        search,
      }),
    ).toMatchObject({
      status: "open",
      directory: DIRECTORY,
      target: WHITEBOARD_OBJECT_TARGET,
      mode: BENCH_CHAT_LAYOUT_FLOATING,
    })
  })
})
