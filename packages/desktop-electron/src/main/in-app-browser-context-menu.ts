import type { ContextMenuParams, MenuItemConstructorOptions } from "electron"

const SPELLING_SUGGESTION_LIMIT = 5
const COPYABLE_LINK_PROTOCOLS = new Set(["http:", "https:", "mailto:"])

export type InAppBrowserContextMenuParams = Pick<
  ContextMenuParams,
  "misspelledWord" | "dictionarySuggestions" | "linkURL" | "mediaType" | "editFlags"
>

export type InAppBrowserContextMenuActions = {
  replaceMisspelling(suggestion: string): void
  copyText(text: string): void
  copyImage(): void
}

function isCopyableLink(url: string): boolean {
  if (!url) return false
  try {
    return COPYABLE_LINK_PROTOCOLS.has(new URL(url).protocol)
  } catch {
    return false
  }
}

export function inAppBrowserContextMenuTemplate(
  params: InAppBrowserContextMenuParams,
  actions: InAppBrowserContextMenuActions,
): MenuItemConstructorOptions[] {
  const template: MenuItemConstructorOptions[] = []

  if (params.misspelledWord) {
    const suggestions = params.dictionarySuggestions.slice(0, SPELLING_SUGGESTION_LIMIT)
    for (const suggestion of suggestions) {
      template.push({ label: suggestion, click: () => actions.replaceMisspelling(suggestion) })
    }
    if (suggestions.length === 0) template.push({ label: "No suggestions", enabled: false })
    template.push({ type: "separator" })
  }

  if (isCopyableLink(params.linkURL)) {
    template.push(
      { label: "Copy Link", click: () => actions.copyText(params.linkURL) },
      { type: "separator" },
    )
  }

  if (params.mediaType === "image") {
    template.push({ label: "Copy Image", click: () => actions.copyImage() }, { type: "separator" })
  }

  template.push(
    { role: "cut", enabled: params.editFlags.canCut },
    { role: "copy", enabled: params.editFlags.canCopy },
    { role: "paste", enabled: params.editFlags.canPaste },
    { role: "selectAll", enabled: params.editFlags.canSelectAll },
  )
  return template
}
