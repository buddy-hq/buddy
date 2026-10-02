import { APP_SHORTCUTS } from "@buddy/browser-contract"
import { Kbd, KbdGroup } from "@buddy/ui/components/ui/kbd"
import { formatForDisplay } from "@tanstack/react-hotkeys"
import { language } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { SHORTCUTS, formatShortcutTokens, shortcutDisplayPlatform } from "@/lib/shortcuts"
import { SettingsContent, SettingsRow, SettingsSection } from "./settings-primitives"

const SHORTCUT_GROUPS = [
  { id: "chats", titleKey: "settings.shortcuts.chatsSection" },
  { id: "composer", titleKey: "settings.shortcuts.composerSection" },
  { id: "navigation", titleKey: "settings.shortcuts.navigationSection" },
  { id: "bench", titleKey: "settings.shortcuts.benchSection" },
] as const

type ShortcutGroupID = (typeof SHORTCUT_GROUPS)[number]["id"]

const DISPLAYED_SHORTCUTS = {
  ...APP_SHORTCUTS,
  "composer.note.toggle": SHORTCUTS["composer.note.toggle"],
} as const

type DisplayedShortcutID = keyof typeof DISPLAYED_SHORTCUTS

type ShortcutMetadata = {
  readonly descriptionKey?: string
  readonly group: ShortcutGroupID
  readonly labelKey: string
  readonly order: number
  readonly rowID: string
}

const SHORTCUT_METADATA = {
  "chat.new": {
    group: "chats",
    labelKey: "settings.shortcuts.newChat",
    order: 0,
    rowID: "chat.new",
  },
  "chat.previous": {
    group: "chats",
    labelKey: "settings.shortcuts.previousChat",
    order: 1,
    rowID: "chat.previous",
  },
  "chat.next": {
    group: "chats",
    labelKey: "settings.shortcuts.nextChat",
    order: 2,
    rowID: "chat.next",
  },
  "composer.focus": {
    group: "navigation",
    labelKey: "settings.shortcuts.focusComposer",
    order: 0,
    rowID: "composer.focus",
  },
  "composer.note.toggle": {
    descriptionKey: "settings.shortcuts.toggleNoteModeDescription",
    group: "composer",
    labelKey: "settings.shortcuts.toggleNoteMode",
    order: 0,
    rowID: "composer.note.toggle",
  },
  "search.open": {
    group: "navigation",
    labelKey: "settings.shortcuts.searchNotebook",
    order: 1,
    rowID: "search.open",
  },
  "file.quickOpen": {
    group: "navigation",
    labelKey: "settings.shortcuts.quickOpen",
    order: 2,
    rowID: "file.quickOpen",
  },
  "sidebar.toggle": {
    group: "navigation",
    labelKey: "settings.shortcuts.toggleSidebar",
    order: 3,
    rowID: "sidebar.toggle",
  },
  "bench.toggle": {
    group: "bench",
    labelKey: "settings.shortcuts.toggleBench",
    order: 0,
    rowID: "bench.toggle",
  },
  "browser.newTab": {
    group: "bench",
    labelKey: "settings.shortcuts.newBrowserTab",
    order: 1,
    rowID: "browser.newTab",
  },
  "bench.closeTab": {
    group: "bench",
    labelKey: "settings.shortcuts.closeBenchTab",
    order: 2,
    rowID: "bench.closeTab",
  },
  "bench.tab.1": {
    group: "bench",
    labelKey: "settings.shortcuts.benchTabByPosition",
    order: 3,
    rowID: "bench.tab",
  },
  "bench.tab.2": {
    group: "bench",
    labelKey: "settings.shortcuts.benchTabByPosition",
    order: 3,
    rowID: "bench.tab",
  },
  "bench.tab.3": {
    group: "bench",
    labelKey: "settings.shortcuts.benchTabByPosition",
    order: 3,
    rowID: "bench.tab",
  },
  "bench.tab.4": {
    group: "bench",
    labelKey: "settings.shortcuts.benchTabByPosition",
    order: 3,
    rowID: "bench.tab",
  },
  "bench.tab.5": {
    group: "bench",
    labelKey: "settings.shortcuts.benchTabByPosition",
    order: 3,
    rowID: "bench.tab",
  },
  "bench.tab.6": {
    group: "bench",
    labelKey: "settings.shortcuts.benchTabByPosition",
    order: 3,
    rowID: "bench.tab",
  },
  "bench.tab.7": {
    group: "bench",
    labelKey: "settings.shortcuts.benchTabByPosition",
    order: 3,
    rowID: "bench.tab",
  },
  "bench.tab.8": {
    group: "bench",
    labelKey: "settings.shortcuts.benchTabByPosition",
    order: 3,
    rowID: "bench.tab",
  },
  "bench.tab.last": {
    group: "bench",
    labelKey: "settings.shortcuts.lastBenchTab",
    order: 4,
    rowID: "bench.tab.last",
  },
} as const satisfies Record<DisplayedShortcutID, ShortcutMetadata>

