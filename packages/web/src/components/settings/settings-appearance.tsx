import { useMemo, useState } from 'react'
import {
  Button,
  Progress,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Separator,
  Switch,
  toast,
} from '@buddy/ui'
import { usePlatform } from '@/context/platform'
import { showDesktopUpdateToast } from '../../lib/desktop-updates'
import { useTheme, type ColorScheme } from '@/theme'
import { SettingsListCard, SettingsRow } from './settings-primitives'
import { advancedMathStatusLabel, useAdvancedMathRuntime } from './use-advanced-math-runtime'
import { ConfirmRemoveMathRuntimeDialog } from './confirm-remove-math-runtime-dialog'
import { SettingsPanelContent } from './settings-page'

function isColorScheme(value: string): value is ColorScheme {
  return value === 'system' || value === 'light' || value === 'dark'
}

export function AppearanceSettings() {
  const platform = usePlatform()
  const [checkingForUpdates, setCheckingForUpdates] = useState(false)

  const {
    advancedMathStatus,
    advancedMathLoading,
    advancedMathBusy,
    advancedMathEnabled,
    onToggleAdvancedMathRuntime,
    removeConfirmOpen,
    setRemoveConfirmOpen,
    onConfirmRemoveMathRuntime,
  } = useAdvancedMathRuntime({
    open: true,
    platform: platform.platform,
  })

  const { themeId, colorScheme, themes, setTheme, setColorScheme } = useTheme()

  const colorSchemeOptions: { value: ColorScheme; label: string }[] = [
    { value: 'system', label: 'System' },
    { value: 'light', label: 'Light' },
    { value: 'dark', label: 'Dark' },
  ]

  const themeOptions = useMemo(() => {
    return Object.entries(themes).map(([id, theme]) => ({
      id,
      name: theme.name,
    }))
  }, [themes])

  const showDesktopUpdateControls =
    platform.platform === 'desktop' && !!platform.checkUpdate && !!platform.update
  const showAdvancedMathControls = platform.platform === 'desktop'

  async function onCheckForUpdates() {
    if (platform.platform !== 'desktop' || !platform.checkUpdate || !platform.update) return
    setCheckingForUpdates(true)
    const result = await platform
      .checkUpdate()
      .catch(() => ({ status: 'error', stage: 'check' }) as const)
    setCheckingForUpdates(false)
    switch (result.status) {
      case 'ready':
        showDesktopUpdateToast({ platform, version: result.version })
        return
      case 'up-to-date':
        toast('Buddy is up to date')
        return
      case 'disabled':
        toast('Updates are unavailable in this build')
        return
      case 'error':
        toast.error(
          result.stage === 'download'
            ? 'Found an update, but download failed'
            : 'Failed to check for updates',
        )
        return
    }
  }

  return (
    <>
      <SettingsPanelContent
        title="Appearance"
        description="Adjust Buddy interface and desktop app settings."
      >
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-foreground">Theme</h3>
          <SettingsListCard>
            <SettingsRow
              title="Color scheme"
              description="Choose how Buddy should render on this machine. System follows your OS setting."
              control={
                <Select
                  value={colorScheme}
                  onValueChange={(value) => isColorScheme(value) && setColorScheme(value)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select color scheme" />
                  </SelectTrigger>
                  <SelectContent>
                    {colorSchemeOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              }
            />
            <SettingsRow
              title="Theme"
              description="Choose your preferred theme for the interface."
              control={
                <Select value={themeId} onValueChange={setTheme}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select theme" />
                  </SelectTrigger>
                  <SelectContent>
                    {themeOptions.map((option) => (
                      <SelectItem key={option.id} value={option.id}>
                        {option.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              }
            />
          </SettingsListCard>
        </div>

        {showAdvancedMathControls || showDesktopUpdateControls ? (
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-foreground">Desktop app</h3>
            <SettingsListCard>
              {showAdvancedMathControls ? (
                <>
                  <SettingsRow
                    title="Advanced math runtime"
                    description="Optional machine-wide runtime for Python-based math and plotting."
                    control={
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-xs text-muted-foreground">
                            {advancedMathStatusLabel(advancedMathStatus, advancedMathLoading)}
                          </span>
                          <Switch
                            aria-label="Toggle advanced math runtime"
                            checked={advancedMathEnabled}
                            disabled={advancedMathBusy || advancedMathStatus === null}
                            onCheckedChange={onToggleAdvancedMathRuntime}
                          />
                        </div>
                        {advancedMathStatus?.progressMessage ||
                        typeof advancedMathStatus?.progressPercent === 'number' ? (
                          <div className="space-y-1">
                            <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                              <span className="truncate">
                                {advancedMathStatus?.progressMessage ?? 'Working...'}
                              </span>
                              {typeof advancedMathStatus?.progressPercent === 'number' ? (
                                <span>{Math.round(advancedMathStatus.progressPercent)}%</span>
                              ) : null}
                            </div>
                            <Progress
                              value={advancedMathStatus?.progressPercent ?? 0}
                              className="h-1.5"
                            />
                          </div>
                        ) : null}
                        {advancedMathStatus?.lastError ? (
                          <p className="text-xs text-destructive">{advancedMathStatus.lastError}</p>
                        ) : null}
                      </div>
                    }
                  />
                  <Separator />
                </>
              ) : null}
              <SettingsRow
                title="App updates"
                description="Check for and install desktop app updates. This applies to Buddy itself, not this notebook."
                last
                control={
                  <Button
                    type="button"
                    size="xs"
                    variant="outline"
                    onClick={() => void onCheckForUpdates()}
                    disabled={checkingForUpdates}
                  >
                    {checkingForUpdates ? 'Checking...' : 'Check for updates'}
                  </Button>
                }
              />
            </SettingsListCard>
          </div>
        ) : null}
      </SettingsPanelContent>
      <ConfirmRemoveMathRuntimeDialog
        open={removeConfirmOpen}
        onOpenChange={setRemoveConfirmOpen}
        onConfirm={onConfirmRemoveMathRuntime}
      />
    </>
  )
}
