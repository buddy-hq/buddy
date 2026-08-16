import { createHash } from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"
import { afterEach, describe, expect, test } from "bun:test"
import type { MessageV2 } from "@buddy/opencode-adapter/message"
import { Instance as OpenCodeInstance } from "@buddy/opencode-adapter/instance"
import { MessageID, ModelID, PartID, ProviderID, SessionID } from "@buddy/opencode-adapter/id"
import { imageGenerationFeature } from "../../src/learning/features/image-generation/feature"
import { createCodexImagesClient } from "../../src/learning/features/image-generation/service/codex-images"
import {
  generatedImageProvenance,
  generatedImageFileName,
  generatedImageSessionDirectory,
  resolveGeneratedImageTitle,
  saveGeneratedImage,
  type GeneratedImageProvenance,
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
  imagegenTool,
} from "../../src/learning/features/image-generation/tools/imagegen"
import { tmpdir } from "../helpers/tmpdir"
import { requireString } from "../helpers/parse"

const SESSION_ID = SessionID.make("ses_imagegen")
const OTHER_SESSION_ID = SessionID.make("ses_imagegen_other")
const SYMLINK_SESSION_ID = SessionID.make("ses_imagegen_symlink")
const AGGREGATE_SESSION_ID = SessionID.make("ses_imagegen_aggregate")
const USER_MESSAGE_ID = MessageID.make("msg_imagegen_user")
const ASSISTANT_MESSAGE_ID = MessageID.make("msg_imagegen_assistant")
const IMAGE_A = "data:image/png;base64,QUFB"
const IMAGE_B = "data:image/png;base64,QkJC"
const GENERATED_BASE64 = "R0VORVJBVEVE"

afterEach(async () => {
  await OpenCodeInstance.disposeAll()
})

function userMessageWithImage(sessionID: SessionID = SESSION_ID): MessageV2.WithParts {
  return {
    info: {
      id: USER_MESSAGE_ID,
      sessionID,
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
        sessionID,
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
  sessionID?: SessionID
  callID?: string
  provenance?: GeneratedImageProvenance
}): MessageV2.WithParts {
  const messageID = MessageID.make(input.messageID)
  const sessionID = input.sessionID ?? SESSION_ID
  const callID = input.callID ?? `call_${input.partID}`
  return {
    info: {
      id: messageID,
      sessionID,
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
        sessionID,
        messageID,
        type: "tool",
        callID,
        tool: "imagegen",
        state: {
          status: "completed",
          input: { prompt: "draw it" },
          output: "generated",
          title: "Generated image",
          metadata: Object.assign(
            { savedPath: input.savedPath },
            input.provenance ? { generatedImageProvenance: input.provenance } : undefined,
          ),
          time: { start: input.created, end: input.created + 1 },
          attachments: [],
        },
      },
    ],
  }
}

async function completedGeneratedImageFixture(input: {
  sessionID: SessionID
  callID: string
  label: string
  bytes?: string
}) {
  const bytes = input.bytes ?? "trusted-generated-image"
  const image = await saveGeneratedImage({
    sessionID: input.sessionID,
    callID: input.callID,
    title: input.label,
    base64: Buffer.from(bytes).toString("base64"),
  })
  const provenance = generatedImageProvenance({
    image,
    sessionID: input.sessionID,
    callID: input.callID,
  })
  const message = assistantMessageWithSavedImage({
    messageID: `msg_${input.label}`,
    partID: `prt_${input.label}`,
    savedPath: image.path,
    created: 2,
    sessionID: input.sessionID,
    callID: input.callID,
    provenance,
  })
  return { bytes, image, message, provenance }
}

