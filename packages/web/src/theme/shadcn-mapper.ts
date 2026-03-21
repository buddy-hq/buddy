import type { ResolvedTheme } from './types'

/**
 * Maps vendor theme tokens to shadcn-compatible CSS variables
 * This bridges the vendor's semantic tokens with shadcn's CSS variable naming
 */
export function toShadcnCss(tokens: ResolvedTheme, isDark: boolean): string {
  const secondarySurface = isDark ? tokens['surface-raised-strong'] : tokens['surface-weak']
  const accentSurface = isDark
    ? (tokens['surface-strong'] ??
      tokens['surface-raised-stronger'] ??
      tokens['surface-raised-strong'])
    : tokens['surface-weak']

  const map: Record<string, string | undefined> = {
    // Background
    '--background': tokens['background-base'],
    '--foreground': tokens['text-base'],

    // Card/Popover surfaces
    '--card': tokens['surface-raised-base'],
    '--card-foreground': tokens['text-base'],
    '--popover': tokens['surface-raised-strong'],
    '--popover-foreground': tokens['text-base'],

    // Primary (interactive/brand)
    '--primary': tokens['surface-interactive-base'] || tokens['surface-brand-base'],
    '--primary-foreground': tokens['text-on-interactive-base'] || tokens['text-on-brand-base'],

    // Secondary/Muted/Accent (neutral surfaces)
    '--secondary': secondarySurface,
    '--secondary-foreground': tokens['text-base'],
    '--muted': tokens['surface-weak'],
    '--muted-foreground': tokens['text-weak'],
    '--accent': accentSurface,
    '--accent-foreground': tokens['text-strong'],

    // Destructive (error/critical)
    '--destructive': tokens['surface-critical-base'] || tokens['icon-critical-base'],
    '--destructive-foreground': tokens['text-on-critical-base'],

    // Border/Input/Ring
    '--border': tokens['border-base'],
    '--input': tokens['border-base'],
    '--ring': tokens['border-interactive-base'] || tokens['border-focus'],

    // Sidebar (use raised surfaces)
    '--sidebar': tokens['surface-raised-base'],
    '--sidebar-foreground': tokens['text-base'],
    '--sidebar-primary': tokens['surface-interactive-base'] || tokens['surface-brand-base'],
    '--sidebar-primary-foreground':
      tokens['text-on-interactive-base'] || tokens['text-on-brand-base'],
    '--sidebar-accent': accentSurface,
    '--sidebar-accent-foreground': tokens['text-strong'],
    '--sidebar-border': tokens['border-base'],
    '--sidebar-ring': tokens['border-interactive-base'],

    // Radius
    '--radius': '0.45rem',

    // Charts - use accent colors
    '--chart-1':
      tokens['surface-interactive-base'] ||
      tokens['surface-brand-base'] ||
      tokens['icon-interactive-base'],
    '--chart-2': tokens['surface-success-base'] || tokens['icon-success-base'],
    '--chart-3': tokens['surface-warning-base'] || tokens['icon-warning-base'],
    '--chart-4': tokens['surface-critical-base'] || tokens['icon-critical-base'],
    '--chart-5': tokens['surface-info-base'] || tokens['icon-info-base'],
  }

  return Object.entries(map)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}: ${value};`)
    .join('\n  ')
}
