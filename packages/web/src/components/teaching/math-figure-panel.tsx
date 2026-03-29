import { language } from "@/context/language"

type MathFigurePanelProps = {
  className?: string
}

export function MathFigurePanel(props: MathFigurePanelProps) {
  return (
    <section className={`flex min-h-0 flex-1 flex-col gap-4 px-6 py-8 ${props.className ?? ""}`}>
      <div className="space-y-2">
        <h2 className="text-sm font-medium">{language.t("teaching.mathFigure.title")}</h2>
        <p className="text-sm text-text-weak">{language.t("teaching.mathFigure.description")}</p>
        <p className="text-xs text-text-weak">{language.t("teaching.mathFigure.phaseOneNote")}</p>
      </div>

      <div className="rounded-lg border border-border-base/70 bg-background-base p-3 text-xs text-text-weak">
        {language.t("teaching.mathFigure.toolsPrefix")} <code>render_figure</code>,{" "}
        <code>render_freeform_figure</code>.
        <br />
        {language.t("teaching.mathFigure.toolsHint")}
      </div>
    </section>
  )
}
