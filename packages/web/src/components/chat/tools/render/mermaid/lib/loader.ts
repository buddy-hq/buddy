type MermaidRuntime = {
  initialize(config: unknown): void
  render(id: string, source: string): unknown | Promise<unknown>
}

declare global {
  // Test-only hook for deterministic Mermaid runtime stubbing.
  var __BUDDY_TEST_MERMAID_RUNTIME__: MermaidRuntime | undefined
}

let runtimePromise: Promise<MermaidRuntime> | undefined
let configuredRuntime: MermaidRuntime | undefined

function createRuntimeConfig(input?: {
  themeVariables?: Record<string, string>
  deterministicIds?: boolean
}) {
  return {
    startOnLoad: false,
    securityLevel: "strict" as const,
    suppressErrorRendering: true,
    ...(input?.themeVariables
      ? {
          theme: "base" as const,
          themeVariables: input.themeVariables,
        }
      : {}),
    ...(input?.deterministicIds
      ? {
          deterministicIds: true,
          deterministicIDSeed: "buddy",
        }
      : {}),
  }
}

function configureRuntime(
  runtime: MermaidRuntime,
  input?: { themeVariables?: Record<string, string> },
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
  return globalThis.__BUDDY_TEST_MERMAID_RUNTIME__
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
  input?: { themeVariables?: Record<string, string> },
): void {
  configureRuntime(runtime, input)
}
