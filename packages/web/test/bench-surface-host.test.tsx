import { afterEach, describe, expect, test } from "bun:test"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { useEffect, useRef, type ReactNode } from "react"
import {
  useBenchSurfaceActive,
  useOnBenchSurfaceActivated,
} from "../src/components/bench/bench-surface-activity"
import {
  BenchSurfaceHost,
  benchSurfaceInstancePresentation,
} from "../src/components/bench/bench-surface-host"
import { PlatformProvider, type Platform } from "../src/context/platform"
import { benchTargetKey, type BenchTarget } from "../src/lib/bench-navigation"

const FIRST_TARGET: BenchTarget = {
  type: "workspace-file",
  root: "notebook",
  path: "docs/first.md",
  viewer: "markdown",
}
const SECOND_TARGET: BenchTarget = {
  type: "workspace-file",
  root: "notebook",
  path: "docs/second.md",
  viewer: "markdown",
}

function heavyTarget(objectID: string, kind: "html-widget" | "whiteboard"): BenchTarget {
  return {
    type: "object",
    ref: { kind, objectID, revisionID: null, itemID: null },
    viewID: "canvas",
  }
}

function readerTarget(objectID: string): BenchTarget {
  return {
    type: "object",
    ref: { kind: "resource", objectID, revisionID: null, itemID: null },
    viewID: "reader",
  }
}

const BROWSER_TARGET: BenchTarget = {
  type: "browser",
  tabID: "tab-1",
  url: "https://example.com/",
}
const SECOND_BROWSER_TARGET: BenchTarget = {
  type: "browser",
  tabID: "tab-2",
  url: "https://example.org/",
}

function desktopPlatform(os: "macos" | "windows" | "linux"): Platform {
  return {
    platform: "desktop",
    os,
    openLink: () => undefined,
    restart: async () => undefined,
    back: () => undefined,
    forward: () => undefined,
    notify: async () => undefined,
  }
}

let root: Root | undefined
let container: HTMLDivElement | undefined

afterEach(async () => {
  if (root) {
    await act(async () => {
      root?.unmount()
    })
  }
  container?.remove()
  root = undefined
  container = undefined
})

/**
 * Counts how many times each target's subtree was constructed. The whole point of the host is that
 * this stays at one across chat switches: a remount is what rebuilds Monaco, Excalidraw, and
 * iframes and shows their loading states again.
 */
const mountCounts = new Map<string, number>()
const activationCounts = new Map<string, number>()

function CountingSurface(props: { activationIdentity?: string; targetKey: string }) {
  const counted = useRef(false)
  const active = useBenchSurfaceActive()
  useOnBenchSurfaceActivated(() => {
    activationCounts.set(props.targetKey, (activationCounts.get(props.targetKey) ?? 0) + 1)
  }, props.activationIdentity)
  useEffect(() => {
    if (counted.current) return
    counted.current = true
    mountCounts.set(props.targetKey, (mountCounts.get(props.targetKey) ?? 0) + 1)
  }, [props.targetKey])
  return (
    <div
      data-testid={`surface-${props.targetKey}`}
      data-runtime-active={active ? "true" : "false"}
    />
  )
}

function StableProvider(props: { active: boolean; children: ReactNode }) {
  return <div data-active={props.active ? "true" : "false"}>{props.children}</div>
}

async function renderHost(
  target: BenchTarget | null,
  benchVisible = true,
  activationIdentity?: string,
  retainedTargets: readonly BenchTarget[] = [FIRST_TARGET, SECOND_TARGET],
  platform?: Platform,
  covered = false,
) {
  const host = (
    <BenchSurfaceHost
      directory="/workspace"
      activeTarget={target}
      covered={covered}
      retainedTargetKeys={retainedTargets.map(benchTargetKey)}
      benchVisible={benchVisible}
      activeRuntimeState={undefined}
      renderContext={(input) => (
        <StableProvider active={input.active}>{input.children}</StableProvider>
      )}
      renderSurface={(instanceTarget) => (
        <CountingSurface
          activationIdentity={activationIdentity}
          targetKey={benchTargetKey(instanceTarget)}
        />
      )}
    />
  )
  await act(async () => {
    root?.render(platform ? <PlatformProvider value={platform}>{host}</PlatformProvider> : host)
  })
}

