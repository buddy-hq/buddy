import { dict as enDict } from "./en"

export type Locale = "en"
type Dictionary = Record<string, string>

const dictionaries = new Map<Locale, Dictionary>([["en", enDict]])

let currentLocale: Locale = "en"

function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) => {
    const value = params[key]
    return value === undefined ? match : String(value)
  })
}

export function setLocale(locale: Locale) {
  currentLocale = locale
}

export function getLocale(): Locale {
  return currentLocale
}

export function t(key: string, params?: Record<string, string | number>): string {
  const fallbackDictionary = dictionaries.get("en")
  const dictionary = dictionaries.get(currentLocale) ?? fallbackDictionary
  const template = dictionary?.[key] ?? fallbackDictionary?.[key] ?? key
  return interpolate(template, params)
}
