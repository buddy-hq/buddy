import { Button } from "@buddy/ui"
import { Loader2Icon } from "lucide-react"
import { language } from "@/context/language"
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
    <section
      data-component="interactive-lesson-empty-state"
      className="flex min-h-0 flex-1 flex-col justify-center gap-4 px-6 py-8"
    >
      <div className="space-y-2">
        <h2 className="text-sm font-medium">
          {language.t("directoryChat.interactiveLesson.title")}
        </h2>
        <p className="text-sm text-text-weak">
          {language.t("directoryChat.interactiveLesson.description")}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className="text-xs text-text-weak" htmlFor="interactive-language">
          {language.t("directoryChat.interactiveLesson.language")}
        </label>
        <select
          data-action="interactive-lesson-language"
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
          data-action="interactive-lesson-start"
          size="sm"
          onClick={onStartInteractiveLesson}
          disabled={!canStartInteractiveLesson || isBusy || isStartingInteractiveLesson}
        >
          {isStartingInteractiveLesson ? (
            <>
              <Loader2Icon className="mr-2 size-4 animate-spin" />
              {language.t("directoryChat.interactiveLesson.starting")}
            </>
          ) : (
            language.t("directoryChat.interactiveLesson.start")
          )}
        </Button>
      </div>

      <div className="rounded-lg border border-border-base/70 bg-background-base p-3 text-xs text-text-weak">
        {language.t("directoryChat.interactiveLesson.workspacePrefix")}{" "}
        {isStartingInteractiveLesson
          ? language.t("directoryChat.interactiveLesson.workspaceStarting")
          : language.t("directoryChat.interactiveLesson.workspaceNotStarted")}
        <br />
        {language.t("directoryChat.interactiveLesson.selectedPersonaPrefix")} {selectedPersona}
      </div>
    </section>
  )
}
