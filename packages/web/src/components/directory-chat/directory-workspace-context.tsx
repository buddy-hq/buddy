import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type ReactNode,
} from "react"
import { useBlocker, useLocation, useNavigate, useRouter } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import { useStore } from "zustand"
import {
  DirectoryWorkspaceBlocker,
  DirectoryWorkspaceController,
  buildWorkspaceRouteNavigation,
  readBenchRouteSnapshotFromLocation,
} from "@/lib/directory-workspace-controller"
import {
  benchRouteFallbackContextFromTarget,
  routeString,
} from "@/components/bench/bench-context-utils"
import { isBenchContentTarget } from "@/lib/bench-navigation"
import { logBenchToggleStep } from "@/lib/bench-toggle-diagnostics"
import { resolveBenchTabTitle, upsertBenchTab } from "@/lib/bench-tabs"
import { DirectoryWorkspaceLifecycleService } from "@/lib/directory-workspace-lifecycle"
import { registerLiveDirectoryWorkspace } from "@/lib/directory-workspace-registry"
import { subagentBenchSelection } from "@/lib/subagent-bench-target"
import { useStrictModeDeferredDisposal } from "@/lib/use-strict-mode-deferred-disposal"
import { workspaceChatKeyForSession, type WorkspaceChatKey } from "@/lib/workspace-chat-key"
import { useChatStore } from "@/state/chat-store"
import { workspaceObjectsQueryOptions } from "@/state/workspace-objects-query"
import {
  BENCH_ROUTE_STATUS_OPEN,
  type BenchRouteSnapshot,
  DIRECTORY_WORKSPACE_DEFAULT_LAST_DRAWER,
  WORKSPACE_HYDRATION_FAILED,
  WORKSPACE_HYDRATION_PENDING,
  WORKSPACE_HYDRATION_READY,
  createCollapsedWorkspaceState,
  createDirectoryWorkspaceStore,
  createExpandedWorkspaceState,
  isSameBenchRouteSnapshot,
  defaultWorkspacePresentationSlot,
  effectiveWorkspaceProjection,
  persistedDirectoryWorkspaceStateFromStore,
  readPersistedDirectoryWorkspace,
  removeSessionBenchTargetsFromSlots,
  workspacePresentationSlotForChat,
  writePersistedDirectoryWorkspace,
  type DirectoryWorkspacePersistenceStorage,
  type DirectoryWorkspaceStore,
  type EffectiveWorkspaceProjection,
  type WorkspacePresentationSlot,
} from "@/state/directory-workspace-store"

type DirectoryWorkspaceContextValue = {
  directory: string
  store: DirectoryWorkspaceStore
  controller: DirectoryWorkspaceController
  blocker: DirectoryWorkspaceBlocker
  lifecycle: DirectoryWorkspaceLifecycleService
  route: BenchRouteSnapshot
  projection: EffectiveWorkspaceProjection
}

const DirectoryWorkspaceContext = createContext<DirectoryWorkspaceContextValue | undefined>(
  undefined,
)

function initialDockedState(route: BenchRouteSnapshot) {
  if (route.status === BENCH_ROUTE_STATUS_OPEN) {
    return createExpandedWorkspaceState(null)
  }
  return createCollapsedWorkspaceState()
}

function workspaceChatKeyForRoute(directory: string, route: BenchRouteSnapshot): WorkspaceChatKey {
  const directoryState = useChatStore.getState().directories[directory]
  if (route.status === BENCH_ROUTE_STATUS_OPEN && route.target.type === "session") {
    const selection = subagentBenchSelection(directoryState?.sessions ?? [], route.target.sessionID)
    if (selection) return workspaceChatKeyForSession(selection.ownerSessionID)
  }
  return workspaceChatKeyForSession(directoryState?.sessionID)
}

function unresolvedSessionBenchTargetIDs(input: {
  slots: Partial<Record<WorkspaceChatKey, WorkspacePresentationSlot>>
  route: BenchRouteSnapshot
  sessions: readonly { id: string; parentID?: string }[]
}): Set<string> {
  const sessionIDs = new Set<string>()
  for (const slot of Object.values(input.slots)) {
    for (const tab of slot?.tabs ?? []) {
      if (tab.target.type === "session") sessionIDs.add(tab.target.sessionID)
    }
  }
  if (input.route.status === BENCH_ROUTE_STATUS_OPEN && input.route.target.type === "session") {
    sessionIDs.add(input.route.target.sessionID)
  }

  return new Set(
    [...sessionIDs].filter((sessionID) => !subagentBenchSelection(input.sessions, sessionID)),
  )
}

