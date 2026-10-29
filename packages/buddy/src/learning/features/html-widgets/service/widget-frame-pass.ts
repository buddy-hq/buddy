import { createHmac, randomBytes, timingSafeEqual } from "node:crypto"
import z from "zod"

const payloadSchema = z
  .object({ d: z.string().min(1), o: z.string().min(1), v: z.string().min(1) })
  .strict()

type WidgetFrameIdentity = {
  directory: string
  objectID: string
  versionToken: string
}

export function redactWidgetFramePasses(text: string): string {
  const pattern = /[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]/gu
  let decoded = text
  try {
    decoded = decodeURIComponent(text)
  } catch {}
  let redacted = text
  for (const match of decoded.matchAll(pattern)) {
    const encodedPattern = Array.from(match[0], (character) =>
      `(?:${character === "." ? "\\." : character}|%${character.charCodeAt(0).toString(16)})`,
    ).join("")
    redacted = redacted.replace(new RegExp(encodedPattern, "giu"), "[pass]")
  }
  return redacted.replace(pattern, "[pass]")
}

export function createWidgetFramePassSigner(key: Uint8Array = randomBytes(32)) {
  const signingKey = Buffer.from(key)

  function mac(payload: string) {
    return createHmac("sha256", signingKey).update(payload).digest()
  }

  return {
    mint(input: WidgetFrameIdentity): string {
      const payload = Buffer.from(
        JSON.stringify({ d: input.directory, o: input.objectID, v: input.versionToken }),
      ).toString("base64url")
      return `${payload}.${mac(payload).toString("base64url")}`
    },
    verify(pass: string): WidgetFrameIdentity | undefined {
      try {
        const match = /^([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/u.exec(pass)
        const payload = match?.[1]
        const signature = match?.[2]
        if (!payload || !signature) return undefined
        const expected = mac(payload)
        const received = Buffer.from(signature, "base64url")
        if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
          return undefined
        }
        if (received.toString("base64url") !== signature) return undefined
        const decoded = Buffer.from(payload, "base64url")
        if (decoded.toString("base64url") !== payload) return undefined
        const parsed = payloadSchema.safeParse(JSON.parse(decoded.toString("utf8")))
        if (!parsed.success) return undefined
        return { directory: parsed.data.d, objectID: parsed.data.o, versionToken: parsed.data.v }
      } catch {
        return undefined
      }
    },
  }
}

export const widgetFramePassSigner = createWidgetFramePassSigner()
