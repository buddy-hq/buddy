type IndigoStringMap = {
  delete(): void
  set(key: string, value: string): void
}

type IndigoRuntime = {
  MapStringString: new () => IndigoStringMap
  check(source: string, checks: string, options: IndigoStringMap): string
  convert(source: string, format: string, options: IndigoStringMap): string
  render(source: string, options: IndigoStringMap): string
  version(): string
}

type IndigoRuntimeFactory = (options?: {
  locateFile?: (path: string, prefix: string) => string
}) => Promise<IndigoRuntime>

declare module "indigo-ketcher/binaryWasm" {
  const createIndigoRuntime: IndigoRuntimeFactory
  export default createIndigoRuntime
}
