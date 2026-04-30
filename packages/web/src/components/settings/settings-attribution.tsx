import { ExternalLinkIcon, ScaleIcon } from "lucide-react"
import { usePlatform } from "@/context/platform"
import { language } from "@/context/language"
import { SettingsContent, SettingsListCard, SettingsRow } from "./settings-primitives"

function AttributionLink({ href, children }: { href: string; children: React.ReactNode }) {
  const platform = usePlatform()

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 text-sm font-medium text-text-base transition-colors hover:text-text-interactive-base cursor-pointer"
      onClick={(e) => {
        e.preventDefault()
        platform.openLink(href)
      }}
    >
      {children}
      <ExternalLinkIcon className="size-3 text-text-weak" />
    </a>
  )
}

export function AttributionSettings() {
  return (
    <SettingsContent
      title={language.t("settings.attribution.title")}
      description={language.t("settings.attribution.description")}
      eyebrow="App information"
    >
      <div className="space-y-6">
        <SettingsListCard>
          <SettingsRow
            title={
              <AttributionLink href="https://github.com/learning-commons-org/knowledge-graph">
                {language.t("settings.attribution.knowledgeGraph.title")}
              </AttributionLink>
            }
            description={language.t("settings.attribution.knowledgeGraph.description")}
            control={
              <div className="flex justify-end">
                <span className="inline-flex items-center rounded-full border border-border-base/60 bg-surface-tertiary px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-wide text-text-weaker">
                  CC BY 4.0 / MIT
                </span>
              </div>
            }
          />
          <SettingsRow
            title={
              <AttributionLink href="https://github.com/learning-commons-org/evaluators">
                {language.t("settings.attribution.evaluators.title")}
              </AttributionLink>
            }
            description={language.t("settings.attribution.evaluators.description")}
            control={
              <div className="flex justify-end">
                <span className="inline-flex items-center rounded-full border border-border-base/60 bg-surface-tertiary px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-wide text-text-weaker">
                  CC BY 4.0 / MIT
                </span>
              </div>
            }
          />
          <SettingsRow
            title={
              <AttributionLink href="https://github.com/anomalyco/opencode">
                {language.t("settings.attribution.opencode.title")}
              </AttributionLink>
            }
            description={language.t("settings.attribution.opencode.description")}
            last
            control={
              <div className="flex justify-end">
                <span className="inline-flex items-center rounded-full border border-border-base/60 bg-surface-tertiary px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-wide text-text-weaker">
                  MIT
                </span>
              </div>
            }
          />
        </SettingsListCard>

        <div className="space-y-3">
          <div className="flex items-center gap-2.5">
            <div className="flex size-6 items-center justify-center rounded-md bg-surface-tertiary">
              <ScaleIcon className="size-3.5 text-text-weak" />
            </div>
            <h3 className="text-sm font-medium text-text-base">
              {language.t("settings.attribution.additionalAttributions.title")}
            </h3>
          </div>
          <SettingsListCard>
            <SettingsRow
              title={
                <AttributionLink href="https://github.com/prashantbhudwal/buddy">
                  {language.t("settings.attribution.buddy.title")}
                </AttributionLink>
              }
              description={language.t("settings.attribution.buddy.description")}
              last
              control={
                <div className="flex justify-end">
                  <span className="inline-flex items-center rounded-full border border-border-base/60 bg-surface-tertiary px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-wide text-text-weaker">
                    O’Saasy License
                  </span>
                </div>
              }
            />
          </SettingsListCard>
        </div>
      </div>
    </SettingsContent>
  )
}
