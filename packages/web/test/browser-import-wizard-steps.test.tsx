import "../happydom"
import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { Dialog } from "@buddy/ui"
import {
  BlockedStep,
  ConfigureStep,
  FullDiskAccessStep,
} from "../src/components/settings/browser-import-wizard-steps"

describe("Full Disk Access import step", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
    Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT")
  })

  test("enables Continue only after Buddy can read Safari's cookie jar", async () => {
    let grantAccess: ((granted: boolean) => void) | undefined
    const access = new Promise<boolean>((resolve) => {
      grantAccess = resolve
    })

    await act(async () => {
      root.render(
        <Dialog open>
          <FullDiskAccessStep
            sourceName="Safari"
            stillRequired={false}
            onCancel={() => undefined}
            onOpenSettings={async () => undefined}
            onCheck={() => access}
            onContinue={() => undefined}
          />
        </Dialog>,
      )
    })

    const continueButton = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "Continue",
    )
    expect(continueButton?.disabled).toBe(true)

    await act(async () => grantAccess?.(true))
    expect(continueButton?.disabled).toBe(false)
  })

  test("does not pass React click events into import actions", async () => {
    const calls: unknown[][] = []
    const onImport = (...args: unknown[]) => calls.push(args)
    const onRetry = (...args: unknown[]) => calls.push(args)

    await act(async () => {
      root.render(
        <Dialog open>
          <ConfigureStep
            source={{
              id: "chrome",
              name: "Chrome",
              profiles: [{ id: "Default", name: "Personal" }],
              availability: { _tag: "available" },
            }}
            targetProfiles={[]}
            canCreateProfile
            sourceProfileID="Default"
            onSourceProfileChange={() => undefined}
            target={{ _tag: "new" }}
            targetError={undefined}
            onTargetChange={() => undefined}
            onCancel={() => undefined}
            onImport={onImport}
          />
        </Dialog>,
      )
    })

    const importButton = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "Import",
    )
    await act(async () => importButton?.click())

    await act(async () => {
      root.render(
        <Dialog open>
          <BlockedStep
            sourceName="Chrome"
            reason="readFailed"
            onClose={() => undefined}
            onRetry={onRetry}
          />
        </Dialog>,
      )
    })

    const retryButton = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "Try again",
    )
    await act(async () => retryButton?.click())

    expect(calls).toEqual([[], []])
  })
})
