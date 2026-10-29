import type { Context } from "@opencode/plugin/promise/plugin"

export function registerWebSearchDefault(websearch: Pick<Context["websearch"], "transform">) {
  return websearch.transform((editor) => {
    if (editor.default.get() === undefined) editor.default.set("exa")
  })
}
