import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react"
import {
  FoliateReader,
  type FoliateReaderHandle,
  type FoliateReaderLocation,
  type FoliateReaderSelection,
  type FoliateReaderSnapshot,
} from "./foliate-reader"
import type { ReaderAnnotation as FoliateReaderAnnotation } from "./foliate-reader-types"
import {
  foliateAnnotationsToReaderAnnotations,
  foliateSnapshotToReaderSnapshot,
} from "./foliate-reader-adapters"
import {
  READER_ENGINE_PDF,
  type DocumentReaderHandle,
  type DocumentReaderProps,
  type ReaderSource,
} from "./reader-types"
import {
  documentReaderEngine,
  foliateLocationToReaderRelocation,
  foliateSelectionToReaderSelection,
  readerSourceToFoliateSource,
} from "./document-reader-adapters"

type PdfReaderComponent = (typeof import("./pdf/pdf-reader"))["PdfReader"]
type PdfDocumentReaderProps = Omit<DocumentReaderProps, "source"> & {
  source: ReaderSource
}

let pdfReaderComponentPromise: Promise<PdfReaderComponent> | undefined

function loadPdfReaderComponent(): Promise<PdfReaderComponent> {
  pdfReaderComponentPromise ??= import("./pdf/pdf-reader")
    .then((module) => module.PdfReader)
    .catch((error: unknown) => {
      pdfReaderComponentPromise = undefined
      throw error
    })
  return pdfReaderComponentPromise
}

function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value))
}

const PdfDocumentReader = forwardRef<DocumentReaderHandle, PdfDocumentReaderProps>(
  function PdfDocumentReader({ onError, ...props }, ref) {
    const [PdfReader, setPdfReader] = useState<PdfReaderComponent | null>(null)

    useEffect(() => {
      let active = true
      void loadPdfReaderComponent().then(
        (component) => {
          if (active) setPdfReader(() => component)
        },
        (error: unknown) => {
          if (active) onError?.(toError(error))
        },
      )
      return () => {
        active = false
      }
    }, [onError])

    return PdfReader ? <PdfReader ref={ref} {...props} onError={onError} /> : null
  },
)

PdfDocumentReader.displayName = "PdfDocumentReader"

const FoliateDocumentReader = forwardRef<DocumentReaderHandle, DocumentReaderProps>(
  function FoliateDocumentReader(
    {
      source,
      className,
      persistenceSuffix,
      initialLocation,
      defaultTheme,
      showToolbar,
      emptyState,
      onReady,
      onLocationChange,
      onChatSelection,
      onChatSelectionRemoved,
      onOpenExternalLink,
      onError,
      onAnnotationsChange,
    },
    ref,
  ) {
    const foliateRef = useRef<FoliateReaderHandle | null>(null)
    const foliateSource = useMemo(() => readerSourceToFoliateSource(source), [source])
    const foliateInitialLocation =
      initialLocation?.kind === "cfi-position" ? initialLocation.cfi : undefined

    useImperativeHandle(
      ref,
      () => ({
        next: async () => {
          await foliateRef.current?.next()
        },
        prev: async () => {
          await foliateRef.current?.prev()
        },
        goTo: async (target) => {
          if (target.kind !== "cfi-position") return
          await foliateRef.current?.goTo(target.cfi)
        },
        setTheme: (theme) => foliateRef.current?.setTheme(theme),
        getSnapshot: () =>
          foliateSnapshotToReaderSnapshot(foliateRef.current?.getSnapshot() ?? null),
      }),
      [],
    )

    const handleReady = useCallback(
      (snapshot: FoliateReaderSnapshot) => {
        const readerSnapshot = foliateSnapshotToReaderSnapshot(snapshot)
        if (readerSnapshot) onReady?.(readerSnapshot)
      },
      [onReady],
    )
    const handleLocationChange = useCallback(
      (location: FoliateReaderLocation) => {
        const relocation = foliateLocationToReaderRelocation(location)
        if (relocation) onLocationChange?.(relocation)
      },
      [onLocationChange],
    )
    const handleChatSelection = useCallback(
      (selection: FoliateReaderSelection) => {
        onChatSelection?.(foliateSelectionToReaderSelection(selection))
      },
      [onChatSelection],
    )
    const handleAnnotationsChange = useCallback(
      (annotations: FoliateReaderAnnotation[]) => {
        onAnnotationsChange?.(foliateAnnotationsToReaderAnnotations(annotations))
      },
      [onAnnotationsChange],
    )

    return (
      <FoliateReader
        ref={foliateRef}
        source={foliateSource}
        readerSource={source ?? undefined}
        className={className}
        persistenceSuffix={persistenceSuffix}
        initialLocation={foliateInitialLocation}
        defaultTheme={defaultTheme}
        showToolbar={showToolbar}
        emptyState={emptyState}
        onReady={handleReady}
        onLocationChange={handleLocationChange}
        onChatSelection={handleChatSelection}
        onChatSelectionRemoved={onChatSelectionRemoved}
        onOpenExternalLink={onOpenExternalLink}
        onError={onError}
        onAnnotationsChange={handleAnnotationsChange}
      />
    )
  },
)

FoliateDocumentReader.displayName = "FoliateDocumentReader"

export const DocumentReader = forwardRef<DocumentReaderHandle, DocumentReaderProps>(
  function DocumentReader(props, ref) {
    if (documentReaderEngine(props.source) === READER_ENGINE_PDF && props.source) {
      const { source, ...pdfProps } = props
      return <PdfDocumentReader ref={ref} {...pdfProps} source={source} />
    }

    return <FoliateDocumentReader ref={ref} {...props} />
  },
)

DocumentReader.displayName = "DocumentReader"
