import { useNavigate } from "@tanstack/react-router"
import { useEffect, useState } from "react"
import { Button, ChevronLeftIcon } from "@buddy/ui"
import { DirectoryChatConversationPane } from "@/components/directory-chat/directory-chat-conversation-pane"
import { DirectoryChatReadingReaderPane } from "@/components/directory-chat/directory-chat-reading-reader-pane"
import { useDirectoryNotebookRouteContext } from "@/components/directory-chat/directory-notebook-route-context"
import { language } from "@/context/language"
import { fileNameFromPath, normalizeRelativePath } from "@/lib/workspace-file-paths"
import { useChatStore } from "@/state/chat-store"
import { loadResources, type ResourceRecord } from "@/state/resource-actions"

type DirectoryChatReadingPageProps = {
  resourcePath: string
  resourceKey?: string
}

function normalizeResourceRecordPath(record: ResourceRecord) {
  return normalizeRelativePath(record.sourceOriginRelpath ?? record.sourceRelpath)
}

export function DirectoryChatReadingPage(props: DirectoryChatReadingPageProps) {
  const navigate = useNavigate()
  const { controller, directoryToken } = useDirectoryNotebookRouteContext()
  const normalizedPath = normalizeRelativePath(props.resourcePath)
  const resourceName = fileNameFromPath(normalizedPath) || language.t("sidebar.resources")
  const readyDirectory =
    controller.status === "ready" ? controller.mainPaneProps.directory : undefined
  const [resourceRecord, setResourceRecord] = useState<ResourceRecord | undefined>(undefined)
  const setActiveReadingResource = useChatStore((state) => state.setActiveReadingResource)
  const updateActiveReadingResourceLocation = useChatStore(
    (state) => state.updateActiveReadingResourceLocation,
  )

  useEffect(() => {
    if (!readyDirectory) return
    let cancelled = false
    setResourceRecord(undefined)
    void loadResources(readyDirectory)
      .then((resources) => {
        if (cancelled) return
        const matched = props.resourceKey
          ? resources.find(
              (resource) =>
                resource.id === props.resourceKey || resource.alias === props.resourceKey,
            )
          : normalizedPath
            ? resources.find((resource) => normalizeResourceRecordPath(resource) === normalizedPath)
            : undefined
        setResourceRecord(matched)
      })
      .catch(() => {
        if (!cancelled) {
          setResourceRecord(undefined)
        }
      })
    return () => {
      cancelled = true
    }
  }, [normalizedPath, props.resourceKey, readyDirectory])

  useEffect(() => {
    if (!readyDirectory || !normalizedPath) return
    setActiveReadingResource(readyDirectory, {
      ...(resourceRecord?.id ? { resourceID: resourceRecord.id } : {}),
      ...(resourceRecord?.alias ? { alias: resourceRecord.alias } : {}),
      name: resourceName,
      path: normalizedPath,
      ...(resourceRecord?.status ? { status: resourceRecord.status } : {}),
    })

    return () => {
      setActiveReadingResource(readyDirectory, undefined)
    }
  }, [normalizedPath, readyDirectory, resourceName, resourceRecord, setActiveReadingResource])

  if (controller.status === "invalid") {
    return (
      <div data-component="directory-chat-reading-invalid" className="p-6">
        {language.t("directoryChat.invalidNotebookIdentifier")}
      </div>
    )
  }

  if (controller.status === "opening") {
    return (
      <div data-component="directory-chat-reading-opening" className="p-6">
        {language.t("directoryChat.openingNotebook")}
      </div>
    )
  }

  return (
    <section
      data-component="directory-chat-reading-page"
      className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-surface-raised-base"
    >
      <header className="flex h-11 shrink-0 items-center gap-2 border-b border-border-weaker-base bg-background-base/80 px-3">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={language.t("sidebar.resourcesBackToChat")}
          title={language.t("sidebar.resourcesBackToChat")}
          onClick={() => {
            void navigate({
              to: "/$directory/chat",
              params: {
                directory: directoryToken,
              },
            })
          }}
        >
          <ChevronLeftIcon className="size-4" />
        </Button>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-text-base">{resourceName}</p>
          <p className="truncate text-[11px] text-text-weak">{normalizedPath}</p>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 w-full">
        <div className="min-w-0 flex-1 border-r border-border-weaker-base bg-background-base">
          {readyDirectory && normalizedPath ? (
            <DirectoryChatReadingReaderPane
              directory={readyDirectory}
              resourceName={resourceName}
              resourcePath={normalizedPath}
              onLocationChange={(location) => {
                updateActiveReadingResourceLocation(readyDirectory, {
                  locationLabel: location.locationLabel,
                  tocLabel: location.tocLabel,
                  pageLabel: location.pageLabel,
                })
              }}
            />
          ) : null}
        </div>

        <div className="flex min-h-0 w-[40rem] min-w-[24rem] max-w-[48vw] shrink-0 overflow-hidden">
          <DirectoryChatConversationPane {...controller.mainPaneProps} mainPaneTab="chat" />
        </div>
      </div>
    </section>
  )
}
