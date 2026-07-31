import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { ObsidianVaultConnectionDialog } from "../src/components/layout/chat-left-sidebar/dialogs"

describe("Obsidian vault connection dialog", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
    Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT")
  })

  test("lets the user connect the vault or keep it as a regular notebook", async () => {
    const onConnect = mock(() => {})
    const onContinueAsNotebook = mock(() => {})

    await act(async () => {
      root.render(
        <ObsidianVaultConnectionDialog
          open
          directory="/tmp/Roman Republic notes"
          busy={false}
          onConnect={onConnect}
          onContinueAsNotebook={onContinueAsNotebook}
        />,
      )
    })

    const dialog = document.querySelector('[data-component="obsidian-vault-connection-dialog"]')
    expect(dialog?.textContent).toContain("Connect Obsidian")
    expect(dialog?.textContent).toContain("Roman Republic notes")

    const continueButton = document.querySelector<HTMLButtonElement>(
      '[data-action="obsidian-vault-continue-as-notebook"]',
    )
    const connectButton = document.querySelector<HTMLButtonElement>(
      '[data-action="obsidian-vault-connect"]',
    )

    await act(async () => {
      continueButton?.click()
      connectButton?.click()
    })

    expect(onContinueAsNotebook).toHaveBeenCalledTimes(1)
    expect(onConnect).toHaveBeenCalledTimes(1)
  })
})
