import "ketcher-react/dist/index.css"

import { Button } from "@buddy/ui"
import type { Ketcher } from "ketcher-core"
import { Editor } from "ketcher-react"
import { StandaloneStructServiceProvider } from "ketcher-standalone"
import { useCallback, useEffect, useRef, useState, type ReactElement } from "react"
import type { KetcherChemistryFormat } from "@/components/bench/markdown-bench-chemistry-formats"

type MarkdownBenchKetcherEditorProps = {
  format: KetcherChemistryFormat
  source: string
  onCancel(): void
  onSave(source: string): void
}

const KETCHER_EDITOR_VIEWPORT_CLASS_NAME = "h-[min(42rem,72vh)] min-h-96"
const KETCHER_STATIC_RESOURCES_URL = import.meta.env.BASE_URL
const KETCHER_OPERATION_TIMEOUT_MS = 15_000
let sharedStructServiceProvider: StandaloneStructServiceProvider | undefined

function getSharedStructServiceProvider(): StandaloneStructServiceProvider {
  sharedStructServiceProvider ??= new StandaloneStructServiceProvider()
  return sharedStructServiceProvider
}

function stringifyKetcherError(error: unknown): string {
  return error instanceof Error && error.message.length > 0
    ? error.message
    : "The structure editor could not complete that operation."
}

function withKetcherOperationTimeout<T>(
  operation: Promise<T>,
  operationLabel: string,
  timeoutMs = KETCHER_OPERATION_TIMEOUT_MS,
): Promise<T> {
  return new Promise((resolve, reject) => {
    let settled = false
    const settle = (callback: () => void): void => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      callback()
    }
    const timeout = setTimeout(() => {
      settle(() =>
        reject(
          new Error(
            `${operationLabel} exceeded ${timeoutMs} milliseconds. Try again or edit the source directly.`,
          ),
        ),
      )
    }, timeoutMs)
    void operation.then(
      (value) => settle(() => resolve(value)),
      (error: unknown) => settle(() => reject(error)),
    )
  })
}

export async function exportKetcherSource(
  ketcher: Ketcher,
  format: KetcherChemistryFormat,
): Promise<string> {
  switch (format) {
    case "smiles":
      return ketcher.getSmiles()
    case "cxsmiles":
      return ketcher.getExtendedSmiles()
    case "reaction-smiles":
      return ketcher.getSmiles()
    case "ket":
      return ketcher.getKet()
  }
}

export default function MarkdownBenchKetcherEditor(
  props: MarkdownBenchKetcherEditorProps,
): ReactElement {
  const { format, onCancel, onSave, source } = props
  const [ketcher, setKetcher] = useState<Ketcher | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [initializing, setInitializing] = useState(true)
  const [initialized, setInitialized] = useState(false)
  const [saving, setSaving] = useState(false)
  const mountedRef = useRef(true)
  const operationTokenRef = useRef(0)
  const structServiceProvider = getSharedStructServiceProvider()

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      operationTokenRef.current += 1
    }
  }, [])

  const initialize = useCallback(
    (nextKetcher: Ketcher) => {
      const operationToken = operationTokenRef.current + 1
      operationTokenRef.current = operationToken
      setKetcher(nextKetcher)
      setInitializing(true)
      setInitialized(false)
      setError(null)
      void withKetcherOperationTimeout(
        nextKetcher.setMolecule(source, { needZoom: true }),
        "Structure editor initialization",
      )
        .then(() => {
          if (mountedRef.current && operationTokenRef.current === operationToken) {
            setInitializing(false)
            setInitialized(true)
          }
        })
        .catch((caught: unknown) => {
          if (!mountedRef.current || operationTokenRef.current !== operationToken) return
          setInitializing(false)
          setInitialized(false)
          setError(stringifyKetcherError(caught))
        })
    },
    [source],
  )

  const save = useCallback(() => {
    if (!ketcher || !initialized || saving) return
    const operationToken = operationTokenRef.current + 1
    operationTokenRef.current = operationToken
    setSaving(true)
    setError(null)
    void withKetcherOperationTimeout(
      exportKetcherSource(ketcher, format),
      "Structure export",
    )
      .then((nextSource) => {
        if (!mountedRef.current || operationTokenRef.current !== operationToken) return
        onSave(nextSource)
      })
      .catch((caught: unknown) => {
        if (!mountedRef.current || operationTokenRef.current !== operationToken) return
        setError(stringifyKetcherError(caught))
        setSaving(false)
      })
  }, [format, initialized, ketcher, onSave, saving])

  const cancel = useCallback(() => {
    operationTokenRef.current += 1
    onCancel()
  }, [onCancel])

  return (
    <div
      data-component="markdown-bench-ketcher-editor"
      className="overflow-hidden rounded-md border border-border-base bg-background-base"
    >
      <div className="sticky top-0 z-10 flex min-h-12 items-center justify-between gap-3 border-b border-border-base bg-surface-inset-base px-3 py-2">
        <p
          role={error ? "alert" : "status"}
          aria-live={error ? "assertive" : "polite"}
          className="min-w-0 truncate text-xs text-text-weak"
        >
          {error ?? (initializing ? "Preparing structure editor…" : "Changes stay local until saved.")}
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={cancel}>
            Cancel
          </Button>
          <Button type="button" size="sm" disabled={!initialized || saving} onClick={save}>
            {saving ? "Saving…" : "Save structure"}
          </Button>
        </div>
      </div>
      <div className={KETCHER_EDITOR_VIEWPORT_CLASS_NAME} aria-busy={initializing || saving}>
        <Editor
          disableMacromoleculesEditor
          staticResourcesUrl={KETCHER_STATIC_RESOURCES_URL}
          structServiceProvider={structServiceProvider}
          errorHandler={setError}
          onInit={initialize}
        />
      </div>
    </div>
  )
}

export { KETCHER_OPERATION_TIMEOUT_MS, withKetcherOperationTimeout }
