import type { PresentedMediaItem } from "@/lib/presented-media"

export type PresentMediaResolvedItem = PresentedMediaItem & {
  resolvedAvailability: PresentedMediaItem["availability"]
  availabilityChecked: boolean
}
