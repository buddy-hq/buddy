import { useState } from "react"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
  Z_INDEX,
} from "@buddy/ui"
import { ProviderIcon } from "@/components/provider-icon"
import { DEFAULT_MODEL_KEY, MODELS, MODEL_BY_KEY, PROVIDERS } from "./catalog"
import { VariantSection } from "./shared"
import { SpotlightVariant } from "./variant-spotlight"
import { ProviderRailVariant } from "./variant-provider-rail"
import { FamilyRoutesVariant } from "./variant-family-routes"
import { InlineComboboxVariant } from "./variant-inline-combobox"
import { GhostAutocompleteVariant } from "./variant-ghost-autocomplete"
import { QuickSwapVariant } from "./variant-quick-swap"
import { PinnedShelfVariant } from "./variant-pinned-shelf"
import { AliasesVariant } from "./variant-aliases"
import { ModelShortcutsVariant } from "./variant-model-shortcuts"
import { SlashModelsVariant } from "./variant-slash-models"
import { CyclePinsVariant } from "./variant-cycle-pins"

/** SelectContent defaults below the DevTools panel; portaled menus here need the devtools layer. */
const DEVTOOLS_MENU_STYLE = { zIndex: Z_INDEX.devtoolsFloating }

/** Today's composer selector, reproduced with the sample catalog for comparison. */
function CurrentSelector() {
  const [value, setValue] = useState(DEFAULT_MODEL_KEY)
  return (
    <div className="composer-surface composer-grain relative w-[34rem] max-w-full">
      <div className="px-4 pt-3 pb-1 text-sm text-text-weaker">Ask Buddy anything…</div>
      <div className="flex items-center gap-1 px-2 py-2">
        <Select value={value} onValueChange={setValue}>
          <SelectTrigger
            type="button"
            size="sm"
            className="h-7 max-w-[180px] min-w-0 border-0 bg-transparent px-2 text-xs text-text-weaker shadow-none hover:bg-surface-raised-base-hover [&_svg]:text-inherit [&_svg:last-child]:size-3"
          >
            <SelectValue>{MODEL_BY_KEY.get(value)?.name}</SelectValue>
          </SelectTrigger>
          <SelectContent
            side="top"
            align="start"
            position="popper"
            sideOffset={6}
            style={DEVTOOLS_MENU_STYLE}
            className="composer-surface-menu composer-grain w-[min(22rem,calc(100vw-2rem))] max-h-[min(28rem,calc(100vh-8rem))]"
          >
            {PROVIDERS.map((provider) => (
              <SelectGroup key={provider.id}>
                <SelectLabel>{provider.name}</SelectLabel>
                {MODELS.filter((model) => model.providerID === provider.id).map((model) => (
                  <SelectItem key={model.key} value={model.key}>
                    <span className="flex min-w-0 items-center gap-2">
                      <ProviderIcon
                        id={provider.id}
                        className="size-4 shrink-0 opacity-60"
                        aria-hidden="true"
                      />
                      <span className="min-w-0 flex-1 truncate">{model.name}</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}

export function ModelSelectorVariantsEasel() {
  return (
    <div className="flex h-full min-h-0 w-full flex-col gap-8 overflow-y-auto bg-background-base p-8 pb-24">
      <header className="flex max-w-3xl flex-col gap-1">
        <h1 className="text-lg font-semibold text-text-strong">
          Model selector · eleven directions
        </h1>
        <p className="text-xs text-text-weak">
          Every direction is searchable and shows only what you need to recognise a model: its name
          and who provides it. Same-named models stay apart; Claude Sonnet 5 is offered here by
          Anthropic, OpenRouter and GitHub Copilot. 01–06 are ways to find a model; 07–11 are ways
          to make it yours with pins, your own names and shortcuts.
        </p>
      </header>

      <VariantSection
        number="00"
        title="Today"
        concept="Radix Select grouped by provider. You can't search it, the button cuts the name off, and provider icons are dimmed."
        identify="only the group headers. Once closed, the button can't tell Anthropic's Sonnet 5 from Copilot's."
      >
        <CurrentSelector />
      </VariantSection>

      <VariantSection
        number="01"
        title="Spotlight — search first"
        concept="A search box sits at the top of the menu, ready for typing. Without a query the list is grouped by provider; with one, results are ranked and matching letters are highlighted."
        identify="search results add the provider under each name; the button adds it when a name is shared."
      >
        <SpotlightVariant />
      </VariantSection>

      <VariantSection
        number="02"
        title="Provider rail — browse, then narrow"
        concept="Providers down the left, models on the right. Search runs across all of them, and each provider's count updates as you type."
        identify="you pick the provider first, so a Sonnet 5 row is never ambiguous."
      >
        <ProviderRailVariant />
      </VariantSection>

      <VariantSection
        number="03"
        title="Model first, then provider"
        concept="One row per model. Every provider offering it is a chip on that row, so you choose the model, then the provider. ← → moves between chips."
        identify="duplicate names fold into one row, and choosing a provider is its own step."
      >
        <FamilyRoutesVariant />
      </VariantSection>

      <VariantSection
        number="04"
        title="Type in the toolbar — pins and recents"
        concept="The model button turns into the search box. Before you type, the menu shows Pinned, then Recent, then everything else. Type @copilot to search one provider; pin from any row."
        identify="the provider is written on the right of every row."
      >
        <InlineComboboxVariant />
      </VariantSection>

      <VariantSection
        number="05"
        title="Type-ahead suggestion"
        concept="No menu at all. Type on the model name; the rest of the best match appears in grey, like a browser address bar. Tab or Enter takes it."
        identify="the provider icon changes to match the suggestion, and shared names get the provider added."
      >
        <GhostAutocompleteVariant />
      </VariantSection>

      <VariantSection
        number="06"
        title="Quick swap"
        concept="Recent models sit beside the current one as one-tap buttons; the search button opens the full list. The model you switch away from becomes a button."
        identify="provider icons on every button; hover shows the full name and provider."
      >
        <QuickSwapVariant />
      </VariantSection>

      <VariantSection
        number="07"
        title="Pinned only"
        concept="The menu is just your pinned models, numbered: press 1–9 to pick one. Reorder pins with the up arrow. “Browse all models” (or simply typing) brings in everything else, where one tap pins a model."
        identify="each pin shows its provider; the numbers give every pin a permanent place."
      >
        <PinnedShelfVariant />
      </VariantSection>

      <VariantSection
        number="08"
        title="Your own names"
        concept="Name models after how you use them: Tutor, Work, Quick, Offline. Your name comes first everywhere, including the button, with the real model underneath. Search finds both. Names can't repeat."
        identify="Tutor and Work can be the same model from different providers, and you never mix them up."
      >
        <AliasesVariant />
      </VariantSection>

      <VariantSection
        number="09"
        title="A shortcut per model"
        concept={`Give a model a key, then press ⌥ (Alt on Windows) plus that key while typing to switch, without opening anything. Click “Set shortcut” and press a letter or number; if another model has that key, it moves to this one.`}
        identify="the button shows the current model's shortcut, and a short confirmation names the model you switched to."
      >
        <ModelShortcutsVariant />
      </VariantSection>

      <VariantSection
        number="10"
        title="Models as slash commands"
        concept="Type /tutor or /quick in the message itself to use that model for this one message. The default stays put; a chip shows the override until you send."
        identify="your own names become the commands; other models get the provider added to the command when names are shared."
      >
        <SlashModelsVariant />
      </VariantSection>

      <VariantSection
        number="11"
        title="Rotate through pins"
        concept="Clicking the model name moves to the next pinned model, like switching keyboard languages; ⌥] and ⌥[ (Alt on Windows) do the same from the keyboard. The arrow opens a searchable list to choose what's in the rotation."
        identify="the rotation strip shows every pin with its provider icon and highlights where you are."
      >
        <CyclePinsVariant />
      </VariantSection>
    </div>
  )
}
