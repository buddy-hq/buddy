import { APP_SHORTCUTS } from "@buddy/browser-contract"
import { Kbd, KbdGroup } from "@buddy/ui/components/ui/kbd"
import { detectPlatform, formatForDisplay } from "@tanstack/react-hotkeys"
import { language } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { SHORTCUTS } from "@/lib/shortcuts"
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
  "chat.jump.1": {
    group: "chats",
    labelKey: "settings.shortcuts.chatByPosition",
    order: 3,
    rowID: "chat.jump",
  },
  "chat.jump.2": {
    group: "chats",
    labelKey: "settings.shortcuts.chatByPosition",
    order: 3,
    rowID: "chat.jump",
  },
  "chat.jump.3": {
    group: "chats",
    labelKey: "settings.shortcuts.chatByPosition",
    order: 3,
    rowID: "chat.jump",
  },
  "chat.jump.4": {
    group: "chats",
    labelKey: "settings.shortcuts.chatByPosition",
    order: 3,
    rowID: "chat.jump",
  },
  "chat.jump.5": {
    group: "chats",
    labelKey: "settings.shortcuts.chatByPosition",
    order: 3,
    rowID: "chat.jump",
  },
  "chat.jump.6": {
    group: "chats",
    labelKey: "settings.shortcuts.chatByPosition",
    order: 3,
    rowID: "chat.jump",
  },
  "chat.jump.7": {
    group: "chats",
    labelKey: "settings.shortcuts.chatByPosition",
    order: 3,
    rowID: "chat.jump",
  },
  "chat.jump.8": {
    group: "chats",
    labelKey: "settings.shortcuts.chatByPosition",
    order: 3,
    rowID: "chat.jump",
  },
  "chat.jump.9": {
    group: "chats",
    labelKey: "settings.shortcuts.chatByPosition",
    order: 3,
    rowID: "chat.jump",
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
  "sidebar.toggle": {
    group: "navigation",
    labelKey: "settings.shortcuts.toggleSidebar",
    order: 2,
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

function shortcutDisplayPlatform(os: "macos" | "windows" | "linux" | undefined) {
  if (os === "macos") return "mac" as const
  if (os === "windows") return "windows" as const
  if (os === "linux") return "linux" as const
  return detectPlatform()
}

function shortcutDisplayTokens(
  command: DisplayedShortcutID,
  platform: "mac" | "windows" | "linux",
) {
  return formatForDisplay(DISPLAYED_SHORTCUTS[command], {
    platform,
    separatorToken: "\u0000",
  }).split("\u0000")
}

function ShortcutKeyGroup(props: {
  command: DisplayedShortcutID
  platform: "mac" | "windows" | "linux"
}) {
  return (
    <KbdGroup aria-hidden>
      {shortcutDisplayTokens(props.command, props.platform).map((token) => (
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
          {buildShortcutRows(group.id, browserAvailable).map((row) => {
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
