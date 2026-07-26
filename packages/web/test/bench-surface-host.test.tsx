import { afterEach, describe, expect, test } from "bun:test"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { useEffect, useRef, type ReactNode } from "react"
import {
  useBenchSurfaceActive,
  useOnBenchSurfaceActivated,
} from "../src/components/bench/bench-surface-activity"
import { BenchSurfaceHost } from "../src/components/bench/bench-surface-host"
import { benchTargetKey, type BenchTarget } from "../src/lib/bench-navigation"

const FIRST_TARGET: BenchTarget = {
  type: "workspace-file",
  path: "docs/first.md",
  viewer: "markdown",
}
const SECOND_TARGET: BenchTarget = {
  type: "workspace-file",
  path: "docs/second.md",
  viewer: "markdown",
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
) {
  await act(async () => {
    root?.render(
      <BenchSurfaceHost
        directory="/workspace"
        activeTarget={target}
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
      />,
    )
  })
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
  })

  test("mounts the newly active surface in the same render, without an empty frame", async () => {
    mountCounts.clear()
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)

    await renderHost(FIRST_TARGET)

    expect(
      container.querySelector(`[data-testid="surface-${benchTargetKey(FIRST_TARGET)}"]`),
    ).not.toBeNull()
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
})