function instanceForTarget(target: BenchTarget): HTMLElement | undefined {
  const key = benchTargetKey(target)
  const match = [
    ...(container?.querySelectorAll('[data-component="bench-surface-instance"]') ?? []),
  ].find((node) => node.getAttribute("data-target-key") === key)
  return match instanceof HTMLElement ? match : undefined
}

describe("BenchSurfaceHost", () => {
  test("keeps a surface mounted across a park and unpark round trip", async () => {
    mountCounts.clear()
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)

    await renderHost(FIRST_TARGET)
    // A chat transition projects a closed route before the destination resolves.
    await renderHost(null)
    await renderHost(SECOND_TARGET)
    await renderHost(FIRST_TARGET)

    expect(mountCounts.get(benchTargetKey(FIRST_TARGET))).toBe(1)
    expect(mountCounts.get(benchTargetKey(SECOND_TARGET))).toBe(1)
  })

  test("shows the active surface and hides the parked one", async () => {
    mountCounts.clear()
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)

    await renderHost(FIRST_TARGET)
    await renderHost(SECOND_TARGET)

    const instances = container.querySelectorAll('[data-component="bench-surface-instance"]')
    expect(instances).toHaveLength(2)
    const activeKeys = [...instances]
      .filter((node) => node.getAttribute("data-surface-active") === "true")
      .map((node) => node.getAttribute("data-target-key"))
    expect(activeKeys).toEqual([benchTargetKey(SECOND_TARGET)])

    const parkedInstance = [...instances].find(
      (node) => node.getAttribute("data-surface-active") === "false",
    )
    expect(parkedInstance?.classList.contains("opacity-0")).toBeTrue()
    expect(parkedInstance?.hasAttribute("inert")).toBeTrue()
    expect(parkedInstance?.getAttribute("aria-hidden")).toBe("true")
  })

  test("releases a surface when no chat tab retains its exact target", async () => {
    mountCounts.clear()
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)

    await renderHost(FIRST_TARGET)
    await renderHost(SECOND_TARGET, true, undefined, [SECOND_TARGET])

    const instances = container.querySelectorAll('[data-component="bench-surface-instance"]')
    expect(
      [...instances].some(
        (instance) => instance.getAttribute("data-target-key") === benchTargetKey(FIRST_TARGET),
      ),
    ).toBeFalse()
    expect(instances).toHaveLength(1)
  })

  test("retains the route target while its tab commit is still pending", async () => {
    mountCounts.clear()
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)

    await renderHost(FIRST_TARGET, true, undefined, [])

    const instances = container.querySelectorAll('[data-component="bench-surface-instance"]')
    expect(instances).toHaveLength(1)
    expect(instances[0]?.getAttribute("data-target-key")).toBe(benchTargetKey(FIRST_TARGET))
  })

  test("bounds mounted heavy surfaces when many tabs across chats remain open", async () => {
    mountCounts.clear()
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    const retainedTargets = [
      heavyTarget("board-1", "whiteboard"),
      heavyTarget("widget-1", "html-widget"),
      heavyTarget("board-2", "whiteboard"),
      heavyTarget("widget-2", "html-widget"),
      heavyTarget("board-3", "whiteboard"),
    ]

    for (const target of retainedTargets) {
      await renderHost(target, true, undefined, retainedTargets)
    }

    const instances = container.querySelectorAll('[data-component="bench-surface-instance"]')
    expect(instances).toHaveLength(4)
    expect([...instances].map((instance) => instance.getAttribute("data-target-key"))).toEqual(
      retainedTargets.slice(-4).map(benchTargetKey),
    )
  })

  test("keeps every open reader mounted while switching across more than two reader tabs", async () => {
    mountCounts.clear()
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    const retainedTargets = ["book-1", "book-2", "book-3", "book-4", "book-5"].map(readerTarget)

    for (const target of retainedTargets) {
      await renderHost(target, true, undefined, retainedTargets)
    }
    await renderHost(retainedTargets[0] ?? null, true, undefined, retainedTargets)

    const instances = container.querySelectorAll('[data-component="bench-surface-instance"]')
    expect(instances).toHaveLength(retainedTargets.length)
    for (const target of retainedTargets) {
      expect(mountCounts.get(benchTargetKey(target))).toBe(1)
    }
  })

  test("never moves an already-mounted reader when its LRU position changes", async () => {
    mountCounts.clear()
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    const retainedTargets = ["book-1", "book-2", "book-3"].map(readerTarget)

    for (const target of retainedTargets) {
      await renderHost(target, true, undefined, retainedTargets)
    }

    const originalInstances = [
      ...container.querySelectorAll<HTMLElement>('[data-component="bench-surface-instance"]'),
    ]
    expect(originalInstances.map((instance) => instance.dataset.targetKey)).toEqual(
      retainedTargets.map(benchTargetKey),
    )

    // React must only change visibility here. Rendering the LRU array directly would reorder the
    // first instance to the end, physically moving any reader iframe owned by that subtree.
    await renderHost(retainedTargets[0] ?? null, true, undefined, retainedTargets)

    const reactivatedInstances = [
      ...container.querySelectorAll<HTMLElement>('[data-component="bench-surface-instance"]'),
    ]
    expect(reactivatedInstances.map((instance) => instance.dataset.targetKey)).toEqual(
      retainedTargets.map(benchTargetKey),
    )
    expect(reactivatedInstances).toEqual(originalInstances)
    for (const target of retainedTargets) {
      expect(mountCounts.get(benchTargetKey(target))).toBe(1)
    }
  })

  test("parks runtime work while a retained Bench target is collapsed", async () => {
    mountCounts.clear()
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)

    await renderHost(FIRST_TARGET, false)

    expect(
      container
        .querySelector(`[data-testid="surface-${benchTargetKey(FIRST_TARGET)}"]`)
        ?.getAttribute("data-runtime-active"),
    ).toBe("false")

    await renderHost(FIRST_TARGET, true)

    expect(
      container
        .querySelector(`[data-testid="surface-${benchTargetKey(FIRST_TARGET)}"]`)
        ?.getAttribute("data-runtime-active"),
    ).toBe("true")
    expect(mountCounts.get(benchTargetKey(FIRST_TARGET))).toBe(1)
  })

  test("parks a covered selection without losing or remounting its retained instance", async () => {
    mountCounts.clear()
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)

    await renderHost(FIRST_TARGET, true, undefined, [])
    const originalInstance = instanceForTarget(FIRST_TARGET)

    await renderHost(FIRST_TARGET, false, undefined, [], undefined, true)

    const coveredInstance = instanceForTarget(FIRST_TARGET)
    expect(coveredInstance).toBe(originalInstance)
    expect(coveredInstance?.getAttribute("data-surface-active")).toBe("false")
    expect(coveredInstance?.hasAttribute("inert")).toBeTrue()

    await renderHost(FIRST_TARGET, true, undefined, [], undefined, false)
    expect(instanceForTarget(FIRST_TARGET)).toBe(originalInstance)
    expect(mountCounts.get(benchTargetKey(FIRST_TARGET))).toBe(1)
  })

  test("notifies a kept-alive surface when it is revealed or rebound while active", async () => {
    mountCounts.clear()
    activationCounts.clear()
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)

    await renderHost(FIRST_TARGET, true, "session-a")
    expect(activationCounts.get(benchTargetKey(FIRST_TARGET))).toBeUndefined()

    await renderHost(FIRST_TARGET, true, "session-b")
    expect(activationCounts.get(benchTargetKey(FIRST_TARGET))).toBe(1)

    await renderHost(SECOND_TARGET, true, "session-b")
    await renderHost(FIRST_TARGET, true, "session-b")

    expect(activationCounts.get(benchTargetKey(FIRST_TARGET))).toBe(2)
    expect(mountCounts.get(benchTargetKey(FIRST_TARGET))).toBe(1)
  })

  test("parks an inactive macOS browser offscreen without visibility:hidden classes", async () => {
    mountCounts.clear()
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)

    await renderHost(
      BROWSER_TARGET,
      true,
      undefined,
      [BROWSER_TARGET, SECOND_BROWSER_TARGET],
      desktopPlatform("macos"),
    )
    await renderHost(
      SECOND_BROWSER_TARGET,
      true,
      undefined,
      [BROWSER_TARGET, SECOND_BROWSER_TARGET],
      desktopPlatform("macos"),
    )

    const parked = instanceForTarget(BROWSER_TARGET)
    const active = instanceForTarget(SECOND_BROWSER_TARGET)
    expect(parked?.getAttribute("data-keep-webview-paintable")).toBe("true")
    expect(parked?.classList.contains("invisible")).toBeFalse()
    expect(parked?.classList.contains("opacity-0")).toBeFalse()
    expect(parked?.classList.contains("pointer-events-none")).toBeTrue()
    expect(parked?.style.position).toBe("fixed")
    expect(parked?.style.left).toBe("-100000px")
    expect(parked?.style.top).toBe("-100000px")
    expect(parked?.hasAttribute("inert")).toBeTrue()
    expect(parked?.getAttribute("aria-hidden")).toBe("true")

    expect(active?.getAttribute("data-keep-webview-paintable")).toBe("true")
    expect(active?.hasAttribute("inert")).toBeFalse()
    expect(active?.style.left).toBe("")
  })

  test("keeps the current hide classes for parked Windows browsers and macOS files", async () => {
    mountCounts.clear()
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)

    await renderHost(
      BROWSER_TARGET,
      true,
      undefined,
      [BROWSER_TARGET, SECOND_BROWSER_TARGET],
      desktopPlatform("windows"),
    )
    await renderHost(
      SECOND_BROWSER_TARGET,
      true,
      undefined,
      [BROWSER_TARGET, SECOND_BROWSER_TARGET],
      desktopPlatform("windows"),
    )

    const parkedWindowsBrowser = instanceForTarget(BROWSER_TARGET)
    expect(parkedWindowsBrowser?.hasAttribute("data-keep-webview-paintable")).toBeFalse()
    expect(parkedWindowsBrowser?.classList.contains("invisible")).toBeTrue()
    expect(parkedWindowsBrowser?.classList.contains("opacity-0")).toBeTrue()
    expect(parkedWindowsBrowser?.style.left).toBe("")

    await renderHost(
      FIRST_TARGET,
      true,
      undefined,
      [FIRST_TARGET, SECOND_TARGET],
      desktopPlatform("macos"),
    )
    await renderHost(
      SECOND_TARGET,
      true,
      undefined,
      [FIRST_TARGET, SECOND_TARGET],
      desktopPlatform("macos"),
    )

    const parkedMacosFile = instanceForTarget(FIRST_TARGET)
    expect(parkedMacosFile?.hasAttribute("data-keep-webview-paintable")).toBeFalse()
    expect(parkedMacosFile?.classList.contains("invisible")).toBeTrue()
    expect(parkedMacosFile?.classList.contains("opacity-0")).toBeTrue()
  })
})

