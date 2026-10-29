export type ReferenceSource =
  | {
      readonly type: "local"
      readonly path: string
      readonly description?: string
      readonly hidden?: boolean
    }
  | {
      readonly type: "git"
      readonly repository: string
      readonly branch?: string
      readonly description?: string
      readonly hidden?: boolean
    }

export type ReferenceInfo = {
  readonly name: string
  readonly path: string
  readonly description?: string
  readonly hidden?: boolean
  readonly source: ReferenceSource
}

export interface References {
  list(directory: string): Promise<ReferenceInfo[]>
}
