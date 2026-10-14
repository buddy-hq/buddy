import { describe, expect, test } from "bun:test"
import fs from "node:fs/promises"
import path from "node:path"
import type { MessageWithParts } from "@buddy/transcript-contract/message"
import { createV2TestHost } from "../helpers/v2-host"
import { openCodeRuntimePaths } from "../../src/opencode-runtime/env"
import { generatedImageProvenance, saveGeneratedImage } from "../../src/learning/features/image-generation/service/generated-image"
import { resolveTrustedGeneratedImagePath } from "../../src/learning/features/image-generation/service/generated-image-authorization"
import { recentConversationImageDataUrls } from "../../src/learning/features/image-generation/service/image-inputs"

describe("generated image storage", () => {
  test("uses Buddy's runtime path authority and verifies exact recorded bytes", async () => {
    const expectedDataRoot = openCodeRuntimePaths().data
    await using runtime = await createV2TestHost()
    const sessionID = `ses_image_storage_${path.basename(runtime.path)}`
    const callID = "call_image_storage"
    const image = await saveGeneratedImage({ sessionID, callID, title: "Carbon atom", base64: "QUJD" })
    try {
      expect(path.dirname(path.dirname(image.path))).toBe(path.join(expectedDataRoot, "generated_images"))
      const message: MessageWithParts = {
        info: {
          id: "msg_image_storage",
          sessionID,
          role: "assistant",
          mode: "build",
          agent: "buddy",
          path: { cwd: runtime.path, root: runtime.path },
          parentID: "msg_image_parent",
          modelID: "image-model",
          providerID: "image-provider",
          time: { created: 1 },
          cost: 0,
          tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
        },
        parts: [{
          id: "part_image_storage",
          sessionID,
          messageID: "msg_image_storage",
          type: "tool",
          callID,
          tool: "imagegen",
          state: {
            status: "completed",
            input: {},
            output: "Generated an image",
            time: { start: 1, end: 2 },
            metadata: { savedPath: image.path, generatedImageProvenance: generatedImageProvenance({ image, sessionID, callID }) },
          },
        }],
      }
      expect(await resolveTrustedGeneratedImagePath(image.path, { sessionID, messages: [message] })).toBe(await fs.realpath(image.path))
      expect(await recentConversationImageDataUrls([message], 1, sessionID)).toEqual(["data:image/png;base64,QUJD"])
      expect(await resolveTrustedGeneratedImagePath(image.path, { sessionID: "ses_another", messages: [message] })).toBeUndefined()
      await fs.writeFile(image.path, "XYZ")
      expect(await resolveTrustedGeneratedImagePath(image.path, { sessionID, messages: [message] })).toBeUndefined()
    } finally {
      await fs.rm(path.dirname(image.path), { recursive: true, force: true })
    }
  })
})
