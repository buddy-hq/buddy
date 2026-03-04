function splitRequired(source: string, delimiter: string): [string, string] {
  const index = source.indexOf(delimiter)
  if (index < 0) {
    throw new Error(`Prompt delimiter not found: ${delimiter}`)
  }

  return [source.slice(0, index), source.slice(index + delimiter.length)]
}

function splitLines(source: string): string[] {
  return source.split("\n")
}

export {
  splitLines,
  splitRequired,
}
