type TMermaidThemeVariables = Readonly<Record<string, string>>

type TMermaidInitializeConfig = {
  startOnLoad: boolean
  securityLevel: "strict"
  suppressErrorRendering: boolean
  secure: string[]
  theme?: "base"
  themeVariables?: TMermaidThemeVariables
  deterministicIds?: boolean
  deterministicIDSeed?: string
}

type TMermaidRenderOutput = {
  svg: string
  bindFunctions?: (element: Element) => void
}

type MermaidRuntime = {
  initialize(config: TMermaidInitializeConfig): void
  render(
    id: string,
    source: string,
  ): string | TMermaidRenderOutput | Promise<string | TMermaidRenderOutput>
}

const TEST_MERMAID_RUNTIME_KEY = "__BUDDY_TEST_MERMAID_RUNTIME__"
const MERMAID_SECURE_CONFIG_KEYS = [
  "secure",
  "securityLevel",
  "startOnLoad",
  "maxTextSize",
  "suppressErrorRendering",
  "maxEdges",
  "theme",
  "themeVariables",
  "themeCSS",
  "darkMode",
]

type TGlobalTestMermaidRuntime = typeof globalThis & {
  readonly [TEST_MERMAID_RUNTIME_KEY]?: MermaidRuntime
}

let runtimePromise: Promise<MermaidRuntime> | undefined
let configuredRuntime: MermaidRuntime | undefined

function createRuntimeConfig(input?: {
  themeVariables?: TMermaidThemeVariables
  deterministicIds?: boolean
}): TMermaidInitializeConfig {
  return Object.assign(
    Object.assign(
      {
        startOnLoad: false,
        securityLevel: "strict" as const,
        suppressErrorRendering: true,
        secure: [...MERMAID_SECURE_CONFIG_KEYS],
      },
      input?.themeVariables
        ? {
            theme: "base" as const,
            themeVariables: input.themeVariables,
          }
        : undefined,
    ),
    input?.deterministicIds
      ? {
          deterministicIds: true,
          deterministicIDSeed: "buddy",
        }
      : undefined,
  )
}

function configureRuntime(
  runtime: MermaidRuntime,
  input?: { themeVariables?: TMermaidThemeVariables },
) {
  try {
    runtime.initialize(
      createRuntimeConfig({
        themeVariables: input?.themeVariables,
        deterministicIds: true,
      }),
    )
  } catch {
    runtime.initialize(
      createRuntimeConfig({
        themeVariables: input?.themeVariables,
        deterministicIds: false,
      }),
    )
  }
}

function testRuntime(): MermaidRuntime | undefined {
  const globals: TGlobalTestMermaidRuntime = globalThis
  return globals[TEST_MERMAID_RUNTIME_KEY]
}

export async function loadMermaidRuntime(): Promise<MermaidRuntime> {
  const mocked = testRuntime()
  if (mocked) {
    if (configuredRuntime !== mocked) {
      configureRuntime(mocked)
      configuredRuntime = mocked
    }
    return mocked
  }

  if (!runtimePromise) {
    runtimePromise = import("mermaid").then((module) => module.default)
  }

  const runtime = await runtimePromise
  if (configuredRuntime !== runtime) {
    configureRuntime(runtime)
    configuredRuntime = runtime
  }
  return runtime
}

export function initializeMermaidRuntime(
  runtime: MermaidRuntime,
  input?: { themeVariables?: TMermaidThemeVariables },
): void {
  configureRuntime(runtime, input)
}

export type { MermaidRuntime, TMermaidRenderOutput }

declare global {
  interface Window {
    __BUDDY_TEST_MERMAID_RUNTIME__?: MermaidRuntime
  }
}
