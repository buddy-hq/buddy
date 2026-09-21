import "../happydom"
import { afterEach, describe, expect, test } from "bun:test"
import { act, type ReactNode } from "react"
import { createRoot, type Root } from "react-dom/client"
import type { UpdateActivity, UpdateState } from "@buddy/update-contract"
import { UPDATE_CHECK_MENU_COMMAND } from "@buddy/update-contract"
import { PlatformProvider, type Platform } from "../src/context/platform"
import { UpdateMenuCommandHandler } from "../src/components/updates/update-menu-command-handler"
import { useUpdateCommands, useUpdateState } from "../src/state/desktop-update"

function updateState(revision: number, activity: UpdateActivity): UpdateState {
  return {
    revision,
    ring: "stable",
    currentVersion: "0.14.2",
    activity,
    releaseNotes: [],
  }
}

function basePlatform(): Platform {
  return {
    platform: "desktop",
    version: "0.14.2",
    openLink: () => undefined,
    restart: async () => undefined,
    back: () => undefined,
    forward: () => undefined,
    notify: async () => undefined,
  }
}

function UpdateStateProbe() {
  const state = useUpdateState()
  const { check } = useUpdateCommands()
  return (
    <button type="button" data-action="update-state-probe" onClick={() => void check()}>
      {state.revision}:{state.activity.status}
    </button>
  )
}

describe("desktop update state ordering", () => {
  let container: HTMLDivElement | null = null
  let root: Root | null = null

  afterEach(() => {
    act(() => root?.unmount())
    root = null
    container?.remove()
    container = null
    Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT")
  })

  async function render(children: ReactNode, platform: Platform) {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => {
      root?.render(<PlatformProvider value={platform}>{children}</PlatformProvider>)
    })
  }

  test("does not let a delayed initial snapshot replace a newer pushed event", async () => {
    const initial = Promise.withResolvers<UpdateState>()
    let publish: ((state: UpdateState) => void) | undefined
    const platform: Platform = {
      ...basePlatform(),
      getUpdateState: () => initial.promise,
      onUpdateState: (listener) => {
        publish = listener
        return () => undefined
      },
    }
    await render(<UpdateStateProbe />, platform)

    await act(async () => {
      publish?.(updateState(2, { status: "available", version: "0.16.0" }))
    })
    expect(container?.textContent).toBe("2:available")

    await act(async () => {
      initial.resolve(updateState(1, { status: "up-to-date" }))
      await initial.promise
    })
    expect(container?.textContent).toBe("2:available")
  })

  test("does not let a delayed command reply replace a newer pushed event", async () => {
    const command = Promise.withResolvers<UpdateState>()
    let publish: ((state: UpdateState) => void) | undefined
    const platform: Platform = {
      ...basePlatform(),
      getUpdateState: async () => updateState(1, { status: "idle" }),
      onUpdateState: (listener) => {
        publish = listener
        return () => undefined
      },
      checkUpdate: () => command.promise,
    }
    await render(<UpdateStateProbe />, platform)

    await act(async () => {
      container?.querySelector<HTMLButtonElement>('[data-action="update-state-probe"]')?.click()
      publish?.(updateState(3, { status: "available", version: "0.17.0" }))
    })

    await act(async () => {
      command.resolve(updateState(2, { status: "up-to-date" }))
      await command.promise
    })
    expect(container?.textContent).toBe("3:available")
  })

  test("opens the visible update surface before a native menu check", async () => {
    const order: string[] = []
    const checked = Promise.withResolvers<void>()
    const platform: Platform = {
      ...basePlatform(),
      checkUpdate: async () => {
        order.push("check")
        checked.resolve()
        return updateState(1, { status: "up-to-date" })
      },
    }
    await render(
      <UpdateMenuCommandHandler
        openUpdateSurface={async () => {
          order.push("open")
        }}
      />,
      platform,
    )

    await act(async () => {
      window.dispatchEvent(
        new CustomEvent("buddy:menu-command", {
          detail: { id: UPDATE_CHECK_MENU_COMMAND },
        }),
      )
      await checked.promise
    })

    expect(order).toEqual(["open", "check"])
  })
})
