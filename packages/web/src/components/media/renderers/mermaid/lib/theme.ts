const MERMAID_RENDERER_VERSION = "11.12.0" as const
const MERMAID_RENDER_CONFIG_VERSION = 3

type MermaidThemeTokens = {
  backgroundBase: string
  surfaceBase: string
  surfaceRaisedBase: string
  surfaceWeak: string
  borderBase: string
  textBase: string
  textStrong: string
  textWeak: string
  textInvertBase: string
  textInteractiveBase: string
}

type MermaidThemeConfig = {
  backgroundColor: string
  candidateTextColors: string[]
  themeSignature: string
  tokens: MermaidThemeTokens
  themeVariables: Record<string, string>
}

function readTokenValue(name: string, fallback: string): string {
  if (typeof window === "undefined") {
    return fallback
  }
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return value.length > 0 ? value : fallback
}

function readMermaidThemeTokens(): MermaidThemeTokens {
  return {
    backgroundBase: readTokenValue("--background-base", "#ffffff"),
    surfaceBase: readTokenValue("--surface-base", "#ffffff"),
    surfaceRaisedBase: readTokenValue("--surface-raised-base", "#f5f5f5"),
    surfaceWeak: readTokenValue("--surface-weak", "#efefef"),
    borderBase: readTokenValue("--border-base", "#d6d6d6"),
    textBase: readTokenValue("--text-base", "#1f2937"),
    textStrong: readTokenValue("--text-strong", "#111827"),
    textWeak: readTokenValue("--text-weak", "#6b7280"),
    textInvertBase: readTokenValue("--text-invert-base", "#ffffff"),
    textInteractiveBase: readTokenValue("--text-interactive-base", "#2563eb"),
  }
}

function uniqueValues(values: string[]): string[] {
  const seen = new Set<string>()
  const unique: string[] = []
  for (const value of values) {
    const key = value.trim().toLowerCase()
    if (!key || seen.has(key)) {
      continue
    }
    seen.add(key)
    unique.push(value)
  }
  return unique
}

function buildMermaidThemeVariables(tokens: MermaidThemeTokens) {
  return {
    background: tokens.backgroundBase,
    mainBkg: tokens.surfaceBase,
    secondBkg: tokens.surfaceRaisedBase,
    tertiaryColor: tokens.surfaceWeak,
    primaryColor: tokens.surfaceRaisedBase,
    primaryBorderColor: tokens.borderBase,
    primaryTextColor: tokens.textStrong,
    secondaryColor: tokens.surfaceBase,
    secondaryBorderColor: tokens.borderBase,
    secondaryTextColor: tokens.textBase,
    tertiaryBorderColor: tokens.borderBase,
    tertiaryTextColor: tokens.textWeak,
    textColor: tokens.textBase,
    lineColor: tokens.textWeak,
    border1: tokens.borderBase,
    border2: tokens.borderBase,
    nodeBorder: tokens.borderBase,
    clusterBkg: tokens.surfaceBase,
    clusterBorder: tokens.borderBase,
    edgeLabelBackground: tokens.backgroundBase,
    actorBkg: tokens.surfaceRaisedBase,
    actorBorder: tokens.borderBase,
    actorTextColor: tokens.textBase,
    activationBkgColor: tokens.surfaceWeak,
    activationBorderColor: tokens.borderBase,
    sequenceNumberColor: tokens.textInteractiveBase,
    titleColor: tokens.textStrong,
    noteBkgColor: tokens.surfaceWeak,
    noteBorderColor: tokens.borderBase,
    noteTextColor: tokens.textBase,
    labelTextColor: tokens.textBase,
    labelBackground: tokens.backgroundBase,
  }
}

function buildMermaidThemeSignature(tokens: MermaidThemeTokens): string {
  return JSON.stringify({
    backgroundBase: tokens.backgroundBase,
    surfaceBase: tokens.surfaceBase,
    surfaceRaisedBase: tokens.surfaceRaisedBase,
    surfaceWeak: tokens.surfaceWeak,
    borderBase: tokens.borderBase,
    textBase: tokens.textBase,
    textStrong: tokens.textStrong,
    textWeak: tokens.textWeak,
    textInvertBase: tokens.textInvertBase,
    textInteractiveBase: tokens.textInteractiveBase,
  })
}

function createMermaidThemeConfig(tokens: MermaidThemeTokens): MermaidThemeConfig {
  return {
    backgroundColor: tokens.backgroundBase,
    candidateTextColors: uniqueValues([
      tokens.textBase,
      tokens.textStrong,
      tokens.textInvertBase,
      "#111827",
      "#ffffff",
    ]),
    themeSignature: buildMermaidThemeSignature(tokens),
    tokens,
    themeVariables: buildMermaidThemeVariables(tokens),
  }
}

function readMermaidThemeConfig(): MermaidThemeConfig {
  return createMermaidThemeConfig(readMermaidThemeTokens())
}

export {
  MERMAID_RENDER_CONFIG_VERSION,
  MERMAID_RENDERER_VERSION,
  createMermaidThemeConfig,
  readMermaidThemeConfig,
}

export type { MermaidThemeConfig, MermaidThemeTokens }