type ShortcutRowDefinition = {
  readonly commands: ReadonlyArray<DisplayedShortcutID>
  readonly descriptionKey?: string
  readonly id: string
  readonly labelKey: string
  readonly order: number
}

function shortcutMetadataEntries(): ReadonlyArray<
  readonly [DisplayedShortcutID, ShortcutMetadata]
> {
  // SAFETY: SHORTCUT_METADATA is an exhaustive record whose own keys are DisplayedShortcutID values.
  return Object.entries(SHORTCUT_METADATA) as Array<[DisplayedShortcutID, ShortcutMetadata]>
}

function buildShortcutRows(
  group: ShortcutGroupID,
  browserAvailable: boolean,
  desktop: boolean,
): ReadonlyArray<ShortcutRowDefinition> {
  const rows = new Map<
    string,
    {
      commands: DisplayedShortcutID[]
      descriptionKey?: string
      labelKey: string
      order: number
    }
  >()

  for (const [command, metadata] of shortcutMetadataEntries()) {
    if (metadata.group !== group) continue
    if (command === "browser.newTab" && !browserAvailable) continue
    if (command === "bench.closeTab" && !desktop) continue
    const existing = rows.get(metadata.rowID)
    if (existing) {
      existing.commands.push(command)
      continue
    }
    rows.set(metadata.rowID, {
      commands: [command],
      descriptionKey: metadata.descriptionKey,
      labelKey: metadata.labelKey,
      order: metadata.order,
    })
  }

  return [...rows.entries()]
    .map(([id, row]) => ({
      commands: row.commands,
      descriptionKey: row.descriptionKey,
      id,
      labelKey: row.labelKey,
      order: row.order,
    }))
    .toSorted((left, right) => left.order - right.order)
}

function ShortcutKeyGroup(props: {
  command: DisplayedShortcutID
  platform: "mac" | "windows" | "linux"
}) {
  return (
    <KbdGroup aria-hidden>
      {formatShortcutTokens(DISPLAYED_SHORTCUTS[props.command], props.platform).map((token) => (
        <Kbd key={token}>{token}</Kbd>
      ))}
    </KbdGroup>
  )
}

function ShortcutKeys(props: {
  action: string
  commands: ReadonlyArray<DisplayedShortcutID>
  platform: "mac" | "windows" | "linux"
}) {
  const first = props.commands.at(0)
  if (!first) return null
  const last = props.commands.at(-1)
  if (!last) return null
  const firstSpoken = formatForDisplay(DISPLAYED_SHORTCUTS[first], {
    platform: props.platform,
    useSymbols: false,
  })
  const lastSpoken = formatForDisplay(DISPLAYED_SHORTCUTS[last], {
    platform: props.platform,
    useSymbols: false,
  })
  const spokenKeys =
    first === last
      ? firstSpoken
      : language.t("settings.shortcuts.keyRange", {
          first: firstSpoken,
          last: lastSpoken,
        })
  const accessibleLabel = language.t("settings.shortcuts.keysAria", {
    action: props.action,
    keys: spokenKeys,
  })

  if (first === last) {
    return (
      <span
        role="group"
        aria-label={accessibleLabel}
        data-shortcut-commands={props.commands.join(" ")}
      >
        <ShortcutKeyGroup command={first} platform={props.platform} />
      </span>
    )
  }

  return (
    <span
      role="group"
      aria-label={accessibleLabel}
      data-shortcut-commands={props.commands.join(" ")}
      className="inline-flex items-center gap-1.5"
    >
      <ShortcutKeyGroup command={first} platform={props.platform} />
      <span aria-hidden className="text-xs text-text-weaker">
        –
      </span>
      <ShortcutKeyGroup command={last} platform={props.platform} />
    </span>
  )
}

/** Displays every application shortcut using Buddy's settings primitives. */
export function ShortcutsSettings() {
  const runtimePlatform = usePlatform()
  const displayPlatform = shortcutDisplayPlatform(runtimePlatform.os)
  const browserAvailable = runtimePlatform.inAppBrowser !== undefined
  const descriptionKey =
    runtimePlatform.platform === "web"
      ? "settings.shortcuts.webDescription"
      : "settings.shortcuts.description"

  return (
    <SettingsContent>
      <p className="px-1 text-xs text-text-weak">{language.t(descriptionKey)}</p>
      {SHORTCUT_GROUPS.map((group) => (
        <SettingsSection key={group.id} title={language.t(group.titleKey)}>
          {buildShortcutRows(
            group.id,
            browserAvailable,
            runtimePlatform.platform === "desktop",
          ).map((row) => {
            const title = language.t(row.labelKey)
            return (
              <SettingsRow
                key={row.id}
                title={title}
                description={row.descriptionKey ? language.t(row.descriptionKey) : undefined}
                control={
                  <ShortcutKeys action={title} commands={row.commands} platform={displayPlatform} />
                }
              />
            )
          })}
        </SettingsSection>
      ))}
    </SettingsContent>
  )
}