describe("benchSurfaceInstancePresentation", () => {
  test("keeps a parked macOS browser paintable and offscreen", () => {
    const presentation = benchSurfaceInstancePresentation({
      state: "parked",
      target: "browser",
      os: "macos",
    })

    expect(presentation.keepWebviewPaintable).toBeTrue()
    expect(presentation.className.includes("invisible")).toBeFalse()
    expect(presentation.className.includes("opacity-0")).toBeFalse()
    expect(presentation.className.includes("pointer-events-none")).toBeTrue()
    expect(presentation.style).toEqual({
      position: "fixed",
      left: -100_000,
      top: -100_000,
      zIndex: -1,
    })
  })

  test("hides parked browsers on other platforms and parked non-browser surfaces on macOS", () => {
    const parkedWindowsBrowser = benchSurfaceInstancePresentation({
      state: "parked",
      target: "browser",
      os: "other",
    })
    const parkedMacosFile = benchSurfaceInstancePresentation({
      state: "parked",
      target: "other",
      os: "macos",
    })

    for (const presentation of [parkedWindowsBrowser, parkedMacosFile]) {
      expect(presentation.keepWebviewPaintable).toBeFalse()
      expect(presentation.className.includes("invisible")).toBeTrue()
      expect(presentation.className.includes("opacity-0")).toBeTrue()
      expect(presentation.style).toBeUndefined()
    }
  })

  test("marks only macOS browser instances as keep-paintable while active", () => {
    expect(
      benchSurfaceInstancePresentation({
        state: "active",
        target: "browser",
        os: "macos",
      }).keepWebviewPaintable,
    ).toBeTrue()
    expect(
      benchSurfaceInstancePresentation({
        state: "active",
        target: "browser",
        os: "other",
      }).keepWebviewPaintable,
    ).toBeFalse()
    expect(
      benchSurfaceInstancePresentation({
        state: "active",
        target: "other",
        os: "macos",
      }).keepWebviewPaintable,
    ).toBeFalse()
  })
})
