import { useState } from "react"
import { Button, ToggleGroup, ToggleGroupItem, cn } from "@buddy/ui"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@buddy/ui/components/ui/input-group"
import {
  ArrowLeftIcon,
  BookOpenIcon,
  FolderIcon,
  Globe,
  NoteIcon,
  PresentationIcon,
  SearchIcon,
  type AppIcon,
} from "@/icons/app-icons"

type Book = {
  readonly title: string
  readonly author: string
  readonly chapter: string
  readonly excerpt: string
  readonly coverClass: string
}

const BOOKS: readonly Book[] = [
  {
    title: "Learning to Learn",
    author: "Maya Ellis",
    chapter: "Making room for recall",
    excerpt: "Learning begins when we make an idea our own. A question, a sketch, or a conversation can turn a familiar sentence into something we understand. Leave a little space between reading and remembering. In that space, notice what stays with you.",
    coverClass: "bg-surface-raised-base",
  },
  {
    title: "The Shape of Ideas",
    author: "Jonah Reed",
    chapter: "A useful first sketch",
    excerpt: "A sketch gives an idea somewhere to live. It does not need to be complete. Start with the part you can see clearly, then follow the connections that appear. The page becomes a place to think, one small mark at a time.",
    coverClass: "bg-surface-inset-base",
  },
  {
    title: "Field Notes",
    author: "Lena Park",
    chapter: "Paying attention",
    excerpt: "Keep a record of what you notice. A detail that seems ordinary today may become the beginning of a question tomorrow. Return to your notes slowly, and look for the things you keep coming back to.",
    coverClass: "bg-surface-base",
  },
  {
    title: "Ways of Seeing",
    author: "Alex Morgan",
    chapter: "A second look",
    excerpt: "The first look tells us what is familiar. The second shows us what we missed. Change the scale, turn the page, or ask someone else what they see. Each perspective gives the same subject a different shape.",
    coverClass: "bg-background-base",
  },
]

const SHORTCUTS: readonly { readonly label: string; readonly icon: AppIcon }[] = [
  { label: "New board", icon: PresentationIcon },
  { label: "New note", icon: NoteIcon },
  { label: "Browser", icon: Globe },
  { label: "Files", icon: FolderIcon },
  { label: "Notes", icon: NoteIcon },
  { label: "Resources", icon: BookOpenIcon },
]

type Surface =
  | { readonly type: "home" }
  | { readonly type: "book"; readonly book: Book }
  | { readonly type: "shortcut"; readonly label: string; readonly icon: AppIcon }

function Cover(props: { book: Book }) {
  return (
    <div className={cn(
      "flex aspect-[3/4] w-full flex-col justify-between rounded-sm border border-border-base p-3 text-left shadow-xs",
      props.book.coverClass,
    )}>
      <span className="text-[9px] text-text-weaker">{props.book.author}</span>
      <span className="font-serif text-[17px] leading-tight text-text-strong">{props.book.title}</span>
      <span className="h-px w-6 bg-border-base" />
    </div>
  )
}

function Bookshelf(props: {
  books: readonly Book[]
  selected?: Book
  compact?: boolean
  onOpen: (book: Book) => void
}) {
  return (
    <div className={cn("grid gap-3", props.compact ? "grid-cols-2" : "grid-cols-4")}>
      {props.books.map((book) => (
        <button
          key={book.title}
          type="button"
          aria-label={`Read ${book.title}`}
          aria-current={props.selected === book ? "true" : undefined}
          className={cn(
            "min-w-0 rounded-md p-1 text-left outline-none hover:bg-surface-base-hover focus-visible:ring-2 focus-visible:ring-border-interactive-base",
            props.selected === book && "bg-surface-raised-base ring-1 ring-border-interactive-base",
          )}
          onClick={() => props.onOpen(book)}
        >
          <Cover book={book} />
          <span className="mt-2 block truncate text-xs text-text-base">{book.title}</span>
        </button>
      ))}
    </div>
  )
}

function BookPreview(props: { book: Book; onHome: () => void; listOpen: boolean; onToggleList: () => void }) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border-weaker-base px-2">
        <Button variant="ghost" size="icon-xs" aria-label="Back to Bench" onClick={props.onHome}>
          <ArrowLeftIcon aria-hidden />
        </Button>
        <span className="min-w-0 flex-1 truncate text-xs text-text-weak">{props.book.title}</span>
        <Button variant="ghost" size="icon-xs" aria-label={props.listOpen ? "Hide resources" : "Show resources"} aria-expanded={props.listOpen} onClick={props.onToggleList}><BookOpenIcon aria-hidden /></Button>
      </div>
      <div className="flex min-h-0 flex-1 overflow-y-auto px-8 py-14">
        <article className="mx-auto w-full max-w-md font-serif text-text-base">
          <p className="text-xs text-text-weaker">{props.book.author}</p>
          <h1 className="mt-5 text-3xl leading-tight text-text-strong">{props.book.chapter}</h1>
          <p className="mt-8 text-base leading-8">{props.book.excerpt}</p>
          <p className="mt-6 text-base leading-8">Return to the page with a question of your own. Write it down, and let it guide what you read next.</p>
        </article>
      </div>
      <div className="pb-4 text-center text-xs text-text-weaker">12 / 184</div>
    </div>
  )
}

