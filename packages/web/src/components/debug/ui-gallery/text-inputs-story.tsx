import { useRef } from "react"
import { Input, Textarea } from "@buddy/ui"
import { GalleryStory, GallerySection, Specimen, SpecimenGrid } from "./gallery-primitives"

export function TextInputsStory() {
  const focusRef = useRef<HTMLInputElement>(null)

  return (
    <GalleryStory>
      <GallerySection
        title="Input · states"
        description="Hover and focus are live — put the pointer on a specimen. The hover specimen also paints bg-input-hover directly so the target color stays readable without hovering."
      >
        <SpecimenGrid>
          <Specimen label="Rest">
            <Input className="h-8 text-xs" defaultValue="Rest" aria-label="Rest" />
          </Specimen>
          <Specimen label="Placeholder">
            <Input className="h-8 text-xs" placeholder="Placeholder" aria-label="Placeholder" />
          </Specimen>
          <Specimen label="Hover" note="bg-input-hover applied">
            <Input className="h-8 bg-input-hover text-xs" defaultValue="Hover" aria-label="Hover" />
          </Specimen>
          <Specimen label="Focus" note="click to focus">
            <Input
              ref={focusRef}
              className="h-8 text-xs"
              defaultValue="Focus me"
              aria-label="Focus"
            />
          </Specimen>
          <Specimen label="Disabled">
            <Input className="h-8 text-xs" defaultValue="Disabled" disabled aria-label="Disabled" />
          </Specimen>
          <Specimen label="Read only">
            <Input
              className="h-8 text-xs"
              defaultValue="Read only"
              readOnly
              aria-label="Read only"
            />
          </Specimen>
          <Specimen label="Invalid">
            <Input
              className="h-8 text-xs"
              defaultValue="Invalid"
              aria-invalid
              aria-label="Invalid"
            />
          </Specimen>
          <Specimen label="Number" note="settings font size row">
            <Input
              type="number"
              className="h-8 w-20 text-right text-xs tabular-nums"
              defaultValue={14}
              aria-label="Number"
            />
          </Specimen>
        </SpecimenGrid>
      </GallerySection>

      <GallerySection title="Input · sizes" description="Heights in use across the app today.">
        <SpecimenGrid>
          <Specimen label="h-8" note="settings rows, devtools">
            <Input className="h-8 text-xs" defaultValue="Compact" aria-label="Compact" />
          </Specimen>
          <Specimen label="h-9" note="component default">
            <Input defaultValue="Default" aria-label="Default" />
          </Specimen>
        </SpecimenGrid>
      </GallerySection>

      <GallerySection
        title="Textarea"
        description="Auto-sizing via field-sizing-content, so a specimen grows with its value."
      >
        <SpecimenGrid>
          <Specimen label="Rest">
            <Textarea className="text-xs" defaultValue="Rest" aria-label="Textarea rest" />
          </Specimen>
          <Specimen label="Placeholder">
            <Textarea className="text-xs" placeholder="Placeholder" aria-label="Textarea empty" />
          </Specimen>
          <Specimen label="Disabled">
            <Textarea
              className="text-xs"
              defaultValue="Disabled"
              disabled
              aria-label="Textarea disabled"
            />
          </Specimen>
          <Specimen label="Invalid">
            <Textarea
              className="text-xs"
              defaultValue="Invalid"
              aria-invalid
              aria-label="Textarea invalid"
            />
          </Specimen>
        </SpecimenGrid>
      </GallerySection>

      <GallerySection
        title="Against a card"
        description="The same controls on surface-raised-base regardless of the gallery backdrop — this is the pairing Settings actually ships."
      >
        <div className="rounded-2xl border border-border-base/50 bg-surface-raised-base p-4">
          <div className="flex flex-wrap items-center gap-3">
            <Input className="h-8 w-36 text-xs" defaultValue="On a card" aria-label="On a card" />
            <Input
              className="h-8 w-20 text-right text-xs tabular-nums"
              defaultValue={13}
              aria-label="On a card number"
            />
            <Textarea
              className="w-48 text-xs"
              defaultValue="On a card"
              aria-label="Textarea on a card"
            />
          </div>
        </div>
      </GallerySection>
    </GalleryStory>
  )
}
