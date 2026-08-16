type CatalogEntry<Value extends string> = {
  id: Value
}

export function findSelectValue<Value extends string>(
  value: string,
  values: readonly Value[],
): Value | undefined {
  return values.find((candidate) => candidate === value)
}

export function findCatalogID<Value extends string>(
  value: string,
  entries: readonly CatalogEntry<Value>[],
): Value | undefined {
  return entries.find((entry) => entry.id === value)?.id
}
