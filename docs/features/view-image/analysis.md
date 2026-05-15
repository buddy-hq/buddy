# View Image

## Status

Image handling in vendor/opencode is fully understood and documented here. This covers how
models signal image support, how user-attached images and agent-read images reach the LLM,
and how provider-specific differences are handled.

## How Model Image Support Is Determined

### Source of truth: models.dev

The model catalog (`https://models.dev/api.json`) provides a `modalities` field per model:

```ts
{
  modalities: {
    input: ["text", "image", ...],   // what the model accepts
    output: ["text", ...],           // what the model produces
  }
}
```

Relevant file: `vendor/opencode/packages/opencode/src/provider/models.ts:70-75`

### Conversion to internal capabilities

`fromModelsDevModel()` in `provider/provider.ts:971-1020` maps this into the internal `Provider.Model` type:

```ts
capabilities: {
  input: {
    text:  model.modalities?.input?.includes("text")  ?? false,
    image: model.modalities?.input?.includes("image") ?? false,
    audio: model.modalities?.input?.includes("audio") ?? false,
    video: model.modalities?.input?.includes("video") ?? false,
    pdf:   model.modalities?.input?.includes("pdf")   ?? false,
  },
  ...
}
```

These capabilities can be overridden per-model via the user's `opencode.json` config (see
`provider/provider.ts:1159-1182`), which merges config on top of the models.dev data.

### Runtime gating: unsupportedParts

When messages are prepared for an LLM call, `unsupportedParts()` in
`provider/transform.ts:267-303` checks every user message part:

1. Extract MIME from the part (image `data:` URL prefix, or file `mediaType`).
2. Map MIME to a modality string via `mimeToModality()` (e.g. `image/png` → `"image"`).
3. Check `model.capabilities.input[modality]` — if `false`, the part is replaced with:
   ```
   ERROR: Cannot read <name> (this model does not support <modality> input). Inform the user.
   ```

This means the agent loop never sends images to models that can't handle them — it gets
a text error instead, and the agent is expected to inform the user.

## How User-Attached Images Reach the LLM

### Storage

User-attached images are stored in the database as `FilePart` records
(`message-v2.ts:181-190`):

```ts
{
  type: "file",
  mime: "image/png",
  url: "data:image/png;base64,...",
  filename: "screenshot.png",
}
```

### Conversion to model messages

`toModelMessages()` in `message-v2.ts:642-832` converts stored parts into the AI SDK's
`UIMessage` format. Image file parts become:

```ts
{ type: "file", url: "data:image/png;base64,...", mediaType: "image/png", filename: "screenshot.png" }
```

The AI SDK's `convertToModelMessages()` then turns these into `ModelMessage` with:

```ts
{ type: "image", image: "data:image/png;base64,..." }
```

### Serialization per provider

The AI SDK provider-specific converters serialize `ModelMessage` into the provider's wire
format. For example, `copilot/chat/convert-to-openai-compatible-chat-messages.ts:45-58`:

```ts
// file part with image/* mediaType →
{ type: "image_url", image_url: { url: "data:image/png;base64,..." } }
```

Images are always transmitted as base64 data URLs.

## How the Agent "Sees" Images on Its Own

When the agent calls the `read` tool on an image file:

### Tool execution

`tool/read.ts:209-228` detects the file is an image via `isImageAttachment(mime)`, reads
the full bytes, and returns:

```ts
{
  output: "Image read successfully",
  attachments: [{
    type: "file",
    mime: "image/png",
    url: "data:image/png;base64,...",
  }],
}
```

The `attachments` field (`tool/tool.ts:32`) uses the same `FilePart` shape as
user-attached files.

### Feeding back on the next turn

In `message-v2.ts:720-810`, when `toModelMessages()` processes a completed tool result
with attachments, two paths exist depending on the provider:

**Path A — Provider supports media in tool results:**

The attachment goes directly into the tool result content as `{ type: "media", mediaType,
data }`. The AI SDK's `convertToModelMessages()` maps it to an `image` part in the
`ModelMessage`. This is the clean path.

Supported providers (`message-v2.ts:596-606`):
- `@ai-sdk/anthropic`
- `@ai-sdk/openai`
- `@ai-sdk/amazon-bedrock`
- `@ai-sdk/google-vertex/anthropic`
- `@ai-sdk/google` (gemini-3+ only)

**Path B — Provider does NOT support media in tool results:**

The images are extracted from the tool result and injected as a **synthetic user message**
immediately after the assistant message. The synthetic message has:

```ts
{
  role: "user",
  parts: [
    { type: "text", text: "Attached image(s) from tool result:" },
    { type: "file", url: "data:image/png;base64,...", mediaType: "image/png" },
  ]
}
```

This synthetic message uses the same shape as a user-attached file, so downstream
conversion and serialization are identical. This applies to all providers not in the
supported list above (e.g. `@ai-sdk/openai-compatible`, `@openrouter/ai-sdk-provider`,
`venice-ai-sdk-provider`, etc.).

### End-to-end summary

```
Agent calls read("screenshot.png")
  → tool returns { output: "Image read successfully", attachments: [{...base64...}] }
  → toModelMessages() processes tool result:
      ├─ media-in-tool-results? → inline as `media` part in tool result content
      └─ otherwise             → injected as synthetic user message
  → convertToModelMessages() → { type: "image", image: "data:image/png;base64,..." }
  → unsupportedParts() gate: model supports image input?
      ├─ yes → image goes through to provider API
      └─ no  → replaced with error text
```

## Additional Transformations

### Empty image handling

`provider/transform.ts:274-285` also detects empty base64 image data (e.g.
`data:image/png;base64,`) and replaces it with:
```
ERROR: Image file is empty or corrupted. Please provide a valid image.
```

### stripMedia mode

The `toModelMessages()` function accepts a `stripMedia` option (`message-v2.ts:660-664`).
When enabled, image file parts are replaced with a text description instead of the data
URL: `[Attached image/png: screenshot.png]`. This is used for compacted/summarized
messages where keeping the base64 data would waste context window.

## Source Map

Model catalog and capabilities:
- `vendor/opencode/packages/opencode/src/provider/models.ts` — models.dev schema and data fetching
- `vendor/opencode/packages/opencode/src/provider/provider.ts` — `fromModelsDevModel()` (capability derivation), config merging
- `vendor/opencode/packages/opencode/src/provider/transform.ts` — `unsupportedParts()` (runtime gate), empty image detection

Message conversion:
- `vendor/opencode/packages/opencode/src/session/message-v2.ts` — `toModelMessages()` (tool result → UIMessage flow, synthetic user message injection)
- `vendor/opencode/packages/opencode/src/tool/tool.ts` — `ExecuteResult` type (the `attachments` contract)
- `vendor/opencode/packages/opencode/src/tool/read.ts` — image detection and attachment return

Provider serialization (for OpenAI-compatible as representative example):
- `vendor/opencode/packages/opencode/src/provider/sdk/copilot/chat/convert-to-openai-compatible-chat-messages.ts` — `type: "image_url"` serialization

Utilities:
- `vendor/opencode/packages/opencode/src/util/media.ts` — `isMedia()` used by MIME-based branching
