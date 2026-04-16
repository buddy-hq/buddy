import { useNavigate } from "@tanstack/react-router"
import { Button, HomeIcon, SearchXIcon } from "@buddy/ui"
import { language } from "@/context/language"

export function DirectoryInvalidNotebook() {
  const navigate = useNavigate()

  return (
    <div
      data-component="directory-invalid-notebook"
      className="flex flex-col items-center justify-center h-full p-6 text-center animate-in fade-in slide-in-from-bottom-4 duration-500"
    >
      <div className="flex items-center justify-center size-20 rounded-full bg-surface-critical-base/10 text-text-critical-base mb-8 shadow-sm">
        <SearchXIcon className="size-10" />
      </div>
      <h1 className="text-2xl font-semibold text-text-strong mb-3 tracking-tight">
        {language.t("directoryChat.invalidNotebookTitle")}
      </h1>
      <p className="text-text-weak max-w-sm mb-10 leading-relaxed">
        {language.t("directoryChat.invalidNotebookIdentifier")}
      </p>
      <Button
        onClick={() => {
          void navigate({ to: "/chat" })
        }}
        variant="outline"
        className="gap-2.5 h-11 px-6 rounded-full shadow-xs hover:shadow-sm transition-all active:scale-95"
      >
        <HomeIcon className="size-4.5" />
        {language.t("actions.goHome")}
      </Button>
    </div>
  )
}
