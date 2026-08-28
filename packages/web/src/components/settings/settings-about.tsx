import type { ReactNode } from "react"

import { ExternalLinkIcon } from "@/icons/app-icons"
import { language } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { SettingsContent, SettingsRow, SettingsSection } from "./settings-primitives"
import { UpdatesSettingsSection } from "./settings-updates-section"

function AttributionLink(props: { href: string; children: ReactNode }) {
  const platform = usePlatform()

  return (
    <a
      href={props.href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 text-sm font-medium text-text-base transition-colors hover:text-text-interactive-base cursor-pointer"
      onClick={(e) => {
        e.preventDefault()
        platform.openLink(props.href)
      }}
    >
      {props.children}
      <ExternalLinkIcon className="size-3 text-text-weak" />
    </a>
  )
}

function LicenseBadge(props: { children: ReactNode }) {
  return (
    <div className="flex justify-end">
      <span className="inline-flex items-center rounded-full border border-border-base/60 bg-surface-weak px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-wide text-text-weaker">
        {props.children}
      </span>
    </div>
  )
}

export function AboutSettings() {
  return (
    <SettingsContent>
      <UpdatesSettingsSection />

      <SettingsSection title={language.t("settings.attribution.title")}>
        <SettingsRow
          title={
            <AttributionLink href="https://github.com/learning-commons-org/knowledge-graph">
              {language.t("settings.attribution.knowledgeGraph.title")}
            </AttributionLink>
          }
          description={language.t("settings.attribution.knowledgeGraph.description")}
          control={<LicenseBadge>CC BY 4.0 / MIT</LicenseBadge>}
        />
        <SettingsRow
          title={
            <AttributionLink href="https://github.com/learning-commons-org/evaluators">
              {language.t("settings.attribution.evaluators.title")}
            </AttributionLink>
          }
          description={language.t("settings.attribution.evaluators.description")}
          control={<LicenseBadge>CC BY 4.0 / MIT</LicenseBadge>}
        />
        <SettingsRow
          title={
            <AttributionLink href="https://github.com/anomalyco/opencode">
              {language.t("settings.attribution.opencode.title")}
            </AttributionLink>
          }
          description={language.t("settings.attribution.opencode.description")}
          control={<LicenseBadge>MIT</LicenseBadge>}
        />
      </SettingsSection>
    </SettingsContent>
  )
}
