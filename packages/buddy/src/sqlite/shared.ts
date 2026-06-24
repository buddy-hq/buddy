export type SQLInputValue = null | number | bigint | string | Uint8Array

export type DatabaseOptions = {
  create?: boolean
  readonly?: boolean
  readwrite?: boolean
  strict?: boolean
}

export type RunResult = {
  changes: number
  lastInsertRowid: number | bigint
}

export type Statement<TRow> = {
  all(...params: SQLInputValue[]): TRow[]
  get(...params: SQLInputValue[]): TRow | null
  run(...params: SQLInputValue[]): RunResult
}
