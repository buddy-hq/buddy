type BoundedBodyResult =
  | {
      status: "ok"
      body: Uint8Array
    }
  | {
      status: "too_large"
    }

async function readBoundedRequestBody(
  request: Request,
  maxBytes: number,
): Promise<BoundedBodyResult> {
  const declaredLength = Number(request.headers.get("content-length"))
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    return { status: "too_large" }
  }
  if (!request.body) return { status: "ok", body: new Uint8Array() }

  const chunks: Uint8Array[] = []
  const reader = request.body.getReader()
  let totalBytes = 0
  while (true) {
    const chunk = await reader.read()
    if (chunk.done) break
    totalBytes += chunk.value.byteLength
    if (totalBytes > maxBytes) {
      await reader.cancel().catch(() => undefined)
      return { status: "too_large" }
    }
    chunks.push(chunk.value)
  }

  const body = new Uint8Array(totalBytes)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }
  return { status: "ok", body }
}

function requestBodyArrayBuffer(body: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(body.byteLength)
  new Uint8Array(buffer).set(body)
  return buffer
}

function replayRequestBody(request: Request, body: Uint8Array): Request {
  return new Request(request.url, {
    method: request.method,
    headers: request.headers,
    body: requestBodyArrayBuffer(body),
    signal: request.signal,
  })
}

export { readBoundedRequestBody, replayRequestBody }
export type { BoundedBodyResult }
