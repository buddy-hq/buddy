import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react"
import { getLocale, setLocale as applyLocale, t as translate, type Locale } from "@/i18n"
import { browserDocument } from "@/state/parse-external"

type TranslationParams = Record<string, string | number>

type LanguageContextValue = {
  locale: Locale
  locales: readonly Locale[]
  t(key: string, params?: TranslationParams): string
  setLocale(locale: Locale): void
}

const LOCALES: readonly Locale[] = ["en"]

const LanguageContext = createContext<LanguageContextValue>({
  locale: "en",
  locales: LOCALES,
  t: translate,
  setLocale(locale) {
    applyLocale(locale)
  },
})

export const language = {
  t: translate,
}

export function LanguageProvider(props: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => getLocale())

  useEffect(() => {
    const documentNode = browserDocument()
    if (documentNode === undefined) return
    documentNode.documentElement.lang = locale
  }, [locale])

  const value = useMemo<LanguageContextValue>(
    () => ({
      locale,
      locales: LOCALES,
      t: translate,
      setLocale(next) {
        applyLocale(next)
        setLocaleState(next)
      },
    }),
    [locale],
  )

  return <LanguageContext.Provider value={value}>{props.children}</LanguageContext.Provider>
}

export function useLanguage() {
  return useContext(LanguageContext)
}
