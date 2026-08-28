import {
  Checkbox,
  RadioGroup,
  RadioGroupItem,
  Switch,
  ToggleGroup,
  ToggleGroupItem,
} from "@buddy/ui"
import {
  GalleryStory,
  GallerySection,
  Specimen,
  SpecimenGrid,
  SpecimenRow,
} from "./gallery-primitives"

export function SelectionControlsStory() {
  return (
    <GalleryStory>
      <GallerySection
        title="Switch"
        description="Off uses surface-inset-base; on uses surface-interactive-base. The off state is the one that has to hold up against every backdrop."
      >
        <div className="rounded-lg border border-border-weaker-base/70 px-3">
          <SpecimenRow label="Default">
            <Switch aria-label="Switch off" />
            <Switch defaultChecked aria-label="Switch on" />
            <Switch disabled aria-label="Switch disabled off" />
            <Switch disabled defaultChecked aria-label="Switch disabled on" />
          </SpecimenRow>
          <SpecimenRow label="Small">
            <Switch size="sm" aria-label="Small switch off" />
            <Switch size="sm" defaultChecked aria-label="Small switch on" />
            <Switch size="sm" disabled aria-label="Small switch disabled" />
          </SpecimenRow>
          <SpecimenRow label="Invalid">
            <Switch aria-invalid aria-label="Switch invalid off" />
            <Switch aria-invalid defaultChecked aria-label="Switch invalid on" />
          </SpecimenRow>
        </div>
      </GallerySection>

      <GallerySection
        title="Checkbox"
        description="Unchecked paints input-base, so it drifts with the same token as inputs and selects."
      >
        <div className="rounded-lg border border-border-weaker-base/70 px-3">
          <SpecimenRow label="States">
            <Checkbox aria-label="Checkbox off" />
            <Checkbox defaultChecked aria-label="Checkbox on" />
            <Checkbox disabled aria-label="Checkbox disabled off" />
            <Checkbox disabled defaultChecked aria-label="Checkbox disabled on" />
            <Checkbox aria-invalid aria-label="Checkbox invalid" />
          </SpecimenRow>
          <SpecimenRow label="With label">
            <label className="flex items-center gap-2 text-xs text-text-base">
              <Checkbox defaultChecked aria-label="Labelled checkbox" />
              Read entire book
            </label>
          </SpecimenRow>
        </div>
      </GallerySection>

      <GallerySection title="Radio group" description="Same unchecked surface as Checkbox.">
        <SpecimenGrid>
          <Specimen label="Rest">
            <RadioGroup defaultValue="steer" className="flex flex-col gap-2">
              <label className="flex items-center gap-2 text-xs text-text-base">
                <RadioGroupItem value="steer" aria-label="Steer" />
                Steer
              </label>
              <label className="flex items-center gap-2 text-xs text-text-base">
                <RadioGroupItem value="queue" aria-label="Queue" />
                Queue
              </label>
            </RadioGroup>
          </Specimen>
          <Specimen label="Disabled">
            <RadioGroup defaultValue="steer" disabled className="flex flex-col gap-2">
              <label className="flex items-center gap-2 text-xs text-text-base">
                <RadioGroupItem value="steer" aria-label="Steer disabled" />
                Steer
              </label>
              <label className="flex items-center gap-2 text-xs text-text-base">
                <RadioGroupItem value="queue" aria-label="Queue disabled" />
                Queue
              </label>
            </RadioGroup>
          </Specimen>
          <Specimen label="Invalid">
            <RadioGroup defaultValue="steer" className="flex flex-col gap-2">
              <label className="flex items-center gap-2 text-xs text-text-base">
                <RadioGroupItem value="steer" aria-invalid aria-label="Steer invalid" />
                Steer
              </label>
            </RadioGroup>
          </Specimen>
        </SpecimenGrid>
      </GallerySection>

      <GallerySection
        title="Toggle group"
        description="Segmented control. The active item is the state most often reported as ambiguous."
      >
        <div className="rounded-lg border border-border-weaker-base/70 px-3">
          <SpecimenRow label="Default">
            <ToggleGroup type="single" defaultValue="docked">
              <ToggleGroupItem value="docked" className="text-xs">
                Docked
              </ToggleGroupItem>
              <ToggleGroupItem value="floating" className="text-xs">
                Floating
              </ToggleGroupItem>
            </ToggleGroup>
          </SpecimenRow>
          <SpecimenRow label="Outline">
            <ToggleGroup type="single" variant="outline" defaultValue="docked">
              <ToggleGroupItem value="docked" className="text-xs">
                Docked
              </ToggleGroupItem>
              <ToggleGroupItem value="floating" className="text-xs">
                Floating
              </ToggleGroupItem>
            </ToggleGroup>
          </SpecimenRow>
          <SpecimenRow label="Small">
            <ToggleGroup type="single" size="sm" defaultValue="docked">
              <ToggleGroupItem value="docked" className="text-xs">
                Docked
              </ToggleGroupItem>
              <ToggleGroupItem value="floating" className="text-xs">
                Floating
              </ToggleGroupItem>
            </ToggleGroup>
          </SpecimenRow>
          <SpecimenRow label="Multiple">
            <ToggleGroup type="multiple" defaultValue={["bold"]}>
              <ToggleGroupItem value="bold" className="text-xs">
                Bold
              </ToggleGroupItem>
              <ToggleGroupItem value="italic" className="text-xs">
                Italic
              </ToggleGroupItem>
              <ToggleGroupItem value="underline" className="text-xs">
                Underline
              </ToggleGroupItem>
            </ToggleGroup>
          </SpecimenRow>
        </div>
      </GallerySection>

      <GallerySection
        title="Against a card"
        description="Settings rows put every selection control on surface-raised-base."
      >
        <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-border-base/50 bg-surface-raised-base p-4">
          <Switch defaultChecked aria-label="Card switch on" />
          <Switch aria-label="Card switch off" />
          <Checkbox defaultChecked aria-label="Card checkbox" />
          <Checkbox aria-label="Card checkbox off" />
          <ToggleGroup type="single" defaultValue="docked">
            <ToggleGroupItem value="docked" className="text-xs">
              Docked
            </ToggleGroupItem>
            <ToggleGroupItem value="floating" className="text-xs">
              Floating
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
      </GallerySection>
    </GalleryStory>
  )
}
