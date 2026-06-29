const DEFAULT_CURRENCY = "USD"

export type DevToolsTokenValue = {
  value: number
  estimated: boolean
}

export type DevToolsRowTokenSummary = {
  input?: DevToolsTokenValue
  output?: DevToolsTokenValue
}

function formatNumberValue(formatter: Intl.NumberFormat, value: number | null | undefined) {
  if (value === undefined || value === null) return "—"
  return formatter.format(value)
}

export function createDevToolsContextFormatter(locale?: string) {
  const numberFormatter = new Intl.NumberFormat(locale)
  const currencyFormatter = new Intl.NumberFormat(locale, {
    style: "currency",
    currency: DEFAULT_CURRENCY,
  })
  const timeFormatter = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  })

  return {
    number(value: number | null | undefined) {
      return formatNumberValue(numberFormatter, value)
    },
    percent(value: number | null | undefined) {
      const formatted = formatNumberValue(numberFormatter, value)
      return formatted === "—" ? formatted : `${formatted}%`
    },
    currency(value: number | null | undefined) {
      if (value === undefined || value === null) return "—"
      return currencyFormatter.format(value)
    },
    time(value: number | null | undefined) {
      if (!value) return "—"
      return timeFormatter.format(new Date(value))
    },
    token(value: DevToolsTokenValue | undefined) {
      if (!value) return "—"
      return numberFormatter.format(value.value)
    },
  }
}
