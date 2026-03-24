import { Button } from "@buddy/ui"
import { Loader2Icon } from "lucide-react"
import { TEACHING_LANGUAGE_OPTIONS, type TeachingLanguage } from "@/state/teaching-runtime"

type InteractiveLessonEmptyStateProps = {
  preferredLanguage: TeachingLanguage
  selectedPersona: string
  isBusy: boolean
  isStartingInteractiveLesson: boolean
  canStartInteractiveLesson: boolean
  onPreferredLanguageChange: (language: TeachingLanguage) => void
  onStartInteractiveLesson: () => void
}

export function InteractiveLessonEmptyState(props: InteractiveLessonEmptyStateProps) {
  const {
    preferredLanguage,
    selectedPersona,
    isBusy,
    isStartingInteractiveLesson,
    canStartInteractiveLesson,
    onPreferredLanguageChange,
    onStartInteractiveLesson,
  } = props

  return (
    <section className="flex min-h-0 flex-1 flex-col justify-center gap-4 px-6 py-8">
      <div className="space-y-2">
        <h2 className="text-sm font-medium">Interactive Lesson</h2>
        <p className="text-sm text-text-weak">
          Start an interactive session to create a tracked workspace with files, checkpoints, and
          server-backed editor diagnostics.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className="text-xs text-text-weak" htmlFor="interactive-language">
          Language
        </label>
        <select
          id="interactive-language"
          className="h-8 rounded-md border bg-background-base px-2 text-xs"
          value={preferredLanguage}
          onChange={(event) => {
            const nextLanguage = TEACHING_LANGUAGE_OPTIONS.find(
              (option) => option.value === event.target.value,
            )?.value
            if (nextLanguage) onPreferredLanguageChange(nextLanguage)
          }}
          disabled={!canStartInteractiveLesson || isBusy}
        >
          {TEACHING_LANGUAGE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <Button
          size="sm"
          onClick={onStartInteractiveLesson}
          disabled={!canStartInteractiveLesson || isBusy || isStartingInteractiveLesson}
        >
          {isStartingInteractiveLesson ? (
            <>
              <Loader2Icon className="mr-2 size-4 animate-spin" />
              Starting...
            </>
          ) : (
            "Start Interactive Lesson"
          )}
        </Button>
      </div>

      <div className="rounded-lg border border-border-base/70 bg-background-base p-3 text-xs text-text-weak">
        Current workspace: {isStartingInteractiveLesson ? "starting..." : "not started"}
        <br />
        Selected persona: {selectedPersona}
      </div>
    </section>
  )
}
