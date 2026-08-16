import { Auth } from "@buddy/opencode-adapter/auth"
import z from "zod"
import {
  OPENAI_CODEX_AUTH_ISSUER,
  OPENAI_PROVIDER_ID,
  resolveOpenAICodexAuth,
  type OpenAICodexStoredAuth,
} from "../../../../opencode-runtime/plugins/openai-codex-credentials"

const CHATGPT_CODEX_BASE_URL = "https://chatgpt.com/backend-api/codex"
const IMAGE_GENERATION_PATH = "images/generations"
const IMAGE_EDIT_PATH = "images/edits"
const IMAGE_MODEL = "gpt-image-2"
const IMAGE_ORIGINATOR = "opencode"
const ERROR_DETAIL_MAX_CHARACTERS = 500

const CodexImageResponseSchema = z.object({
  data: z.array(z.object({ b64_json: z.string().min(1) })).min(1),
})

type ImageOperation = "generate" | "edit"
type CodexImageRequest = {
  prompt: string
  imageDataUrls: readonly string[]
  signal: AbortSignal
}
type CodexImagesFetch = (url: string, init: RequestInit) => Promise<Response>

type CodexImagesClientDependencies = {
  fetch: CodexImagesFetch
  resolveAuth: () => Promise<OpenAICodexStoredAuth | undefined>
}

async function resolveBuddyOpenAICodexAuth(): Promise<OpenAICodexStoredAuth | undefined> {
  return resolveOpenAICodexAuth({
    getAuth: () => Auth.get(OPENAI_PROVIDER_ID),
    setAuth: (auth) => Auth.set(OPENAI_PROVIDER_ID, auth),
    issuer: OPENAI_CODEX_AUTH_ISSUER,
  })
}

export function createCodexImagesClient(dependencies: CodexImagesClientDependencies) {
  return {
    async createImage(request: CodexImageRequest): Promise<{
      base64: string
      operation: ImageOperation
    }> {
      const auth = await dependencies.resolveAuth()
      if (!auth) {
        throw new Error("OpenAI ChatGPT OAuth credentials are not configured.")
      }

      const operation: ImageOperation = request.imageDataUrls.length === 0 ? "generate" : "edit"
      const endpointPath = operation === "generate" ? IMAGE_GENERATION_PATH : IMAGE_EDIT_PATH
      const body = Object.assign(
        {
          prompt: request.prompt,
          background: "auto",
          model: IMAGE_MODEL,
          quality: "auto",
          size: "auto",
        },
        operation === "edit"
          ? { images: request.imageDataUrls.map((image_url) => ({ image_url })) }
          : undefined,
      )

      const response = await dependencies.fetch(`${CHATGPT_CODEX_BASE_URL}/${endpointPath}`, {
        method: "POST",
          headers: Object.assign(
            {
              Accept: "application/json",
              Authorization: `Bearer ${auth.access}`,
              "Content-Type": "application/json",
              originator: IMAGE_ORIGINATOR,
            },
            auth.accountId ? { "ChatGPT-Account-Id": auth.accountId } : undefined,
          ),
        body: JSON.stringify(body),
        signal: request.signal,
      })

      if (!response.ok) {
        const detail = await response.text().catch(() => "")
        throw new Error(
          `Codex image ${operation} request failed: ${response.status} ${detail.slice(0, ERROR_DETAIL_MAX_CHARACTERS)}`,
        )
      }

      const result = CodexImageResponseSchema.parse(await response.json())
      return {
        base64: result.data[0].b64_json,
        operation,
      }
    },
  }
}

export const codexImagesClient = createCodexImagesClient({
  fetch: (url, init) => fetch(url, init),
  resolveAuth: resolveBuddyOpenAICodexAuth,
})

export type { CodexImageRequest, CodexImagesClientDependencies, ImageOperation }
