import { Button } from "@buddy/ui"
import { BookOpenIcon, SparklesIcon } from "@/components/layout/sidebar-icons"

const STARTER_PROMPTS = [
  "Where do I stand in the learning plan right now?",
  "Give me a quick recap of today's topic and a small exercise.",
  "Create a 20-minute study plan for this notebook.",
]

type ChatEmptyStateProps = {
  directoryLabel: string
  onUsePrompt: (prompt: string) => void
  onOpenCurriculum: () => void
}

export function ChatEmptyState(props: ChatEmptyStateProps) {
  return (
    <div className="flex flex-1 items-center justify-center rounded-xl border border-border/70 bg-card/60 p-6 md:p-8">
      <div className="mx-auto flex max-w-xl flex-col items-center text-center">
        <div className="mb-3 inline-flex size-10 items-center justify-center rounded-full border border-border/70 bg-background/70 text-muted-foreground">
          <SparklesIcon className="size-4" />
        </div>
        <h2 className="text-xl font-semibold">Let&apos;s learn in {props.directoryLabel}</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Ask Buddy anything, or start with a focused prompt from below.
        </p>

        <div className="mt-5 grid w-full gap-2">
          {STARTER_PROMPTS.map((prompt) => (
            <button
              key={prompt}
              type="button"
              onClick={() => props.onUsePrompt(prompt)}
              className="rounded-lg border border-border/70 bg-background/50 px-3 py-2 text-left text-sm transition-colors hover:bg-muted/60"
            >
              {prompt}
            </button>
          ))}
        </div>

        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="mt-5"
          onClick={props.onOpenCurriculum}
        >
          <BookOpenIcon className="mr-2 size-4" />
          Open learning plan
        </Button>
      </div>
    </div>
  )
}
