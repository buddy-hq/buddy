import { getSettingsTabDefinition, type SettingsTab } from "./settings-tabs"

type SettingsPageProps = {
  activeTab: SettingsTab
}

export function SettingsPage(props: SettingsPageProps) {
  const tabDef = getSettingsTabDefinition(props.activeTab)

  return (
    <div
      data-component="settings-page"
      data-active-tab={props.activeTab}
      className="flex h-full flex-1 w-full min-h-0 min-w-0 flex-col"
    >
      {tabDef.layout === "full-page" ? (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden overflow-y-auto">
          {tabDef.render()}
        </div>
      ) : (
        tabDef.render()
      )}
    </div>
  )
}
