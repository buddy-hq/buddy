import { describe, expect, test } from "bun:test"
import path from "node:path"

const SOURCE_ROOT = path.join(import.meta.dir, "../src")

type StableContextModule = {
  contextName: string
  valueModule: string
  providerModule: string
  providerImport: string
}

const STABLE_CONTEXT_MODULES: readonly StableContextModule[] = [
  {
    contextName: "DirectoryWorkspaceContext",
    valueModule: "components/directory-chat/directory-workspace-context-value.ts",
    providerModule: "components/directory-chat/directory-workspace-context.tsx",
    providerImport: "@/components/directory-chat/directory-workspace-context-value",
  },
  {
    contextName: "DirectoryNotebookRouteContext",
    valueModule: "components/directory-chat/directory-notebook-route-context-value.ts",
    providerModule: "components/directory-chat/directory-notebook-route-context.tsx",
    providerImport: "@/components/directory-chat/directory-notebook-route-context-value",
  },
  {
    contextName: "BenchRouteContext",
    valueModule: "components/bench/bench-route-context-value.ts",
    providerModule: "components/bench/bench-route-context.tsx",
    providerImport: "@/components/bench/bench-route-context-value",
  },
  {
    contextName: "ThemeContext",
    valueModule: "theme/context-value.ts",
    providerModule: "theme/context.tsx",
    providerImport: "./context-value",
  },
]

async function readRuntimeImports(relativePath: string): Promise<string[]> {
  const source = await Bun.file(path.join(SOURCE_ROOT, relativePath)).text()
  const loader = relativePath.endsWith(".tsx") ? "tsx" : "ts"
  return new Bun.Transpiler({ loader })
    .scanImports(source)
    .map((entry) => entry.path)
    .filter((specifier) => !specifier.startsWith("react/jsx"))
}

describe("HMR-stable context modules", () => {
  for (const entry of STABLE_CONTEXT_MODULES) {
    test(`${entry.contextName} is created in a module that only depends on React at runtime`, async () => {
      // Fast Refresh re-executes a module whenever one of its runtime dependencies changes, and
      // every re-execution creates a new context object that mounted providers do not hold.
      expect(await readRuntimeImports(entry.valueModule)).toEqual(["react"])
    })

    test(`${entry.contextName} provider reuses the stable context instead of creating one`, async () => {
      const source = await Bun.file(path.join(SOURCE_ROOT, entry.providerModule)).text()

      expect(await readRuntimeImports(entry.providerModule)).toContain(entry.providerImport)
      expect(source).not.toContain("createContext")
    })
  }
})
