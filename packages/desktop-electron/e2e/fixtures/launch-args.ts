import path from "node:path"

export function buildElectronLaunchArgs(
  preload: string,
  desktopDirectory: string,
  paths: Pick<typeof path, "resolve"> = path,
): string[] {
  return ["--require", preload, paths.resolve(desktopDirectory)]
}
