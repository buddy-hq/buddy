import fs from "node:fs/promises"
import path from "node:path"
import { afterEach, describe, expect, test } from "bun:test"
import type { MessageV2 } from "@buddy/opencode-adapter/message"
import { Instance as OpenCodeInstance } from "@buddy/opencode-adapter/instance"
import { MessageID, ModelID, PartID, ProviderID, SessionID } from "@buddy/opencode-adapter/id"
import { imageGenerationFeature } from "../../src/learning/features/image-generation/feature"
import { createCodexImagesClient } from "../../src/learning/features/image-generation/service/codex-images"
import {
  generatedImageFileName,
  resolveGeneratedImageTitle,
} from "../../src/learning/features/image-generation/service/generated-image"
import {
  IMAGE_INPUT_MAX_FILE_BYTES,
  IMAGE_INPUT_MAX_TOTAL_BYTES,
  recentConversationImageDataUrls,
  referencedImageDataUrls,
} from "../../src/learning/features/image-generation/service/image-inputs"
import {
  ImagegenInputSchema,
  authorizeReferencedImagePaths,
} from "../../src/learning/features/image-generation/tools/imagegen"
import { tmpdir } from "../helpers/tmpdir"

const SESSION_ID = SessionID.make("ses_imagegen")
const USER_MESSAGE_ID = MessageID.make("msg_imagegen_user")
const ASSISTANT_MESSAGE_ID = MessageID.make("msg_imagegen_assistant")
const IMAGE_A = "data:image/png;base64,QUFB"
const IMAGE_B = "data:image/png;base64,QkJC"
const GENERATED_BASE64 = "R0VORVJBVEVE"

afterEach(async () => {
  await OpenCodeInstance.disposeAll()
})

function userMessageWithImage(): MessageV2.WithParts {
  return {
    info: {
      id: USER_MESSAGE_ID,
      sessionID: SESSION_ID,
      role: "user",
      time: { created: 1 },
      agent: "buddy",
      model: {
        providerID: ProviderID.openai,
        modelID: ModelID.make("gpt-5.5"),
      },
    },
    parts: [
      {
        id: PartID.make("prt_imagegen_user_file"),
        sessionID: SESSION_ID,
        messageID: USER_MESSAGE_ID,
        type: "file",
        mime: "image/png",
        url: IMAGE_A,
      },
    ],
  }
}

function assistantMessageWithGeneratedImage(): MessageV2.WithParts {
  return {
    info: {
      id: ASSISTANT_MESSAGE_ID,
      sessionID: SESSION_ID,
      role: "assistant",
      time: { created: 2, completed: 3 },
      parentID: USER_MESSAGE_ID,
      modelID: ModelID.make("gpt-5.5"),
      providerID: ProviderID.openai,
      mode: "build",
      agent: "buddy",
      path: { cwd: "/tmp", root: "/tmp" },
      cost: 0,
      tokens: {
        input: 0,
        output: 0,
        reasoning: 0,
        cache: { read: 0, write: 0 },
      },
    },
    parts: [
      {
        id: PartID.make("prt_imagegen_tool"),
        sessionID: SESSION_ID,
        messageID: ASSISTANT_MESSAGE_ID,
        type: "tool",
        callID: "call_imagegen",
        tool: "imagegen",
        state: {
          status: "completed",
          input: { prompt: "draw it" },
          output: "generated",
          title: "Generated image",
          metadata: {},
          time: { start: 2, end: 3 },
          attachments: [
            {
              id: PartID.make("prt_imagegen_tool_file"),
              sessionID: SESSION_ID,
              messageID: ASSISTANT_MESSAGE_ID,
              type: "file",
              mime: "image/png",
              url: IMAGE_B,
            },
          ],
        },
      },
    ],
  }
}

function assistantMessageWithSavedImage(input: {
  messageID: string
  partID: string
  savedPath: string
  created: number
}): MessageV2.WithParts {
  const messageID = MessageID.make(input.messageID)
  return {
    info: {
      id: messageID,
      sessionID: SESSION_ID,
      role: "assistant",
      time: { created: input.created, completed: input.created + 1 },
      parentID: USER_MESSAGE_ID,
      modelID: ModelID.make("gpt-5.5"),
      providerID: ProviderID.openai,
      mode: "build",
      agent: "buddy",
      path: { cwd: "/tmp", root: "/tmp" },
      cost: 0,
      tokens: {
        input: 0,
        output: 0,
        reasoning: 0,
        cache: { read: 0, write: 0 },
      },
    },
    parts: [
      {
        id: PartID.make(input.partID),
        sessionID: SESSION_ID,
        messageID,
        type: "tool",
        callID: `call_${input.partID}`,
        tool: "imagegen",
        state: {
          status: "completed",
          input: { prompt: "draw it" },
          output: "generated",
          title: "Generated image",
          metadata: { savedPath: input.savedPath },
          time: { start: input.created, end: input.created + 1 },
          attachments: [],
        },
      },
    ],
  }
}

