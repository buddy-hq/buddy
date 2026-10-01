import boardArt from "@/assets/bench/board.webp"
import chatArt from "@/assets/bench/chat.webp"
import creationArt from "@/assets/bench/creation.webp"
import practiceArt from "@/assets/bench/practice.webp"
import resourceArt from "@/assets/bench/resource.webp"
import newNoteArt from "@/assets/bench/new-note.webp"
import notesArt from "@/assets/bench/notes.webp"
import noteArt from "@/assets/bench/note.webp"
import browserArt from "@/assets/bench/browser.webp"
import filesArt from "@/assets/bench/files.webp"
import type { NotebookSearchCommandID } from "@/state/notebook-search"

export function benchCommandArt(id: NotebookSearchCommandID): string | undefined {
  switch (id) {
    case "new-board":
    case "open-boards":
      return boardArt
    case "open-resources":
      return resourceArt
    case "open-practice":
      return practiceArt
    case "open-creations":
      return creationArt
    case "new-note":
      return newNoteArt
    case "open-notes":
      return notesArt
    case "open-files":
      return filesArt
  }
}

export const BENCH_BOARD_ART = boardArt
export const BENCH_RESOURCE_ART = resourceArt
export const BENCH_NEW_NOTE_ART = newNoteArt
export const BENCH_NOTES_ART = notesArt
export const BENCH_NOTE_ART = noteArt
export const BENCH_BROWSER_ART = browserArt
export const BENCH_FILES_ART = filesArt
export const BENCH_CHAT_ART = chatArt
export const BENCH_CREATION_ART = creationArt
export const BENCH_PRACTICE_ART = practiceArt
