export interface ToolState {
  status: "pending" | "running" | "completed" | "error"
  input: Record<string, unknown>
  metadata: Record<string, unknown>
  attachments: ToolAttachment[]
  start?: number
  end?: number
  output?: string
  error?: string
  title?: string
}

export interface ToolAttachment {
  id: string
  mime: string
  url: string
  filename?: string
}

export interface ToolInfo {
  title: string
  subtitle?: string
  detail?: string
  summary?: string
  args?: string[]
}

export interface ToolDiagnostic {
  range: {
    start: {
      line: number
      character: number
    }
  }
  message: string
  severity?: number
}

export interface ToolQuestion {
  question: string
}

export interface ApplyPatchFile {
  filePath: string
  relativePath: string
  type: "add" | "update" | "delete" | "move"
  before: string
  after: string
  additions: number
  deletions: number
  movePath?: string
}

export interface RenderFigureToolOutput {
  figureID: string
  mime: "image/svg+xml"
  url: string
  alt: string
  caption?: string
  repairAttempts: number
}

export interface RenderMermaidToolOutput {
  artifactID: string
  artifactUrl: string
  source: string
  diagramType: string
  repairAttempts: number
  repairLog: string[]
  alt: string
  caption?: string
}
