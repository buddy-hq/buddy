import { Badge, Button, PlusIcon, Spinner } from "@buddy/ui"
import { GalleryStory, GallerySection, SpecimenRow } from "./gallery-primitives"

const BUTTON_VARIANTS = [
  "default",
  "secondary",
  "outline",
  "ghost",
  "destructive",
  "link",
] as const

const BUTTON_SIZES = ["xs", "sm", "default", "lg"] as const
const ICON_SIZES = ["icon-xs", "icon-sm", "icon", "icon-lg"] as const
const BADGE_VARIANTS = [
  "default",
  "secondary",
  "outline",
  "ghost",
  "destructive",
  "link",
] as const

export function ButtonsStory() {
  return (
    <GalleryStory>
      <GallerySection
        title="Button · variant × size"
        description="Outline paints bg-background-base, so on a raised backdrop it reads as a hole rather than a button — the same class of mismatch as the input tokens."
      >
        <div className="rounded-lg border border-border-weaker-base/70 px-3">
          {BUTTON_VARIANTS.map((variant) => (
            <SpecimenRow key={variant} label={variant}>
              {BUTTON_SIZES.map((size) => (
                <Button key={size} variant={variant} size={size}>
                  {size}
                </Button>
              ))}
            </SpecimenRow>
          ))}
        </div>
      </GallerySection>

      <GallerySection title="Button · states">
        <div className="rounded-lg border border-border-weaker-base/70 px-3">
          <SpecimenRow label="Disabled">
            {BUTTON_VARIANTS.map((variant) => (
              <Button key={variant} variant={variant} size="sm" disabled>
                {variant}
              </Button>
            ))}
          </SpecimenRow>
          <SpecimenRow label="With icon">
            {BUTTON_VARIANTS.map((variant) => (
              <Button key={variant} variant={variant} size="sm">
                <PlusIcon className="size-3.5" />
                {variant}
              </Button>
            ))}
          </SpecimenRow>
          <SpecimenRow label="Loading">
            <Button size="sm" disabled>
              <Spinner className="size-3.5" />
              Saving
            </Button>
            <Button size="sm" variant="secondary" disabled>
              <Spinner className="size-3.5" />
              Saving
            </Button>
            <Button size="sm" variant="outline" disabled>
              <Spinner className="size-3.5" />
              Saving
            </Button>
          </SpecimenRow>
          <SpecimenRow label="Icon only">
            {ICON_SIZES.map((size) => (
              <Button key={size} size={size} variant="ghost" aria-label={`Add ${size}`}>
                <PlusIcon />
              </Button>
            ))}
          </SpecimenRow>
        </div>
      </GallerySection>

      <GallerySection title="Badge">
        <div className="rounded-lg border border-border-weaker-base/70 px-3">
          <SpecimenRow label="Variants">
            {BADGE_VARIANTS.map((variant) => (
              <Badge key={variant} variant={variant}>
                {variant}
              </Badge>
            ))}
          </SpecimenRow>
          <SpecimenRow label="In context">
            <Badge variant="outline" className="h-5">
              Experimental
            </Badge>
            <Badge variant="outline" className="h-5">
              Global
            </Badge>
            <Badge variant="secondary">Beta</Badge>
          </SpecimenRow>
        </div>
      </GallerySection>

      <GallerySection
        title="Against a card"
        description="Watch outline and ghost here — both derive from page-level tokens."
      >
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border-base/50 bg-surface-raised-base p-4">
          {BUTTON_VARIANTS.map((variant) => (
            <Button key={variant} variant={variant} size="sm">
              {variant}
            </Button>
          ))}
        </div>
      </GallerySection>
    </GalleryStory>
  )
}
