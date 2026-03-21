import { describe, expect, test } from 'bun:test'
import { defaultThemes } from '../src/theme/default-themes'
import { resolveThemeVariant } from '../src/theme/resolve'
import { toShadcnCss } from '../src/theme/shadcn-mapper'

function cssValue(css: string, key: string) {
  const match = css.match(new RegExp(`${key}:\\s*([^;]+);`))
  return match?.[1]
}

describe('toShadcnCss', () => {
  test('maps dark control surfaces to visible shadcn neutrals', () => {
    const tokens = resolveThemeVariant(defaultThemes['oc-2'].dark, true)
    const css = toShadcnCss(tokens, true)

    expect(cssValue(css, '--foreground')).toBe(tokens['text-base'])
    expect(cssValue(css, '--card-foreground')).toBe(tokens['text-base'])
    expect(cssValue(css, '--popover-foreground')).toBe(tokens['text-base'])
    expect(cssValue(css, '--secondary')).toBe(tokens['surface-raised-strong'])
    expect(cssValue(css, '--secondary-foreground')).toBe(tokens['text-base'])
    expect(cssValue(css, '--accent')).toBe(tokens['surface-strong'])
    expect(cssValue(css, '--accent-foreground')).toBe(tokens['text-strong'])
    expect(cssValue(css, '--sidebar-foreground')).toBe(tokens['text-base'])
    expect(cssValue(css, '--input')).toBe(tokens['border-base'])
    expect(cssValue(css, '--accent')).not.toBe(cssValue(css, '--popover'))
  })

  test('keeps light control surfaces on the softer neutral step', () => {
    const tokens = resolveThemeVariant(defaultThemes['oc-2'].light, false)
    const css = toShadcnCss(tokens, false)

    expect(cssValue(css, '--secondary')).toBe(tokens['surface-weak'])
    expect(cssValue(css, '--accent')).toBe(tokens['surface-weak'])
    expect(cssValue(css, '--input')).toBe(tokens['border-base'])
  })
})
