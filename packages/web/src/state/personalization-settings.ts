import { useCallback, useEffect, useRef } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useStore } from "@tanstack/react-form"
import type { AnyFormApi } from "@tanstack/react-form"
import { patchGlobalConfig } from "./chat-actions"
import {
  shouldResetPersonalizationForm,
  buildPersonalizationPatch,
  personalizationSettingsMatch,
  readPersonalization,
  type PersonalizationSettings,
} from "./project-config-readers"
import {
  personalizationSettingsQueryOptions,
  personalizationSettingsQueryKeys,
  type PersonalizationSettingsBundle,
} from "./personalization-settings-query"
import { setGlobalConfigQueryData } from "./global-config-query"

const AUTO_SAVE_DELAY_MS = 250

function stringifyError(error: unknown) {
  if (error instanceof Error) return error.message
  if (typeof error === "string") return error
  try {
    return JSON.stringify(error)
  } catch {
    return String(error)
  }
}

export function usePersonalizationSettingsAutosave(form: AnyFormApi) {
  const queryClient = useQueryClient()
  const settingsQuery = useQuery(personalizationSettingsQueryOptions())
  const values = useStore(form.store, (state) => state.values)
  const isSubmitting = useStore(form.store, (state) => state.isSubmitting)
  const lastSavedValuesRef = useRef<PersonalizationSettings | undefined>(undefined)
  const inFlightSaveRef = useRef<Promise<boolean> | undefined>(undefined)
  const queuedSaveRef = useRef(false)
  const saveRef = useRef<() => Promise<boolean>>(async () => false)

  useEffect(() => {
    const bundle = settingsQuery.data
    if (!bundle) {
      return
    }

    const previousSavedValues = lastSavedValuesRef.current
    if (
      !shouldResetPersonalizationForm({
        nextValues: values,
        currentValues: bundle.personalization,
        lastSavedValues: previousSavedValues,
      })
    ) {
      lastSavedValuesRef.current = bundle.personalization
      return
    }

    lastSavedValuesRef.current = bundle.personalization
    form.reset(bundle.personalization)
  }, [form, settingsQuery.data, values])

  const performSave = useCallback(async () => {
    const bundle = queryClient.getQueryData<PersonalizationSettingsBundle>(
      personalizationSettingsQueryKeys.bundle(),
    )
    if (!bundle) {
      return false
    }

    const nextValues = form.state.values as PersonalizationSettings
    const currentValues = readPersonalization(bundle.globalConfig)
    if (personalizationSettingsMatch(nextValues, currentValues)) {
      lastSavedValuesRef.current = currentValues
      return true
    }

    try {
      const updatedGlobal = await patchGlobalConfig(buildPersonalizationPatch(nextValues))
      const nextPersonalization = readPersonalization(updatedGlobal)
      setGlobalConfigQueryData(queryClient, updatedGlobal)
      queryClient.setQueryData<PersonalizationSettingsBundle>(
        personalizationSettingsQueryKeys.bundle(),
        {
          globalConfig: updatedGlobal,
          personalization: nextPersonalization,
        },
      )
      lastSavedValuesRef.current = nextPersonalization
      form.setErrorMap({ onSubmit: undefined })
      return true
    } catch (error) {
      form.setErrorMap({
        onSubmit: {
          form: stringifyError(error),
          fields: {},
        },
      })
      return false
    }
  }, [form, queryClient])

  const save = useCallback(async () => {
    if (inFlightSaveRef.current) {
      queuedSaveRef.current = true
      return false
    }

    const inFlightSave = (async () => {
      try {
        return await performSave()
      } finally {
        inFlightSaveRef.current = undefined
        if (queuedSaveRef.current) {
          queuedSaveRef.current = false
          void saveRef.current()
        }
      }
    })()

    inFlightSaveRef.current = inFlightSave
    return inFlightSave
  }, [performSave])

  useEffect(() => {
    saveRef.current = save
  }, [save])

  useEffect(() => {
    const bundle = settingsQuery.data
    if (!bundle || settingsQuery.isPending || isSubmitting) {
      return
    }

    if (
      personalizationSettingsMatch(values, lastSavedValuesRef.current ?? bundle.personalization)
    ) {
      return
    }

    const timeout = window.setTimeout(() => {
      void save()
    }, AUTO_SAVE_DELAY_MS)

    return () => {
      window.clearTimeout(timeout)
    }
  }, [isSubmitting, save, settingsQuery.data, settingsQuery.isPending, values])

  return {
    settingsQuery,
    save,
  }
}
