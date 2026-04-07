import type { SVGProps } from "react"

import { iconNames, providerSpriteUrl } from "@buddy/opencode-adapter/provider-icon"

const FALLBACK_PROVIDER_ICON_ID = "synthetic"

const PROVIDER_ICON_IDS = new Set<string>(iconNames)

export type TProviderIconProps = SVGProps<SVGSVGElement> & {
  id: string
}

export function ProviderIcon(props: TProviderIconProps) {
  const { id, ...rest } = props
  const resolved = PROVIDER_ICON_IDS.has(id) ? id : FALLBACK_PROVIDER_ICON_ID
  return (
    <svg data-component="provider-icon" {...rest}>
      <use href={`${providerSpriteUrl}#${resolved}`} />
    </svg>
  )
}
