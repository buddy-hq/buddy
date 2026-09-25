import { useEffect } from "react"
import { usePlatform } from "@/context/platform"
import { useOpenLink } from "@/components/directory-chat/use-open-link"

const EXTERNAL_LINK_SELECTOR = "a.external-link"

export function useInAppBrowserLinkRouting(directory: string) {
  const browserAvailable = usePlatform().inAppBrowser !== undefined
  const openLink = useOpenLink(directory)

  useEffect(() => {
    if (!browserAvailable) return
    const handleClick = (event: MouseEvent) => {
      if (event.button !== 0 || !(event.target instanceof Element)) return
      const link = event.target.closest(EXTERNAL_LINK_SELECTOR)
      if (!(link instanceof HTMLAnchorElement)) return
      event.preventDefault()
      event.stopPropagation()
      openLink(link.href, { modified: event.metaKey || event.ctrlKey })
    }
    document.addEventListener("click", handleClick, true)
    return () => document.removeEventListener("click", handleClick, true)
  }, [browserAvailable, openLink])
}