function expectOnlyExternalDirectoryRequests(
  permissionRequests: readonly { permission: string }[],
): void {
  expect(permissionRequests.length).toBeGreaterThan(0)
  expect(new Set(permissionRequests.map((request) => request.permission))).toEqual(
    new Set(["external_directory"]),
  )
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

  test("prefers recent conversation images over local paths in the tool guidance", () => {
    expect(imagegenTool.description).toContain(
      "prefer `num_last_images_to_include` even when a local path is visible",
    )
    expect(imagegenTool.description).toContain(
      "Use `referenced_image_paths` only for genuine local-file targets",
    )
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
          messages: [],
          sessionID: SESSION_ID,
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

  test("trusts the exact completed imagegen output from the current session", async () => {
    await using project = await tmpdir({ git: true })
    const generated = await completedGeneratedImageFixture({
      sessionID: SESSION_ID,
      callID: "call_trusted_current_session",
      label: "trusted_current_session",
    })
    const permissionRequests: unknown[] = []

    const authorizedPaths = await OpenCodeInstance.provide({
      directory: project.path,
      fn: () =>
        authorizeReferencedImagePaths([generated.image.path], {
          directory: project.path,
          messages: [generated.message],
          sessionID: SESSION_ID,
          ask: async (input) => {
            permissionRequests.push(input)
          },
        }),
    })

    expect(authorizedPaths).toEqual([await fs.realpath(generated.image.path)])
    expect(permissionRequests).toEqual([])
  })

  test("does not trust an unrecorded file in the current generated-image session directory", async () => {
    await using project = await tmpdir({ git: true })
    const generated = await completedGeneratedImageFixture({
      sessionID: SESSION_ID,
      callID: "call_recorded_current_session",
      label: "recorded_current_session",
    })
    const unrecordedPath = path.join(path.dirname(generated.image.path), "unrecorded.png")
    const permissionRequests: Array<{ permission: string }> = []
    await Bun.write(unrecordedPath, "unrecorded")

    await OpenCodeInstance.provide({
      directory: project.path,
      fn: () =>
        authorizeReferencedImagePaths([unrecordedPath], {
          directory: project.path,
          messages: [generated.message],
          sessionID: SESSION_ID,
          ask: async (input) => {
            permissionRequests.push(input)
          },
        }),
    })

    expectOnlyExternalDirectoryRequests(permissionRequests)
  })

  test("does not trust a generated output from another session", async () => {
    await using project = await tmpdir({ git: true })
    const generated = await completedGeneratedImageFixture({
      sessionID: OTHER_SESSION_ID,
      callID: "call_other_session",
      label: "other_session",
    })
    const permissionRequests: Array<{ permission: string }> = []

    await OpenCodeInstance.provide({
      directory: project.path,
      fn: () =>
        authorizeReferencedImagePaths([generated.image.path], {
          directory: project.path,
          messages: [generated.message],
          sessionID: SESSION_ID,
          ask: async (input) => {
            permissionRequests.push(input)
          },
        }),
    })

    expectOnlyExternalDirectoryRequests(permissionRequests)
  })

  test("does not trust forged generated-image provenance", async () => {
    await using project = await tmpdir({ git: true })
    const sessionDirectory = generatedImageSessionDirectory(SESSION_ID)
    const forgedPath = path.join(sessionDirectory, "forged.png")
    const forgedBytes = Buffer.from("forged")
    await fs.mkdir(sessionDirectory, { recursive: true })
    await fs.writeFile(forgedPath, forgedBytes)
    const forgedProvenance = generatedImageProvenance({
      image: {
        path: forgedPath,
        sha256: createHash("sha256").update(forgedBytes).digest("hex"),
        sizeBytes: forgedBytes.byteLength,
      },
      sessionID: SESSION_ID,
      callID: "call_forged_claim",
    })
    const forgedMessage = assistantMessageWithSavedImage({
      messageID: "msg_forged_provenance",
      partID: "prt_forged_provenance",
      savedPath: forgedPath,
      created: 2,
      callID: "call_actual_part",
      provenance: forgedProvenance,
    })
    const permissionRequests: Array<{ permission: string }> = []

    await OpenCodeInstance.provide({
      directory: project.path,
      fn: () =>
        authorizeReferencedImagePaths([forgedPath], {
          directory: project.path,
          messages: [forgedMessage],
          sessionID: SESSION_ID,
          ask: async (input) => {
            permissionRequests.push(input)
          },
        }),
    })

    expectOnlyExternalDirectoryRequests(permissionRequests)
  })

  test("does not trust a generated path whose canonical target escapes the managed root", async () => {
    await using project = await tmpdir({ git: true })
    await using externalDirectory = await tmpdir()
    const generated = await completedGeneratedImageFixture({
      sessionID: SYMLINK_SESSION_ID,
      callID: "call_symlink_escape",
      label: "symlink_escape",
    })
    const sessionDirectory = generatedImageSessionDirectory(SYMLINK_SESSION_ID)
    const externalImagePath = path.join(externalDirectory.path, path.basename(generated.image.path))
    await Bun.write(externalImagePath, generated.bytes)
    if (path.dirname(generated.image.path) !== sessionDirectory) {
      throw new Error("Expected the generated image inside its managed session directory.")
    }
    await fs.rm(sessionDirectory, { recursive: true, force: true })
    await fs.symlink(
      externalDirectory.path,
      sessionDirectory,
      process.platform === "win32" ? "junction" : "dir",
    )
    const permissionRequests: Array<{ permission: string }> = []

    await OpenCodeInstance.provide({
      directory: project.path,
      fn: () =>
        authorizeReferencedImagePaths([generated.image.path], {
          directory: project.path,
          messages: [generated.message],
          sessionID: SYMLINK_SESSION_ID,
          ask: async (input) => {
            permissionRequests.push(input)
          },
        }),
    })

    expect(permissionRequests.map((request) => request.permission)).toEqual([
      "external_directory",
      "external_directory",
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

    expect(await recentConversationImageDataUrls(messages, 1, SESSION_ID)).toEqual([IMAGE_B])
    expect(await recentConversationImageDataUrls(messages, 2, SESSION_ID)).toEqual([
      IMAGE_A,
      IMAGE_B,
    ])
  })

  test("resolves an exact trusted generated output from recent conversation context", async () => {
    const generated = await completedGeneratedImageFixture({
      sessionID: SESSION_ID,
      callID: "call_trusted_recent_context",
      label: "trusted_recent_context",
    })

    expect(await recentConversationImageDataUrls([generated.message], 1, SESSION_ID)).toEqual([
      `data:image/png;base64,${Buffer.from(generated.bytes).toString("base64")}`,
    ])
  })

  test("rejects recent saved-path metadata without generated-image provenance", async () => {
    const sessionDirectory = generatedImageSessionDirectory(SESSION_ID)
    const untrustedPath = path.join(sessionDirectory, "untrusted-recent.png")
    await fs.mkdir(sessionDirectory, { recursive: true })
    await Bun.write(untrustedPath, "untrusted")
    const message = assistantMessageWithSavedImage({
      messageID: "msg_untrusted_recent",
      partID: "prt_untrusted_recent",
      savedPath: untrustedPath,
      created: 2,
    })

    await expect(recentConversationImageDataUrls([message], 1, SESSION_ID)).rejects.toThrow(
      "Recent conversation image is not a trusted generated output from the current session.",
    )
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
    const sessionDirectory = generatedImageSessionDirectory(AGGREGATE_SESSION_ID)
    const firstImagePath = path.join(sessionDirectory, "first.png")
    const secondImagePath = path.join(sessionDirectory, "second.png")
    await fs.mkdir(sessionDirectory, { recursive: true })
    await Promise.all(
      [firstImagePath, secondImagePath].map(async (imagePath) => {
        await Bun.write(imagePath, "")
        await fs.truncate(imagePath, IMAGE_INPUT_MAX_FILE_BYTES)
      }),
    )
    const zeroChunk = Buffer.alloc(1024 * 1024)
    const zeroHash = createHash("sha256")
    for (
      let bytesHashed = 0;
      bytesHashed < IMAGE_INPUT_MAX_FILE_BYTES;
      bytesHashed += zeroChunk.byteLength
    ) {
      zeroHash.update(
        zeroChunk.subarray(
          0,
          Math.min(zeroChunk.byteLength, IMAGE_INPUT_MAX_FILE_BYTES - bytesHashed),
        ),
      )
    }
    const sha256 = zeroHash.digest("hex")
    const firstCallID = "call_imagegen_saved_first"
    const secondCallID = "call_imagegen_saved_second"
    const messages = [
      userMessageWithImage(AGGREGATE_SESSION_ID),
      assistantMessageWithSavedImage({
        messageID: "msg_imagegen_saved_first",
        partID: "prt_imagegen_saved_first",
        savedPath: firstImagePath,
        created: 2,
        sessionID: AGGREGATE_SESSION_ID,
        callID: firstCallID,
        provenance: generatedImageProvenance({
          image: {
            path: firstImagePath,
            sha256,
            sizeBytes: IMAGE_INPUT_MAX_FILE_BYTES,
          },
          sessionID: AGGREGATE_SESSION_ID,
          callID: firstCallID,
        }),
      }),
      assistantMessageWithSavedImage({
        messageID: "msg_imagegen_saved_second",
        partID: "prt_imagegen_saved_second",
        savedPath: secondImagePath,
        created: 4,
        sessionID: AGGREGATE_SESSION_ID,
        callID: secondCallID,
        provenance: generatedImageProvenance({
          image: {
            path: secondImagePath,
            sha256,
            sizeBytes: IMAGE_INPUT_MAX_FILE_BYTES,
          },
          sessionID: AGGREGATE_SESSION_ID,
          callID: secondCallID,
        }),
      }),
    ]

    await expect(
      recentConversationImageDataUrls(messages, 3, AGGREGATE_SESSION_ID),
    ).rejects.toThrow(`Image inputs exceed the ${IMAGE_INPUT_MAX_TOTAL_BYTES}-byte aggregate limit`)
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

    const generateBody = requireString(requests[0].init.body, "generate JSON body")
    const editBody = requireString(requests[1].init.body, "edit JSON body")
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
