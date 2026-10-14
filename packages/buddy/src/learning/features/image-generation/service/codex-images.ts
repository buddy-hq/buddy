import z from "zod"
import type { OpenAICodexStoredAuth } from "../../../../opencode-runtime/plugins/openai-codex-credentials"

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
  onRejected?: (auth: OpenAICodexStoredAuth) => Promise<void>
}

export function createCodexImagesClient(dependencies: CodexImagesClientDependencies) {
  return {
    async createImage(request: CodexImageRequest): Promise<{
      base64: string
      operation: ImageOperation
    }> {
      const resolvedAuth = await dependencies.resolveAuth()
      if (!resolvedAuth) {
        throw new Error("OpenAI ChatGPT OAuth credentials are not configured.")
      }

      const auth = { ...resolvedAuth }
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
        if (response.status === 401) await dependencies.onRejected?.(auth)
        const detail = await response.text().catch(() => "")
        throw new Error(
          `Codex image ${operation} request failed: ${response.status} ${detail.slice(0, ERROR_DETAIL_MAX_CHARACTERS)}`,
        )
      }

      const result = CodexImageResponseSchema.parse(await response.json())
      const image = result.data[0]
      if (!image) throw new Error("Codex image response contains no image")
      return {
        base64: image.b64_json,
        operation,
      }
    },
  }
}

const codexImageResultSchema = z.object({ base64: z.string().min(1), operation: z.enum(["generate", "edit"]) })

export const codexImagesClient = {
  async createImage(request: CodexImageRequest) {
    const { getOpenCodeClient } = await import("../../../../opencode-runtime/client")
    const { ensureGlobalBootstrapWorkspaceDirectory } = await import("../../../../project/directory")
    const client = await getOpenCodeClient()
    const result = await client.rpc.call({ location: { directory: ensureGlobalBootstrapWorkspaceDirectory() }, rpcID: "buddy.codex", method: "image", input: { prompt: request.prompt, imageDataUrls: [...request.imageDataUrls] } }, { signal: request.signal })
    return codexImageResultSchema.parse(result.output)
  },
}

export type { CodexImageRequest, CodexImagesClientDependencies, ImageOperation }