/** Minimal Resources proposal: a recent shelf and an in-flow catalog beside the reader. */
export function BenchResourcesEasel() {
  const [surface, setSurface] = useState<Surface>({ type: "home" })
  const [resourcesOpen, setResourcesOpen] = useState(false)
  const [homeQuery, setHomeQuery] = useState("")
  const [resourceQuery, setResourceQuery] = useState("")
  const [showRecents, setShowRecents] = useState(true)
  const homeBooks = BOOKS.filter((book) => book.title.toLowerCase().includes(homeQuery.trim().toLowerCase()))
  const catalogBooks = BOOKS.filter((book) => `${book.title} ${book.author}`.toLowerCase().includes(resourceQuery.trim().toLowerCase()))

  function goHome() {
    setSurface({ type: "home" })
    setResourcesOpen(false)
    setHomeQuery("")
  }

  function readBook(book: Book) {
    setSurface({ type: "book", book })
    setResourcesOpen(true)
  }

  function openResources() {
    setResourcesOpen(true)
    if (surface.type !== "book") {
      const firstBook = BOOKS[0]
      if (firstBook) setSurface({ type: "book", book: firstBook })
    }
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-background-base">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border-weaker-base px-4 py-2">
        <span className="text-xs text-text-weak">Bench · Resources</span>
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="xs" onClick={() => setShowRecents((value) => !value)}>
            {showRecents ? "Hide recents" : "Show recents"}
          </Button>
          <ToggleGroup type="single" size="sm" value={surface.type === "home" ? "home" : "resources"} onValueChange={(value) => {
            if (value === "home") goHome()
            if (value === "resources") openResources()
          }} aria-label="Preview state">
            <ToggleGroupItem value="home">Home</ToggleGroupItem>
            <ToggleGroupItem value="resources">Resources</ToggleGroupItem>
          </ToggleGroup>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-4">
        <div className="mx-auto flex h-full min-h-[480px] w-full max-w-6xl overflow-hidden rounded-xl border border-border-base">
          <div aria-hidden className="hidden w-[22%] shrink-0 border-r border-border-weaker-base bg-surface-inset-base xl:block" />
          <main className="min-w-0 flex-1">
            {surface.type === "home" ? (
              <div className="flex h-full justify-center overflow-y-auto px-5 pt-[min(18vh,130px)]">
                <div className="w-full max-w-[440px] pb-10">
                  <InputGroup className="h-11">
                    <InputGroupAddon><SearchIcon aria-hidden /></InputGroupAddon>
                    <InputGroupInput type="search" aria-label="Search this notebook" placeholder="Search this notebook" value={homeQuery} onChange={(event) => setHomeQuery(event.currentTarget.value)} />
                  </InputGroup>
                  {homeQuery.trim() ? (
                    <div className="mt-4 flex flex-col gap-1">
                      {homeBooks.map((book) => <Button key={book.title} variant="ghost" className="justify-start" onClick={() => readBook(book)}><BookOpenIcon data-icon="inline-start" aria-hidden />{book.title}</Button>)}
                      {homeBooks.length === 0 ? <p className="py-2 text-xs text-text-weaker">No matches</p> : null}
                    </div>
                  ) : (
                    <>
                      <div className="mt-5 grid grid-cols-2 gap-2">
                        {SHORTCUTS.map((shortcut) => {
                          const Icon = shortcut.icon
                          return <Button key={shortcut.label} variant="outline" size="lg" className="justify-start" onClick={() => {
                            if (shortcut.label === "Resources") openResources()
                            else setSurface({ type: "shortcut", ...shortcut })
                          }}><Icon data-icon="inline-start" aria-hidden />{shortcut.label}</Button>
                        })}
                      </div>
                      {showRecents ? <section aria-label="Recent resources" className="mt-8">
                        <h2 className="mb-3 text-xs text-text-weaker">Recently read</h2>
                        <Bookshelf books={BOOKS} onOpen={readBook} />
                      </section> : null}
                    </>
                  )}
                </div>
              </div>
            ) : surface.type === "book" ? <BookPreview book={surface.book} onHome={goHome} listOpen={resourcesOpen} onToggleList={() => setResourcesOpen((open) => !open)} /> : (
              <div className="flex h-full flex-col">
                <div className="flex h-10 items-center gap-2 border-b border-border-weaker-base px-2">
                  <Button variant="ghost" size="icon-xs" aria-label="Back to Bench" onClick={goHome}><ArrowLeftIcon aria-hidden /></Button>
                  <span className="text-xs text-text-weak">{surface.label}</span>
                </div>
                <div className="flex flex-1 items-center justify-center"><surface.icon className="size-6 text-icon-base" aria-label={surface.label} /></div>
              </div>
            )}
          </main>
          {resourcesOpen ? <aside aria-label="Resources catalog" className="flex w-[min(240px,35%)] shrink-0 flex-col border-l border-border-weaker-base">
            <div className="flex h-10 shrink-0 items-center justify-between px-3">
              <h2 className="text-xs font-medium text-text-base">Resources</h2>
            </div>
            <div className="px-3 pb-4">
              <InputGroup>
                <InputGroupAddon><SearchIcon aria-hidden /></InputGroupAddon>
                <InputGroupInput type="search" aria-label="Search resources" placeholder="Search resources" value={resourceQuery} onChange={(event) => setResourceQuery(event.currentTarget.value)} />
              </InputGroup>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
              <Bookshelf books={catalogBooks} compact selected={surface.type === "book" ? surface.book : undefined} onOpen={readBook} />
              {catalogBooks.length === 0 ? <p className="py-3 text-xs text-text-weaker">No matches</p> : null}
            </div>
          </aside> : null}
          <nav aria-label="Bench rail" className="flex w-10 shrink-0 flex-col items-center border-l border-border-weaker-base py-2">
            <Button variant="ghost" size="icon-sm" aria-label="Open Resources" title="Resources" aria-pressed={resourcesOpen} onClick={openResources}><BookOpenIcon aria-hidden /></Button>
          </nav>
        </div>
      </div>
    </div>
  )
}
