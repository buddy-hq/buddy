import "../happydom"
import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { OnboardingSetup } from "../src/components/onboarding"

describe("OnboardingSetup", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  test("hides buddy home controls on the happy path", async () => {
    await act(async () => {
      root.render(
        <OnboardingSetup
          authChoice={undefined}
          connectedAuthChoice={undefined}
          busyChoice={undefined}
          folderBusy={false}
          showFolderRecovery={false}
          defaultHomeDirectory="/Users/test/Documents/Buddy"
          onChoose={() => undefined}
          onUseDefaultHome={() => undefined}
          onPickFolder={() => undefined}
        />,
      )
    })

    const text = container.textContent ?? ""
    expect(text.includes("Choose Buddy Home")).toBe(false)
    expect(text.includes("Use default home and start")).toBe(false)
    expect(text.includes("Choose another folder")).toBe(false)
  })

  test("shows manual buddy home recovery after failure", async () => {
    await act(async () => {
      root.render(
        <OnboardingSetup
          authChoice="free_models"
          connectedAuthChoice={undefined}
          busyChoice={undefined}
          folderBusy={false}
          showFolderRecovery
          defaultHomeDirectory="/Users/test/Documents/Buddy"
          error="Could not initialize notebook"
          onChoose={() => undefined}
          onUseDefaultHome={() => undefined}
          onPickFolder={() => undefined}
        />,
      )
    })

    const text = container.textContent ?? ""
    expect(text.includes("Choose Buddy Home manually")).toBe(true)
    expect(text.includes("Choose another folder")).toBe(true)
  })

  test("shows provider errors even when a provider is already selected", async () => {
    await act(async () => {
      root.render(
        <OnboardingSetup
          authChoice="free_models"
          connectedAuthChoice={undefined}
          busyChoice={undefined}
          folderBusy={false}
          showFolderRecovery={false}
          error="Could not switch providers"
          onChoose={() => undefined}
          onUseDefaultHome={() => undefined}
          onPickFolder={() => undefined}
        />,
      )
    })

    const text = container.textContent ?? ""
    expect(text.includes("Could not switch providers")).toBe(true)
  })
})
