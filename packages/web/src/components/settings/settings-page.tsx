import {
  getSettingsTabDefinition,
  type SettingsTab,
  type SettingsTabRenderContext,
} from "./settings-tabs"

type SettingsPageProps = {
  activeTab: SettingsTab
  onOpenTab: SettingsTabRenderContext["onOpenTab"]
}

export function SettingsPage(props: SettingsPageProps) {
  const tabDef = getSettingsTabDefinition(props.activeTab)
  const renderContext: SettingsTabRenderContext = { onOpenTab: props.onOpenTab }

  return (
    <div
      data-component="settings-page"
      data-active-tab={props.activeTab}
      className="flex h-full flex-1 w-full min-h-0 min-w-0 flex-col"
    >
      {tabDef.layout === "full-page" ? (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden overflow-y-auto">
          {tabDef.render(renderContext)}
        </div>
      ) : (
        tabDef.render(renderContext)
      )}
    </div>
  )
}
