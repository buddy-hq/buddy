import { useState } from "react"
import { ToggleGroup, ToggleGroupItem } from "@buddy/ui"
import type { AssistantErrorCategory, AssistantErrorModel } from "@/state/chat-error-model"
import {
  AssistantErrorCard,
  AssistantTruncatedNote,
  createAssistantErrorCardSpec,
} from "@/components/chat/assistant-error-card"

/**
 * Easel · Error card (breathing pass)
 *
 * Renders the real production `AssistantErrorCard` — the same component the
 * transcript uses — across every terminal category, so the spacing pass can be
 * eyeballed against actual copy. Nothing here is a mock of the card; only the
 * error models feeding it are synthesized.
 */

type PreviewCase = {
  category: AssistantErrorCategory
  tag: string
  details: AssistantErrorModel["details"]
}

const PREVIEW_CASES: PreviewCase[] = [
  {
    category: "auth",
    tag: "auth · ProviderAuthError",
    details: {
      name: "ProviderAuthError",
      statusCode: 401,
      responseBody: "401 · invalid x-api-key while loading provider credentials",
    },
  },
  {
    category: "rate-limit",
    tag: "rate_limit · APIError 429",
    details: {
      name: "APIError",
      statusCode: 429,
      responseBody:
        '{"type":"rate_limit_error","message":"Number of request tokens has exceeded your per-minute rate limit"}',
    },
  },
  {
    category: "temporarily-unavailable",
    tag: "temporarily_unavailable · APIError 529",
    details: { name: "APIError", statusCode: 529, responseBody: "Overloaded" },
  },
  {
    category: "usage-limit",
    tag: "usage_limit · CreditsError",
    details: {
      name: "APIError",
      statusCode: 401,
      responseBody:
        '{"type":"error","error":{"type":"CreditsError","message":"Insufficient balance"}}',
    },
  },
  {
    category: "model-unavailable",
    tag: "model_unavailable · ModelError",
    details: {
      name: "APIError",
      statusCode: 401,
      responseBody: '{"type":"error","error":{"type":"ModelError","message":"Model is disabled"}}',
    },
  },
  {
    category: "access-restricted",
    tag: "access_restricted · RegionError",
    details: {
      name: "APIError",
      statusCode: 403,
      responseBody:
        '{"type":"error","error":{"type":"RegionError","message":"This model is not available in your region"}}',
    },
  },
  {
    category: "network",
    tag: "network · APIError (transport)",
    details: { name: "APIError", responseBody: "Connection reset by server (ECONNRESET)" },
  },
  {
    category: "context",
    tag: "context · ContextOverflowError",
    details: {
      name: "ContextOverflowError",
      responseBody: "Requested 214,300 tokens · model context window is 200,000",
    },
  },
  {
    category: "content",
    tag: "content · ContentFilterError",
    details: { name: "ContentFilterError", responseBody: "finish_reason: content_filter" },
  },
  {
    category: "format",
    tag: "format · StructuredOutputError",
    details: {
      name: "StructuredOutputError",
      responseBody: "Response did not satisfy the required JSON schema after 2 retries",
    },
  },
  {
    category: "unknown",
    tag: "unknown · UnknownError",
    details: {
      name: "UnknownError",
      responseBody: '{"error":{"type":"api_error","message":"internal server error"}}',
    },
  },
]

function modelFor(preview: PreviewCase): AssistantErrorModel {
  return {
    category: preview.category,
    disposition: "terminal",
    details: preview.details,
  }
}

type Density = "single" | "gallery"

export function ErrorCardPreviewEasel() {
  const [density, setDensity] = useState<Density>("gallery")
  const [caseIndex, setCaseIndex] = useState(0)
  const visibleCases = density === "single" ? [PREVIEW_CASES[caseIndex]!] : PREVIEW_CASES

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-background-base">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border-weaker-base px-3 py-1.5">
        <span className="text-xs font-medium text-text-base">Error card</span>
        <div className="h-3.5 w-px bg-border-weaker-base" />
        <ToggleGroup
          type="single"
          value={density}
          onValueChange={(v) => {
            if (v) setDensity(v as Density)
          }}
          variant="outline"
          size="sm"
        >
          <ToggleGroupItem value="gallery" className="text-xs">
            Gallery
          </ToggleGroupItem>
          <ToggleGroupItem value="single" className="text-xs">
            One at a time
          </ToggleGroupItem>
        </ToggleGroup>
        {density === "single" ? (
          <ToggleGroup
            type="single"
            value={String(caseIndex)}
            onValueChange={(v) => {
              if (v) setCaseIndex(Number(v))
            }}
            variant="outline"
            size="sm"
          >
            {PREVIEW_CASES.map((preview, index) => (
              <ToggleGroupItem key={preview.category} value={String(index)} className="text-xs">
                {preview.category}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        ) : null}
        <span className="hidden min-w-0 truncate text-[11px] text-text-weaker xl:inline">
          Real AssistantErrorCard · roomier spacing pass
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto bg-surface-inset-base">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-5">
          {visibleCases.map((preview) => (
            <div key={preview.category} className="flex flex-col gap-1.5">
              <span className="px-0.5 font-mono text-[11px] text-text-weaker">{preview.tag}</span>
              <AssistantErrorCard
                spec={createAssistantErrorCardSpec(modelFor(preview))}
                onAction={() => undefined}
              />
            </div>
          ))}

          <div className="mt-2 h-px bg-border-weaker-base" />
          <span className="px-0.5 font-mono text-[11px] text-text-weaker">
            output-length · MessageOutputLengthError — inline note, not a red card
          </span>
          <AssistantTruncatedNote onContinue={() => undefined} />
        </div>
      </div>
    </div>
  )
}
