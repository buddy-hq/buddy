import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import type { CSSProperties } from "react"

type CSSVariableProperties = {
  [name: `--${string}`]: string | number | undefined
}

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function cssVariables(properties: CSSProperties & CSSVariableProperties): CSSProperties {
  // SAFETY: CSS custom properties are valid React style entries even though CSSProperties omits them.
  return properties as CSSProperties
}
