import { parseTErrorCode } from "../shared/parse-external"

const BROKEN_STANDARD_IO_ERROR_CODES = new Set(["EIO", "EPIPE", "ERR_STREAM_DESTROYED"])

export function isBrokenStandardIoError<TError>(error: TError): boolean {
  const code = parseTErrorCode(error)
  return code !== undefined && BROKEN_STANDARD_IO_ERROR_CODES.has(code)
}

export function attachBrokenStandardIoErrorHandler(
  stream: NodeJS.WritableStream,
  onBroken: () => void,
): void {
  stream.on("error", (error: Error) => {
    if (!isBrokenStandardIoError(error)) return
    onBroken()
  })
}
