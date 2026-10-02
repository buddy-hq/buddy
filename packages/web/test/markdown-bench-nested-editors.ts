import { act } from "react"

const NESTED_EDITOR_SELECTOR = '[data-lexical-editor="true"] [data-lexical-editor="true"]'

async function flushEffects(delay = 0) {
  await Promise.resolve()
  await new Promise<void>((resolve) => {
    setTimeout(resolve, delay)
  })
}

export async function commitNestedEditors(container: HTMLElement) {
  const nestedEditors = Array.from(
    container.querySelectorAll<HTMLElement>(NESTED_EDITOR_SELECTOR),
  ).toReversed()

  await act(async () => {
    for (const nestedEditor of nestedEditors) {
      nestedEditor.focus()
      nestedEditor.blur()
    }
    await flushEffects()
  })
}
