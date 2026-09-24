import { create } from "zustand"

/**
 * A note capture writes outside whichever surface is showing the note, so the
 * surfaces have to be told where it landed. This is deliberately not persisted
 * and not part of the workspace store: it is a momentary event, not layout state.
 *
 * Consumers pick a signal shape that matches how long their situation lasts —
 * the rail flashes, the drawer highlights a row, and a background Bench tab
 * carries a dot until it is focused and re-synchronized.
 */
export type NoteCaptureSignal = {
  directory: string
  relativePath: string
  id?: string
  /** Bumped per capture so repeat captures into the same note still notify. */
  nonce: number
}

type NoteCaptureSignalStore = {
  signal?: NoteCaptureSignal
  signalNoteCapture: (input: { directory: string; relativePath: string; id?: string }) => void
}

export const useNoteCaptureSignalStore = create<NoteCaptureSignalStore>()((set) => ({
  signalNoteCapture(input) {
    set((state) => ({
      signal: Object.assign(
        {
          directory: input.directory,
          relativePath: input.relativePath,
          nonce: (state.signal?.nonce ?? 0) + 1,
        },
        input.id ? { id: input.id } : undefined,
      ),
    }))
  },
}))

export function signalNoteCapture(input: { directory: string; relativePath: string; id?: string }) {
  useNoteCaptureSignalStore.getState().signalNoteCapture(input)
}

/** The latest capture for this directory, or undefined when the last one was elsewhere. */
export function useNoteCaptureSignal(directory: string): NoteCaptureSignal | undefined {
  return useNoteCaptureSignalStore((state) =>
    state.signal?.directory === directory ? state.signal : undefined,
  )
}
