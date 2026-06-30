import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { useBlocker, useLocation, useNavigate, useRouter } from "@tanstack/react-router"
import { useStore } from "zustand"
import {
  DirectoryWorkspaceBlocker,
  DirectoryWorkspaceController,
  readBenchRouteSnapshotFromLocation,
} from "@/lib/directory-workspace-controller"
import {
  benchRouteFallbackContextFromTarget,
  routeString,
} from "@/components/bench/bench-context-utils"
import { logBenchToggleStep } from "@/lib/bench-toggle-diagnostics"
import { DirectoryWorkspaceLifecycleService } from "@/lib/directory-workspace-lifecycle"
import { useStrictModeDeferredDisposal } from "@/lib/use-strict-mode-deferred-disposal"
import {
  BENCH_ROUTE_STATUS_OPEN,
  type BenchRouteSnapshot,
  DIRECTORY_WORKSPACE_DEFAULT_LAST_DRAWER,
  WORKSPACE_HYDRATION_FAILED,
  WORKSPACE_HYDRATION_PENDING,
  WORKSPACE_HYDRATION_READY,
  WORKSPACE_VISIBILITY_EXPANDED,
  createCollapsedWorkspaceState,
  createDirectoryWorkspaceStore,
  createExpandedWorkspaceState,
  effectiveWorkspaceProjection,
  persistedDirectoryWorkspaceStateFromStore,
  readPersistedDirectoryWorkspace,
  writePersistedDirectoryWorkspace,
  type DirectoryWorkspacePersistenceStorage,
  type DirectoryWorkspaceStore,
  type EffectiveWorkspaceProjection,
  type PersistedDirectoryWorkspaceState,
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

function dockedStateFromPersistedState(
  state: PersistedDirectoryWorkspaceState,
):
  | ReturnType<typeof createCollapsedWorkspaceState>
  | ReturnType<typeof createExpandedWorkspaceState> {
  return state.visibility === WORKSPACE_VISIBILITY_EXPANDED
    ? createExpandedWorkspaceState(null)
    : createCollapsedWorkspaceState()
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
  const routerRef = useRef(router)
  routeRef.current = route
  locationRef.current = location
  navigateRef.current = navigate
  routerRef.current = router

  const [store] = useState(() => {
    logBenchToggleStep("directory-workspace-provider-create-store", {
      directory: props.directory,
      route: routeRef.current,
      initialDocked: initialDockedState(routeRef.current),
    })
    return createDirectoryWorkspaceStore({
      directory: props.directory,
      initialState: {
        docked: initialDockedState(routeRef.current),
        lastDrawer: DIRECTORY_WORKSPACE_DEFAULT_LAST_DRAWER,
        hydration: { status: WORKSPACE_HYDRATION_PENDING },
      },
    })
  })
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
        getHydrationStatus: () => store.getState().hydration.status,
        getRouteFallbackContext: (route) => {
          if (route.status !== BENCH_ROUTE_STATUS_OPEN) return null
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
        preloadNavigation: async (options) => {
          await routerRef.current.preloadRoute(options)
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
    await writePersistedDirectoryWorkspace({
      directory: props.directory,
      state: persistedDirectoryWorkspaceStateFromStore({
        docked: state.docked,
        lastDrawer: state.lastDrawer,
      }),
      ...(props.persistenceStorage ? { storage: props.persistenceStorage } : {}),
    })
  }, [props.directory, props.persistenceStorage, store])

  useBlocker({
    shouldBlockFn: ({ next }) =>
      blocker.shouldBlockNavigation({
        pathname: next.pathname,
        search: next.search,
      }),
    enableBeforeUnload: false,
  })

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
    void readPersistedDirectoryWorkspace({
      directory: props.directory,
      ...(props.persistenceStorage ? { storage: props.persistenceStorage } : {}),
    }).then((result) => {
      logBenchToggleStep("directory-workspace-provider-read-persisted-result", {
        directory: props.directory,
        disposed,
        result,
        currentState: store.getState(),
      })
      if (disposed) return
      const defaultDockedState = initialDockedState(routeRef.current)
      const persistedState = result.status === WORKSPACE_HYDRATION_READY ? result.state : null
      store.getState().finishHydration({
        docked: persistedState ? dockedStateFromPersistedState(persistedState) : defaultDockedState,
        lastDrawer: persistedState?.lastDrawer ?? DIRECTORY_WORKSPACE_DEFAULT_LAST_DRAWER,
        hydration:
          result.status === WORKSPACE_HYDRATION_FAILED
            ? { status: WORKSPACE_HYDRATION_FAILED, message: result.message }
            : { status: WORKSPACE_HYDRATION_READY },
      })
      controller.drainHydrationQueue()
    })
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
      if (
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
  }, [persistCurrentWorkspaceState, props.directory, store])

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
