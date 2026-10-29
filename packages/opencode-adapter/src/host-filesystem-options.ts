import type { OpenCode } from "@opencode/sdk"

function enabledUnlessDisabled(value: string | undefined): boolean | undefined {
  if (value === undefined) return undefined
  return !(value === "1" || value.toLowerCase() === "true")
}

export function resolveOpenCodeFilesystemOptions(
  environment: Readonly<Record<string, string | undefined>>,
  options?: OpenCode.CreateOptions["fs"],
): OpenCode.CreateOptions["fs"] {
  const filewatcher =
    options?.filewatcher ??
    enabledUnlessDisabled(
      environment.OPENCODE_FILEWATCHER_DISABLE ?? environment.OPENCODE_DISABLE_FILEWATCHER,
    )
  const fff = options?.fff ?? enabledUnlessDisabled(environment.OPENCODE_DISABLE_FFF)
  if (filewatcher === undefined && fff === undefined) return undefined
  return { filewatcher, fff }
}