function BenchObjectTitleSynchronizer(props: {
  directory: string
  lifecycle: DirectoryWorkspaceLifecycleService
  objectTitlesRef: MutableRefObject<ReadonlyMap<string, string>>
}) {
  const objectsQuery = useQuery(workspaceObjectsQueryOptions(props.directory))
  const objectTitles = useMemo(() => {
    const titles = new Map<string, string>()
    for (const object of objectsQuery.data?.objects ?? []) {
      titles.set(object.objectID, object.title)
    }
    return titles
  }, [objectsQuery.data?.objects])

  useEffect(() => {
    if (objectsQuery.data === undefined) return
    props.objectTitlesRef.current = objectTitles
    void props.lifecycle.publishCurrent()
  }, [objectTitles, objectsQuery.data, props.lifecycle, props.objectTitlesRef])

  return null
}

export function DirectoryWorkspaceProvider(props: {
  directory: string
  children: ReactNode
  persistenceStorage?: DirectoryWorkspacePersistenceStorage
}) {
  const location = useLocation()
  const navigate = useNavigate()
  const router = useRouter()
  const route = useMemo(
    () =>
      readBenchRouteSnapshotFromLocation({
        directory: props.directory,
        pathname: location.pathname,
        search: location.search,
      }),
    [location.pathname, location.search, props.directory],
  )
  const routeRef = useRef(route)
  const locationRef = useRef(location)
  const navigateRef = useRef(navigate)
  const workspaceDisposedRef = useRef(false)
  const unregisterWorkspaceRef = useRef<() => void>(() => undefined)
  routeRef.current = route
  locationRef.current = location
  navigateRef.current = navigate

  const [store] = useState(() => {
    const activeChatKey = workspaceChatKeyForRoute(props.directory, routeRef.current)
    const initialDocked = initialDockedState(routeRef.current)
    logBenchToggleStep("directory-workspace-provider-create-store", {
      directory: props.directory,
      route: routeRef.current,
      activeChatKey,
      initialDocked,
    })
    const initialSlot: WorkspacePresentationSlot = {
      route: routeRef.current,
      tabs:
        routeRef.current.status === BENCH_ROUTE_STATUS_OPEN
          ? upsertBenchTab([], routeRef.current.target).tabs
          : [],
      docked: initialDocked,
      lastDrawer: DIRECTORY_WORKSPACE_DEFAULT_LAST_DRAWER,
    }
    const slots = {
      [activeChatKey]: initialSlot,
    } satisfies Partial<Record<WorkspaceChatKey, WorkspacePresentationSlot>>
    return createDirectoryWorkspaceStore({
      directory: props.directory,
      initialState: {
        activeChatKey,
        docked: initialDocked,
        lastDrawer: DIRECTORY_WORKSPACE_DEFAULT_LAST_DRAWER,
        slots,
        hydration: { status: WORKSPACE_HYDRATION_PENDING },
      },
    })
  })
  const hasObjectTabs = useStore(store, (state) =>
    workspacePresentationSlotForChat(state.slots, state.activeChatKey).tabs.some(
      (tab) => tab.target.type === "object",
    ),
  )
  const objectTitlesRef = useRef<ReadonlyMap<string, string>>(new Map())
  const [lifecycle] = useState(
    () =>
      new DirectoryWorkspaceLifecycleService({
        directory: props.directory,
        getProjection: () =>
          effectiveWorkspaceProjection(
            routeRef.current,
            {
              docked: store.getState().docked,
              lastDrawer: store.getState().lastDrawer,
            },
            store.getState().pendingIntent,
          ),
        getTabs: () =>
          workspacePresentationSlotForChat(store.getState().slots, store.getState().activeChatKey)
            .tabs,
        getTabTitle: (tab) => resolveBenchTabTitle(tab, objectTitlesRef.current),
        getHydrationStatus: () => store.getState().hydration.status,
        getRouteFallbackContext: (route) => {
          if (route.status !== BENCH_ROUTE_STATUS_OPEN || !isBenchContentTarget(route.target)) {
            return null
          }
          const location = locationRef.current
          return benchRouteFallbackContextFromTarget({
            target: route.target,
            directory: props.directory,
            route: routeString({
              pathname: location.pathname,
              searchStr: location.searchStr,
            }),
          })
        },
      }),
  )
  const [blocker] = useState(
    () =>
      new DirectoryWorkspaceBlocker({
        directory: props.directory,
        getCurrentRoute: () => routeRef.current,
        guardLeave: (input) => lifecycle.guardLeave(input),
      }),
  )
  const [controller] = useState(
    () =>
      new DirectoryWorkspaceController({
        directory: props.directory,
        store,
        getRoute: () => routeRef.current,
        navigate: async (options) => {
          await navigateRef.current(options)
          return {
            pathname: router.state.location.pathname,
            search: router.state.location.search,
          }
        },
        blocker,
      }),
  )
  const persistCurrentWorkspaceState = useCallback(async (): Promise<void> => {
    const state = store.getState()
    logBenchToggleStep("directory-workspace-provider-persist-current-state-entry", {
      directory: props.directory,
      hydration: state.hydration,
      docked: state.docked,
      lastDrawer: state.lastDrawer,
    })
    if (state.hydration.status === WORKSPACE_HYDRATION_PENDING) return
    // Failed hydration holds only a fallback slot for the active chat. Persisting that would erase
    // every other chat's stored presentation on the strength of one transient read error.
    if (state.hydration.status === WORKSPACE_HYDRATION_FAILED) return
    await writePersistedDirectoryWorkspace(
      Object.assign(
        {
          directory: props.directory,
          state: persistedDirectoryWorkspaceStateFromStore({
            slots: state.slots,
          }),
        },
        props.persistenceStorage ? { storage: props.persistenceStorage } : undefined,
      ),
    )
  }, [props.directory, props.persistenceStorage, store])

  useBlocker({
    shouldBlockFn: ({ next }) =>
      blocker.shouldBlockNavigation({
        pathname: next.pathname,
        search: next.search,
      }),
    enableBeforeUnload: false,
  })

  useEffect(() => {
    workspaceDisposedRef.current = false
    const unregister = registerLiveDirectoryWorkspace({
      directory: props.directory,
      controller,
      getRoute: () => routeRef.current,
      setActiveSessionContext: (sessionID) => lifecycle.setActiveSessionID(sessionID),
      persist: persistCurrentWorkspaceState,
      isDisposed: () => workspaceDisposedRef.current || controller.isDisposed(),
    })
    unregisterWorkspaceRef.current = unregister
    return () => {
      workspaceDisposedRef.current = true
      unregister()
      if (unregisterWorkspaceRef.current === unregister) {
        unregisterWorkspaceRef.current = () => undefined
      }
    }
  }, [controller, lifecycle, persistCurrentWorkspaceState, props.directory, store])

  useStrictModeDeferredDisposal({
    ownerKey: controller,
    eventPrefix: "directory-workspace-provider",
    logEvent: logBenchToggleStep,
    getDiagnostics: () => ({
      directory: props.directory,
      route: routeRef.current,
      location: {
        pathname: locationRef.current.pathname,
        searchStr: locationRef.current.searchStr,
      },
      projection: effectiveWorkspaceProjection(
        routeRef.current,
        {
          docked: store.getState().docked,
          lastDrawer: store.getState().lastDrawer,
        },
        store.getState().pendingIntent,
      ),
    }),
    dispose: () => {
      workspaceDisposedRef.current = true
      unregisterWorkspaceRef.current()
      void persistCurrentWorkspaceState().catch(() => undefined)
      controller.dispose()
      void lifecycle.dispose().catch(() => undefined)
    },
  })

  useEffect(() => {
    let disposed = false
    logBenchToggleStep("directory-workspace-provider-read-persisted-start", {
      directory: props.directory,
      route: routeRef.current,
    })
    void (async () => {
      try {
        const result = await readPersistedDirectoryWorkspace(
          Object.assign(
            {
              directory: props.directory,
            },
            props.persistenceStorage ? { storage: props.persistenceStorage } : undefined,
          ),
        )
        logBenchToggleStep("directory-workspace-provider-read-persisted-result", {
          directory: props.directory,
          disposed,
          result,
          currentState: store.getState(),
        })
        if (disposed) return
        const persistedState = result.status === WORKSPACE_HYDRATION_READY ? result.state : null
        const activeChatKey = workspaceChatKeyForRoute(props.directory, routeRef.current)
        const persistedSlots = persistedState?.slots ?? {}
        const currentRoute = routeRef.current
        const directoryState = useChatStore.getState().directories[props.directory]
        const unresolvedSessionIDs = directoryState
          ? unresolvedSessionBenchTargetIDs({
              slots: persistedSlots,
              route: currentRoute,
              sessions: directoryState.sessions,
            })
          : new Set<string>()
        const restoredPersistedSlots = removeSessionBenchTargetsFromSlots({
          slots: persistedSlots,
          sessionIDs: unresolvedSessionIDs,
        })
        const persistedSlot = workspacePresentationSlotForChat(
          restoredPersistedSlots,
          activeChatKey,
        )
        const routeWins =
          currentRoute.status === BENCH_ROUTE_STATUS_OPEN &&
          (currentRoute.target.type !== "session" ||
            !unresolvedSessionIDs.has(currentRoute.target.sessionID))
        const restoredRoute = routeWins ? currentRoute : persistedSlot.route
        const restoredTabs =
          restoredRoute.status === BENCH_ROUTE_STATUS_OPEN
            ? upsertBenchTab(persistedSlot.tabs, restoredRoute.target).tabs
            : []
        // The URL is authoritative for *which* target is open, never for whether the workspace is
        // expanded or which drawer is showing — those belong to the chat's saved slot. Reloading a
        // collapsed Bench leaves the same route in the URL, so deriving docked state from the route
        // would silently reopen a workspace the user closed.
        const restoredDocked =
          routeWins && !isSameBenchRouteSnapshot(currentRoute, persistedSlot.route)
            ? initialDockedState(currentRoute)
            : persistedSlot.docked
        const restoredLastDrawer = persistedSlot.lastDrawer
        if (!routeWins && !isSameBenchRouteSnapshot(currentRoute, restoredRoute)) {
          await navigateRef.current(
            buildWorkspaceRouteNavigation({
              directory: props.directory,
              route: restoredRoute,
            }),
          )
          if (disposed) return
        }
        const slots = {
          ...restoredPersistedSlots,
          [activeChatKey]: {
            route: restoredRoute,
            tabs: restoredTabs,
            docked: restoredDocked,
            lastDrawer: restoredLastDrawer,
          },
        }
        store.getState().finishHydration({
          activeChatKey,
          slots,
          docked: restoredDocked,
          lastDrawer: restoredLastDrawer,
          hydration:
            result.status === WORKSPACE_HYDRATION_FAILED
              ? { status: WORKSPACE_HYDRATION_FAILED, message: result.message }
              : { status: WORKSPACE_HYDRATION_READY },
        })
      } catch (error) {
        if (disposed) return
        const activeChatKey = workspaceChatKeyForRoute(props.directory, routeRef.current)
        const fallback = defaultWorkspacePresentationSlot()
        store.getState().finishHydration({
          activeChatKey,
          slots: {
            ...store.getState().slots,
            [activeChatKey]: fallback,
          },
          docked: fallback.docked,
          lastDrawer: fallback.lastDrawer,
          hydration: {
            status: WORKSPACE_HYDRATION_FAILED,
            message: error instanceof Error ? error.message : "Workspace restoration failed.",
          },
        })
      } finally {
        if (!disposed) controller.drainHydrationQueue()
      }
    })()
    return () => {
      disposed = true
      logBenchToggleStep("directory-workspace-provider-read-persisted-disposed", {
        directory: props.directory,
      })
    }
  }, [controller, props.directory, props.persistenceStorage, store])

  useEffect(() => {
    const unsubscribe = store.subscribe((state, previousState) => {
      logBenchToggleStep("directory-workspace-provider-store-subscribe", () => ({
        directory: props.directory,
        previous: {
          docked: previousState.docked,
          lastDrawer: previousState.lastDrawer,
          hydration: previousState.hydration,
          pendingIntent: previousState.pendingIntent,
        },
        next: {
          docked: state.docked,
          lastDrawer: state.lastDrawer,
          hydration: state.hydration,
          pendingIntent: state.pendingIntent,
        },
        projection: effectiveWorkspaceProjection(
          routeRef.current,
          { docked: state.docked, lastDrawer: state.lastDrawer },
          state.pendingIntent,
        ),
      }))
      if (state.hydration.status === WORKSPACE_HYDRATION_PENDING) return
      if (state.slots !== previousState.slots) {
        void lifecycle.publishCurrent()
      }
      if (
        state.activeChatKey === previousState.activeChatKey &&
        state.slots === previousState.slots &&
        state.docked.visibility === previousState.docked.visibility &&
        state.lastDrawer === previousState.lastDrawer &&
        state.hydration.status === previousState.hydration.status
      ) {
        return
      }
      void persistCurrentWorkspaceState().catch(() => undefined)
    })
    return () => {
      unsubscribe()
    }
  }, [lifecycle, persistCurrentWorkspaceState, props.directory, store])

  useEffect(() => {
    if (store.getState().hydration.status === WORKSPACE_HYDRATION_PENDING) return
    if (store.getState().pendingIntent !== null) return
    store.getState().captureChatSlot({
      chatKey: store.getState().activeChatKey,
      route,
    })
  }, [route, store])

  useEffect(() => {
    return useChatStore.subscribe((state, previousState) => {
      const nextSessions = state.directories[props.directory]?.sessions ?? []
      const nextSessionIDs = new Set(nextSessions.map((session) => session.id))
      const removedSessionIDs = (previousState.directories[props.directory]?.sessions ?? [])
        .filter((session) => !nextSessionIDs.has(session.id))
        .map((session) => session.id)
      if (removedSessionIDs.length > 0) {
        void controller.execute({
          type: "remove-session-targets",
          sessionIDs: removedSessionIDs,
        })
      }

      const nextSessionID = state.directories[props.directory]?.sessionID
      const previousSessionID = previousState.directories[props.directory]?.sessionID
      if (previousSessionID !== undefined || nextSessionID === undefined) return
      const draftChatKey = workspaceChatKeyForSession(undefined)
      if (store.getState().activeChatKey !== draftChatKey) return
      store.getState().captureChatSlot({
        chatKey: draftChatKey,
        route: routeRef.current,
      })
      store.getState().promoteChatSlot({
        from: draftChatKey,
        to: workspaceChatKeyForSession(nextSessionID),
      })
    })
  }, [controller, props.directory, store])

  const projection = useStore(store, (state) =>
    effectiveWorkspaceProjection(
      route,
      {
        docked: state.docked,
        lastDrawer: state.lastDrawer,
      },
      state.pendingIntent,
    ),
  )

  useEffect(() => {
    logBenchToggleStep("directory-workspace-provider-projection-effect", {
      directory: props.directory,
      route,
      projection,
      storeState: store.getState(),
      location: {
        pathname: location.pathname,
        searchStr: location.searchStr,
      },
    })
  }, [location.pathname, location.searchStr, projection, props.directory, route, store])

  const value = useMemo(
    () => ({
      directory: props.directory,
      store,
      controller,
      blocker,
      lifecycle,
      route,
      projection,
    }),
    [blocker, controller, lifecycle, projection, props.directory, route, store],
  )

  return (
    <DirectoryWorkspaceContext.Provider value={value}>
      {hasObjectTabs ? (
        <BenchObjectTitleSynchronizer
          directory={props.directory}
          lifecycle={lifecycle}
          objectTitlesRef={objectTitlesRef}
        />
      ) : null}
      {props.children}
    </DirectoryWorkspaceContext.Provider>
  )
}

export function useDirectoryWorkspace() {
  const value = useContext(DirectoryWorkspaceContext)
  if (!value) {
    throw new Error("DirectoryWorkspaceContext is not available")
  }
  return value
}

export function useDirectoryWorkspaceOptional() {
  return useContext(DirectoryWorkspaceContext)
}
