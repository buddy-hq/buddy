import { useEffect, useState } from "react"
import { Button, Popover, PopoverContent, PopoverTitle, PopoverTrigger } from "@buddy/ui"
import { XIcon } from "@/icons/app-icons"
import { stringifyError } from "@/lib/api-client"
import {
  continueSubagentsInBackground,
  stopSubagent,
  useRunningSubagents,
} from "@/lib/use-running-subagents"
import { SubagentCompletionRow } from "./subagent-completion-row"

type ObservedRuns = {
  ownerSessionID?: string
  childSessionIDs: ReadonlySet<string>
  dismissedMessageIDs: ReadonlySet<string>
}

const DEFAULT_DESCRIPTION = "Delegated task"

function emptyObservedRuns(ownerSessionID: string | undefined): ObservedRuns {
  return { ownerSessionID, childSessionIDs: new Set(), dismissedMessageIDs: new Set() }
}

export function RunningSubagentsMenu(props: {
  directory: string
  ownerSessionID?: string
  onOpenSession: (sessionID: string) => void
}) {
  const { running, completions } = useRunningSubagents(props.directory, props.ownerSessionID)
  const [observed, setObserved] = useState(() => emptyObservedRuns(props.ownerSessionID))
  const [stopping, setStopping] = useState<ReadonlySet<string>>(new Set())
  const [stopError, setStopError] = useState<string>()
  const [backgrounding, setBackgrounding] = useState(false)

  useEffect(() => {
    setObserved((current) => {
      const base =
        current.ownerSessionID === props.ownerSessionID
          ? current
          : emptyObservedRuns(props.ownerSessionID)
      const added = running.filter((work) => !base.childSessionIDs.has(work.childSessionID))
      if (added.length === 0) return base
      return {
        ...base,
        childSessionIDs: new Set([
          ...base.childSessionIDs,
          ...added.map((work) => work.childSessionID),
        ]),
      }
    })
  }, [props.ownerSessionID, running])

  const notice =
    observed.ownerSessionID === props.ownerSessionID
      ? completions.findLast(
          (completion) =>
            observed.childSessionIDs.has(completion.childSessionID) &&
            !observed.dismissedMessageIDs.has(completion.messageID) &&
            !running.some((work) => work.childSessionID === completion.childSessionID),
        )
      : undefined

  async function stop(childSessionID: string) {
    setStopping((current) => new Set([...current, childSessionID]))
    setStopError(undefined)
    try {
      await stopSubagent(props.directory, childSessionID)
    } catch (cause) {
      setStopError(stringifyError(cause))
    } finally {
      setStopping((current) => new Set([...current].filter((id) => id !== childSessionID)))
    }
  }

  async function continueInBackground(ownerSessionID: string) {
    setBackgrounding(true)
    setStopError(undefined)
    try {
      await continueSubagentsInBackground(props.directory, ownerSessionID)
    } catch (cause) {
      setStopError(stringifyError(cause))
    } finally {
      setBackgrounding(false)
    }
  }

  function dismiss(messageID: string) {
    setObserved((current) => ({
      ...current,
      dismissedMessageIDs: new Set([...current.dismissedMessageIDs, messageID]),
    }))
  }

  if (running.length === 0 && !notice) return null

  const ownerSessionID = props.ownerSessionID
  const hasBlockingWork = running.some((work) => work.blocking && work.status === "running")

  return (
    <div data-component="running-subagents" className="flex shrink-0 items-center gap-2 px-4 py-1">
      {running.length > 0 ? (
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="xs">
              {running.length} {running.length === 1 ? "specialist" : "specialists"} working
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start">
            <PopoverTitle>Running work</PopoverTitle>
            <div className="mt-2 flex max-h-80 flex-col gap-3 overflow-y-auto">
              {running.map((work) => (
                <div
                  key={work.childSessionID}
                  data-component="running-subagent"
                  className="flex min-w-0 flex-col gap-1"
                >
                  <p className="truncate text-sm text-text-base">
                    {work.description ?? DEFAULT_DESCRIPTION}
                  </p>
                  <p className="truncate text-xs text-text-weak">
                    {work.agentID ?? "Specialist"} ·{" "}
                    {work.status === "waiting" ? "Waiting for result" : "Working"}
                  </p>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() => props.onOpenSession(work.childSessionID)}
                    >
                      Open in Bench
                    </Button>
                    {work.status === "running" ? (
                      <Button
                        variant="ghost"
                        size="xs"
                        disabled={stopping.has(work.childSessionID)}
                        onClick={() => void stop(work.childSessionID)}
                      >
                        {stopping.has(work.childSessionID) ? "Stopping" : "Stop"}
                      </Button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
            {ownerSessionID && hasBlockingWork ? (
              <div className="mt-3 flex flex-col gap-1 border-t border-border-weak-base pt-2">
                <Button
                  variant="ghost"
                  size="xs"
                  disabled={backgrounding}
                  onClick={() => void continueInBackground(ownerSessionID)}
                >
                  {backgrounding ? "Moving to background" : "Continue in background"}
                </Button>
                <p className="text-xs text-text-weak">
                  Moves all work this chat is waiting on to the background.
                </p>
              </div>
            ) : null}
            {stopError ? (
              <p role="alert" className="mt-2 text-xs text-text-critical-base">
                {stopError}
              </p>
            ) : null}
          </PopoverContent>
        </Popover>
      ) : null}
      {notice ? (
        <div className="flex min-w-0 items-center gap-1">
          <SubagentCompletionRow completion={notice} onOpenSession={props.onOpenSession} />
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Dismiss"
            onClick={() => dismiss(notice.messageID)}
          >
            <XIcon />
          </Button>
        </div>
      ) : null}
    </div>
  )
}
