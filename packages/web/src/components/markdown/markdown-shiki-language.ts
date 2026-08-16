import { bundledLanguages, type BundledLanguage } from "shiki"

export function resolveBundledShikiLanguage(language: string): BundledLanguage | undefined {
  return isBundledShikiLanguage(language) ? language : undefined
}

function isBundledShikiLanguage(language: string): language is BundledLanguage {
  return language in bundledLanguages
}
