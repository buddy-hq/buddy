import { Buffer } from "node:buffer"
import { deflateSync } from "node:zlib"
import z from "zod"
import { WhiteboardShareUploadError } from "../errors"
import { assertWhiteboardPayloadWithinLimit } from "./payload"

const CONCAT_BUFFERS_VERSION = 1
const UINT32_BYTE_LENGTH = 4
const AES_GCM_KEY_LENGTH_BITS = 128
const AES_GCM_IV_LENGTH_BYTES = 12
const EXCALIDRAW_JSON_UPLOAD_URL = "https://json.excalidraw.com/api/v2/post/"
const EXCALIDRAW_SHARE_URL_PREFIX = "https://excalidraw.com/#json="

const WhiteboardShareRequestSchema = z
  .object({
    json: z.string().min(2),
  })
  .strict()

const WhiteboardShareResponseSchema = z
  .object({
    url: z.string().url(),
  })
  .strict()

const UploadResponseSchema = z
  .object({
    id: z.string().min(1),
  })
  .passthrough()

const ExportedKeySchema = z
  .object({
    k: z.string().min(1),
  })
  .passthrough()

type WhiteboardShareRequest = z.infer<typeof WhiteboardShareRequestSchema>
type WhiteboardShareResponse = z.infer<typeof WhiteboardShareResponseSchema>

function concatBuffers(...buffers: Uint8Array[]): Uint8Array {
  const byteLength =
    UINT32_BYTE_LENGTH +
    buffers.reduce((total, buffer) => total + UINT32_BYTE_LENGTH + buffer.length, 0)
  const output = new Uint8Array(byteLength)
  const view = new DataView(output.buffer)
  view.setUint32(0, CONCAT_BUFFERS_VERSION)

  let offset = UINT32_BYTE_LENGTH
  for (const buffer of buffers) {
    view.setUint32(offset, buffer.length)
    offset += UINT32_BYTE_LENGTH
    output.set(buffer, offset)
    offset += buffer.length
  }
  return output
}

async function createEncryptedPayload(json: string): Promise<{
  key: string
  payload: Uint8Array
}> {
  const encoder = new TextEncoder()
  const fileMetadata = encoder.encode(JSON.stringify({}))
  const data = encoder.encode(json)
  const innerPayload = concatBuffers(fileMetadata, data)
  const compressed = deflateSync(Buffer.from(innerPayload))
  const key = await globalThis.crypto.subtle.generateKey(
    { name: "AES-GCM", length: AES_GCM_KEY_LENGTH_BITS },
    true,
    ["encrypt"],
  )
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(AES_GCM_IV_LENGTH_BYTES))
  const compressedBytes = new Uint8Array(compressed.byteLength)
  compressedBytes.set(compressed)
  const encrypted = await globalThis.crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    compressedBytes,
  )
  const encodingMetadata = encoder.encode(
    JSON.stringify({
      version: 2,
      compression: "pako@1",
      encryption: "AES-GCM",
    }),
  )
  const exportedKey = ExportedKeySchema.parse(await globalThis.crypto.subtle.exportKey("jwk", key))
  return {
    key: exportedKey.k,
    payload: concatBuffers(encodingMetadata, iv, new Uint8Array(encrypted)),
  }
}

async function uploadEncryptedPayload(payload: Uint8Array): Promise<string> {
  let response: Response
  try {
    response = await fetch(EXCALIDRAW_JSON_UPLOAD_URL, {
      method: "POST",
      body: Buffer.from(payload),
    })
  } catch (error) {
    throw new WhiteboardShareUploadError("Failed to upload board to Excalidraw.", {
      cause: error,
    })
  }

  if (!response.ok) {
    throw new WhiteboardShareUploadError(`Excalidraw upload failed with status ${response.status}.`)
  }

  let parsed: unknown
  try {
    parsed = await response.json()
  } catch (error) {
    throw new WhiteboardShareUploadError("Excalidraw upload returned invalid JSON.", {
      cause: error,
    })
  }
  const upload = UploadResponseSchema.safeParse(parsed)
  if (!upload.success) {
    throw new WhiteboardShareUploadError("Excalidraw upload returned an unexpected response.", {
      cause: upload.error,
    })
  }
  return upload.data.id
}

async function createExcalidrawShareLink(
  input: WhiteboardShareRequest,
): Promise<WhiteboardShareResponse> {
  assertWhiteboardPayloadWithinLimit("Whiteboard share export", input.json)
  const encrypted = await createEncryptedPayload(input.json)
  const id = await uploadEncryptedPayload(encrypted.payload)
  return WhiteboardShareResponseSchema.parse({
    url: `${EXCALIDRAW_SHARE_URL_PREFIX}${id},${encrypted.key}`,
  })
}

export { WhiteboardShareRequestSchema, WhiteboardShareResponseSchema, createExcalidrawShareLink }
export type { WhiteboardShareRequest, WhiteboardShareResponse }
