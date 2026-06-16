import { describe, expect, test } from "bun:test"
import {
  BENCH_AUTO_OPEN_POLICY_WHITEBOARD,
  BENCH_CHAT_LAYOUT_DOCKED,
  BENCH_CHAT_LAYOUT_FLOATING,
  BENCH_LAYOUT_PROFILE_BALANCED,
  BENCH_LAYOUT_PROFILE_BENCH_FIRST,
  BENCH_MODE_REQUEST_POLICY,
  classifyBenchTransition,
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
    expect(resolveBenchSurfaceDefaults({ type: "reading", path: "book.epub" })).toEqual({
      mode: BENCH_CHAT_LAYOUT_DOCKED,
      layoutProfile: BENCH_LAYOUT_PROFILE_BALANCED,
    })
    expect(resolveBenchSurfaceDefaults({ type: "whiteboard" })).toEqual({
      mode: BENCH_CHAT_LAYOUT_FLOATING,
      layoutProfile: BENCH_LAYOUT_PROFILE_BENCH_FIRST,
    })
    expect(
      resolveBenchSurfaceDefaults({
        type: "artifact",
        kind: "html-widget",
        artifactID: "widget-1",
      }),
    ).toEqual({
      mode: BENCH_CHAT_LAYOUT_FLOATING,
      layoutProfile: BENCH_LAYOUT_PROFILE_BENCH_FIRST,
    })
  })

  test("uses target default mode when entering bench from closed state", () => {
    expect(resolveOpenPolicy({ request: openRequest({ type: "whiteboard" }) })).toMatchObject({
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
        request: openRequest({ type: "whiteboard" }),
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
    const currentTarget = { type: "markdown", path: "notes.md" } satisfies BenchTarget
    expect(
      resolveOpenPolicy({
        request: openRequest({ type: "file", path: "diagram.png" }),
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
    const currentTarget = { type: "markdown", path: "notes.md" } satisfies BenchTarget
    expect(
      resolveOpenPolicy({
        request: {
          directory: DIRECTORY,
          target: { type: "whiteboard" },
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
          target: { type: "whiteboard" },
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
    const markdownTarget = { type: "markdown", path: "notes.md" } satisfies BenchTarget
    const fileTarget = { type: "file", path: "diagram.png" } satisfies BenchTarget
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
})
