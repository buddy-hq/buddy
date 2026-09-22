import { describe, expect, test } from "bun:test"
import mermaid from "mermaid"
import {
  initializeMermaidRuntime,
  loadMermaidRuntime,
} from "../src/components/media/renderers/mermaid/lib/loader"

const BUDDY_PRIMARY_COLOR = "#16171d"

async function readConfigAfterParsing(source: string) {
  const runtime = await loadMermaidRuntime()
  initializeMermaidRuntime(runtime, { themeVariables: { primaryColor: BUDDY_PRIMARY_COLOR } })
  await mermaid.parse(source)
  return mermaid.mermaidAPI.getConfig()
}

describe("mermaid runtime config", () => {
  test("ignores theme overrides from init directives", async () => {
    const config = await readConfigAfterParsing(
      [
        '%%{init: {"theme": "forest", "themeVariables": {"primaryColor": "#e8f5e9"}, "themeCSS": ".node rect { fill: pink; }"}}%%',
        "flowchart TD",
        "  A --> B",
      ].join("\n"),
    )

    expect(config.theme).toBe("base")
    expect(config.themeVariables?.primaryColor).toBe(BUDDY_PRIMARY_COLOR)
    expect(config.themeCSS).toBeUndefined()
  })

  test("ignores theme overrides from frontmatter config", async () => {
    const config = await readConfigAfterParsing(
      [
        "---",
        "config:",
        "  theme: forest",
        "  themeVariables:",
        '    primaryColor: "#e8f5e9"',
        "---",
        "flowchart TD",
        "  A --> B",
      ].join("\n"),
    )

    expect(config.theme).toBe("base")
    expect(config.themeVariables?.primaryColor).toBe(BUDDY_PRIMARY_COLOR)
  })
})
