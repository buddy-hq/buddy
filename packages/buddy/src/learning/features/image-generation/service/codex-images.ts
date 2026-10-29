import z from "zod"
import type { ChatGPTAuth, ChatGPTImage, ChatGPTImageRequest } from "@buddy/agent-runtime/chatgpt"

const CHATGPT_CODEX_BASE_URL = "https://chatgpt.com/backend-api/codex"
const IMAGE_GENERATION_PATH = "images/generations"
const IMAGE_EDIT_PATH = "images/edits"
const IMAGE_MODEL = "gpt-image-2"
const IMAGE_ORIGINATOR = "opencode"
const ERROR_DETAIL_MAX_CHARACTERS = 500

const CodexImageResponseSchema = z.object({
  data: z.array(z.object({ b64_json: z.string().min(1) })).min(1),
})

type ImageOperation = ChatGPTImage["operation"]
type CodexImageRequest = ChatGPTImageRequest & { readonly signal: AbortSignal }
type CodexImagesFetch = (url: string, init: RequestInit) => Promise<Response>

type CodexImagesClientDependencies = {
  fetch: CodexImagesFetch
  resolveAuth: () => Promise<ChatGPTAuth | undefined>
  onRejected?: (auth: ChatGPTAuth) => Promise<void>
}

export function createCodexImagesClient(dependencies: CodexImagesClientDependencies) {
  return {
    async createImage(request: CodexImageRequest): Promise<ChatGPTImage> {
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
        if (response.status === 403) {
          throw new Error(
            "Image generation isn't available for this ChatGPT account (403 Forbidden). It isn't included in the ChatGPT Free plan.",
          )
        }
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

export const codexImagesClient = {
  async createImage(request: CodexImageRequest) {
    const { getAgentRuntime } = await import("../../../../runtime/agent-runtime")
    const { ensureGlobalBootstrapWorkspaceDirectory } =
      await import("../../../../project/directory")
    const runtime = await getAgentRuntime()
    return runtime.chatgpt.image(ensureGlobalBootstrapWorkspaceDirectory(), request)
  },
}

export type { CodexImageRequest, CodexImagesClientDependencies, ImageOperation }