describe("imagegen feature tool", () => {
  test("registers imagegen as the image-generation feature tool", () => {
    expect(imageGenerationFeature.tools.map((tool) => tool.id)).toEqual(["imagegen"])
  })

  test("uses the Codex argument contract and rejects conflicting image sources", () => {
    expect(
      ImagegenInputSchema.safeParse({
        prompt: "edit the image",
        referenced_image_paths: ["/tmp/reference.png"],
        num_last_images_to_include: 1,
      }).success,
    ).toBe(false)
    expect(
      ImagegenInputSchema.safeParse({
        prompt: "generate an image",
        title: "Sunlit Red Fox",
      }).success,
    ).toBe(true)
  })

  test("requests permission only for referenced images outside the workspace", async () => {
    await using project = await tmpdir({ git: true })
    await using externalDirectory = await tmpdir()
    const workspaceImagePath = path.join(project.path, "workspace-image.png")
    const externalImagePath = path.join(externalDirectory.path, "external-image.png")
    const permissionRequests: unknown[] = []
    await Promise.all([
      Bun.write(workspaceImagePath, "workspace"),
      Bun.write(externalImagePath, "external"),
    ])
    const resolvedExternalImagePath = await fs.realpath(externalImagePath)
    const resolvedExternalDirectory = path.dirname(resolvedExternalImagePath)
    const lexicalExternalImagePath = path.resolve(externalImagePath)
    const lexicalExternalDirectory = path.dirname(lexicalExternalImagePath)

    const authorizedPaths = await OpenCodeInstance.provide({
      directory: project.path,
      fn: () =>
        authorizeReferencedImagePaths([workspaceImagePath, externalImagePath], {
          directory: project.path,
          ask: async (input) => {
            permissionRequests.push(input)
          },
        }),
    })

    expect(authorizedPaths).toEqual([
      await fs.realpath(workspaceImagePath),
      resolvedExternalImagePath,
    ])
    expect(permissionRequests).toEqual([
      {
        permission: "external_directory",
        patterns: [path.join(lexicalExternalDirectory, "*")],
        always: [path.join(lexicalExternalDirectory, "*")],
        metadata: {
          filepath: lexicalExternalImagePath,
          parentDir: lexicalExternalDirectory,
        },
      },
      ...(lexicalExternalImagePath === resolvedExternalImagePath
        ? []
        : [
            {
              permission: "external_directory" as const,
              patterns: [path.join(resolvedExternalDirectory, "*")],
              always: [path.join(resolvedExternalDirectory, "*")],
              metadata: {
                filepath: resolvedExternalImagePath,
                parentDir: resolvedExternalDirectory,
              },
            },
          ]),
    ])
  })

  test("derives semantic titles and collision-safe filenames", () => {
    expect(
      resolveGeneratedImageTitle({
        title: "  Waving   Orange Panda  ",
        prompt: "ignored fallback prompt",
      }),
    ).toBe("Waving Orange Panda")
    expect(
      generatedImageFileName({
        title: "Waving Orange Panda!",
        uniqueID: "call_WeflPPMua6vH5eWQ4ccfMj54",
      }),
    ).toBe("waving-orange-panda-call_WeflPPMua6vH5eWQ4ccfMj54.png")
    expect(resolveGeneratedImageTitle({ prompt: "A red fox under moonlight" })).toBe(
      "A red fox under moonlight",
    )
  })

  test("selects recent user and generated tool images in chronological order", async () => {
    const messages = [userMessageWithImage(), assistantMessageWithGeneratedImage()]

    expect(await recentConversationImageDataUrls(messages, 1)).toEqual([IMAGE_B])
    expect(await recentConversationImageDataUrls(messages, 2)).toEqual([IMAGE_A, IMAGE_B])
  })

  test("rejects oversized referenced images before reading their payloads", async () => {
    await using directory = await tmpdir()
    const imagePath = path.join(directory.path, "oversized.png")
    await Bun.write(imagePath, "")
    await fs.truncate(imagePath, IMAGE_INPUT_MAX_FILE_BYTES + 1)

    await expect(referencedImageDataUrls([imagePath])).rejects.toThrow(
      `Referenced image exceeds the ${IMAGE_INPUT_MAX_FILE_BYTES}-byte limit`,
    )
  })

  test("rejects referenced images whose aggregate size exceeds the payload limit", async () => {
    await using directory = await tmpdir()
    const inputBytes = Math.floor(IMAGE_INPUT_MAX_TOTAL_BYTES / 3) + 1
    const imagePaths = ["first.png", "second.png", "third.png"].map((fileName) =>
      path.join(directory.path, fileName),
    )
    await Promise.all(
      imagePaths.map(async (imagePath) => {
        await Bun.write(imagePath, "")
        await fs.truncate(imagePath, inputBytes)
      }),
    )

    await expect(referencedImageDataUrls(imagePaths)).rejects.toThrow(
      `Image inputs exceed the ${IMAGE_INPUT_MAX_TOTAL_BYTES}-byte aggregate limit`,
    )
  })

  test("enforces one aggregate limit across recent data URLs and saved image paths", async () => {
    await using directory = await tmpdir()
    const firstImagePath = path.join(directory.path, "first.png")
    const secondImagePath = path.join(directory.path, "second.png")
    await Promise.all(
      [firstImagePath, secondImagePath].map(async (imagePath) => {
        await Bun.write(imagePath, "")
        await fs.truncate(imagePath, IMAGE_INPUT_MAX_FILE_BYTES)
      }),
    )
    const messages = [
      userMessageWithImage(),
      assistantMessageWithSavedImage({
        messageID: "msg_imagegen_saved_first",
        partID: "prt_imagegen_saved_first",
        savedPath: firstImagePath,
        created: 2,
      }),
      assistantMessageWithSavedImage({
        messageID: "msg_imagegen_saved_second",
        partID: "prt_imagegen_saved_second",
        savedPath: secondImagePath,
        created: 4,
      }),
    ]

    await expect(recentConversationImageDataUrls(messages, 3)).rejects.toThrow(
      `Image inputs exceed the ${IMAGE_INPUT_MAX_TOTAL_BYTES}-byte aggregate limit`,
    )
  })

  test("uses ChatGPT OAuth headers and Codex generate/edit endpoints", async () => {
    const requests: Array<{ url: string; init: RequestInit }> = []
    const client = createCodexImagesClient({
      fetch: async (url, init) => {
        requests.push({ url, init })
        return Response.json({ data: [{ b64_json: GENERATED_BASE64 }] })
      },
      resolveAuth: async () => ({
        type: "oauth",
        access: "access-token",
        refresh: "refresh-token",
        expires: Date.now() + 60_000,
        accountId: "account-id",
      }),
    })

    const generated = await client.createImage({
      prompt: "a red fox",
      imageDataUrls: [],
      signal: new AbortController().signal,
    })
    const edited = await client.createImage({
      prompt: "add a hat",
      imageDataUrls: [IMAGE_A],
      signal: new AbortController().signal,
    })

    expect(generated).toEqual({ base64: GENERATED_BASE64, operation: "generate" })
    expect(edited).toEqual({ base64: GENERATED_BASE64, operation: "edit" })
    expect(requests.map((request) => request.url)).toEqual([
      "https://chatgpt.com/backend-api/codex/images/generations",
      "https://chatgpt.com/backend-api/codex/images/edits",
    ])

    const generateHeaders = new Headers(requests[0].init.headers)
    expect(generateHeaders.get("authorization")).toBe("Bearer access-token")
    expect(generateHeaders.get("chatgpt-account-id")).toBe("account-id")

    const generateBody = requests[0].init.body
    const editBody = requests[1].init.body
    if (typeof generateBody !== "string" || typeof editBody !== "string") {
      throw new Error("Expected JSON request bodies")
    }
    expect(JSON.parse(generateBody)).toEqual({
      prompt: "a red fox",
      background: "auto",
      model: "gpt-image-2",
      quality: "auto",
      size: "auto",
    })
    expect(JSON.parse(editBody)).toEqual({
      prompt: "add a hat",
      background: "auto",
      model: "gpt-image-2",
      quality: "auto",
      size: "auto",
      images: [{ image_url: IMAGE_A }],
    })
  })

  test("does not issue an image request without ChatGPT OAuth", async () => {
    let fetchCalled = false
    const client = createCodexImagesClient({
      fetch: async () => {
        fetchCalled = true
        return Response.json({ data: [{ b64_json: GENERATED_BASE64 }] })
      },
      resolveAuth: async () => undefined,
    })

    await expect(
      client.createImage({
        prompt: "a red fox",
        imageDataUrls: [],
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow("ChatGPT OAuth credentials are not configured")
    expect(fetchCalled).toBe(false)
  })
})
