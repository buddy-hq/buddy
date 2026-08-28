import {
  NativeSelect,
  NativeSelectOption,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@buddy/ui"
import { GalleryStory, GallerySection, Specimen, SpecimenGrid } from "./gallery-primitives"

const THEME_OPTIONS = ["Dracula", "Catppuccin", "Ayu", "Carbonfox", "Cobalt2"]

function SampleSelect(props: {
  size?: "sm" | "default"
  placeholder?: boolean
  disabled?: boolean
  invalid?: boolean
  className?: string
}) {
  return (
    <Select defaultValue={props.placeholder ? undefined : "dracula"} disabled={props.disabled}>
      <SelectTrigger
        size={props.size ?? "default"}
        aria-invalid={props.invalid}
        aria-label="Theme"
        className={props.className ?? "w-full text-xs"}
      >
        <SelectValue placeholder="Select theme" />
      </SelectTrigger>
      <SelectContent>
        {THEME_OPTIONS.map((option) => (
          <SelectItem key={option} value={option.toLowerCase()}>
            {option}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export function SelectStory() {
  return (
    <GalleryStory>
      <GallerySection
        title="Select · states"
        description="Radix Select trigger. Open one to check the menu surface against the trigger it came from."
      >
        <SpecimenGrid>
          <Specimen label="Rest">
            <SampleSelect />
          </Specimen>
          <Specimen label="Placeholder">
            <SampleSelect placeholder />
          </Specimen>
          <Specimen label="Hover" note="bg-input-hover applied">
            <SampleSelect className="w-full bg-input-hover text-xs" />
          </Specimen>
          <Specimen label="Disabled">
            <SampleSelect disabled />
          </Specimen>
          <Specimen label="Invalid">
            <SampleSelect invalid />
          </Specimen>
          <Specimen label="Small" note="size=sm, h-7">
            <SampleSelect size="sm" />
          </Specimen>
        </SpecimenGrid>
      </GallerySection>

      <GallerySection
        title="Select · content"
        description="Groups, labels and separators inside the menu. The menu paints surface-raised-stronger-non-alpha, so it should read above whatever surface the trigger sits on."
      >
        <SpecimenGrid>
          <Specimen label="Grouped">
            <Select defaultValue="dracula">
              <SelectTrigger size="sm" className="w-full text-xs" aria-label="Grouped theme">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>Dark</SelectLabel>
                  <SelectItem value="dracula">Dracula</SelectItem>
                  <SelectItem value="carbonfox">Carbonfox</SelectItem>
                </SelectGroup>
                <SelectSeparator />
                <SelectGroup>
                  <SelectLabel>Light</SelectLabel>
                  <SelectItem value="ayu">Ayu</SelectItem>
                  <SelectItem value="cobalt2">Cobalt2</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </Specimen>
          <Specimen label="Popper" note="position=popper">
            <Select defaultValue="dracula">
              <SelectTrigger size="sm" className="w-full text-xs" aria-label="Popper theme">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper">
                {THEME_OPTIONS.map((option) => (
                  <SelectItem key={option} value={option.toLowerCase()}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Specimen>
          <Specimen label="Long list" note="scrolls">
            <Select defaultValue="theme-0">
              <SelectTrigger size="sm" className="w-full text-xs" aria-label="Long theme list">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 24 }, (_, index) => (
                  <SelectItem key={index} value={`theme-${index}`}>
                    {`Theme ${index + 1}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Specimen>
        </SpecimenGrid>
      </GallerySection>

      <GallerySection
        title="Native select"
        description="Shares input-base and input-hover with the Radix trigger, so the two must stay visually identical at rest."
      >
        <SpecimenGrid>
          <Specimen label="Rest">
            <NativeSelect defaultValue="dracula" className="text-xs" aria-label="Native rest">
              {THEME_OPTIONS.map((option) => (
                <NativeSelectOption key={option} value={option.toLowerCase()}>
                  {option}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Specimen>
          <Specimen label="Small" note="size=sm">
            <NativeSelect
              size="sm"
              defaultValue="dracula"
              className="text-xs"
              aria-label="Native small"
            >
              {THEME_OPTIONS.map((option) => (
                <NativeSelectOption key={option} value={option.toLowerCase()}>
                  {option}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Specimen>
          <Specimen label="Disabled">
            <NativeSelect
              disabled
              defaultValue="dracula"
              className="text-xs"
              aria-label="Native disabled"
            >
              <NativeSelectOption value="dracula">Dracula</NativeSelectOption>
            </NativeSelect>
          </Specimen>
          <Specimen label="Invalid">
            <NativeSelect
              aria-invalid
              defaultValue="dracula"
              className="text-xs"
              aria-label="Native invalid"
            >
              <NativeSelectOption value="dracula">Dracula</NativeSelectOption>
            </NativeSelect>
          </Specimen>
        </SpecimenGrid>
      </GallerySection>

      <GallerySection
        title="Against a card"
        description="Radix and native triggers side by side on surface-raised-base — the Settings pairing."
      >
        <div className="rounded-2xl border border-border-base/50 bg-surface-raised-base p-4">
          <div className="flex flex-wrap items-center gap-3">
            <SampleSelect className="w-40 text-xs" />
            <NativeSelect defaultValue="dracula" className="text-xs" aria-label="Native on a card">
              {THEME_OPTIONS.map((option) => (
                <NativeSelectOption key={option} value={option.toLowerCase()}>
                  {option}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
        </div>
      </GallerySection>
    </GalleryStory>
  )
}
