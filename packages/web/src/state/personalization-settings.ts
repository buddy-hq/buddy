import { useCallback, useEffect, useRef } from "react"
import { useQueryClient } from "@tanstack/react-query"
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
import { setPersonalizationSettingsQueryData } from "./personalization-settings-query"
import { directoryChatQueryKeys } from "@/lib/directory-chat/chat-config-query"
import { globalConfigQueryKeys } from "./global-config-query"

const AUTO_SAVE_DELAY_MS = 250
const PERSONALIZATION_HYDRATION_OPTIONS = {
  dontRunListeners: true,
  dontUpdateMeta: true,
  dontValidate: true,
} as const

function hydratePersonalizationForm(form: AnyFormApi, personalization: PersonalizationSettings) {
  form.setFieldValue("primaryUse", personalization.primaryUse, PERSONALIZATION_HYDRATION_OPTIONS)
  form.setFieldValue(
    "preferredName",
    personalization.preferredName,
    PERSONALIZATION_HYDRATION_OPTIONS,
  )
  form.setFieldValue("occupation", personalization.occupation, PERSONALIZATION_HYDRATION_OPTIONS)
  form.setFieldValue(
    "moreAboutYou",
    personalization.moreAboutYou,
    PERSONALIZATION_HYDRATION_OPTIONS,
  )
}

function stringifyError(error: unknown) {
  if (error instanceof Error) return error.message
  if (typeof error === "string") return error
  try {
    return JSON.stringify(error)
  } catch {
    return String(error)
  }
}

export function usePersonalizationSettingsAutosave(
  form: AnyFormApi,
  input: {
    globalConfig?: Record<string, unknown>
    isPending: boolean
  },
) {
  const queryClient = useQueryClient()
  const values = useStore(form.store, (state) => state.values)
  const isSubmitting = useStore(form.store, (state) => state.isSubmitting)
  const lastSavedValuesRef = useRef<PersonalizationSettings | undefined>(undefined)
  const inFlightSaveRef = useRef<Promise<boolean> | undefined>(undefined)
  const queuedSaveRef = useRef(false)
  const saveRef = useRef<() => Promise<boolean>>(async () => false)

  useEffect(() => {
    if (!input.globalConfig) {
      return
    }

    const personalization = readPersonalization(input.globalConfig)
    const previousSavedValues = lastSavedValuesRef.current
    if (
      !shouldResetPersonalizationForm({
        nextValues: values,
        currentValues: personalization,
        lastSavedValues: previousSavedValues,
      })
    ) {
      lastSavedValuesRef.current = personalization
      return
    }

    lastSavedValuesRef.current = personalization
    hydratePersonalizationForm(form, personalization)
  }, [form, input.globalConfig, values])

  const performSave = useCallback(async () => {
    const globalConfig = queryClient.getQueryData<Record<string, unknown>>(
      globalConfigQueryKeys.bundle(),
    )
    if (!globalConfig) {
      return false
    }

    const nextValues = form.state.values as PersonalizationSettings
    const currentValues = readPersonalization(globalConfig)
    if (personalizationSettingsMatch(nextValues, currentValues)) {
      lastSavedValuesRef.current = currentValues
      return true
    }

    try {
      const updatedGlobal = await patchGlobalConfig(buildPersonalizationPatch(nextValues))
      const nextPersonalization = setPersonalizationSettingsQueryData(
        queryClient,
        updatedGlobal,
      ).personalization
      lastSavedValuesRef.current = nextPersonalization
      await queryClient.invalidateQueries({
        queryKey: directoryChatQueryKeys.allComposerConfigs(),
      })
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
    if (!input.globalConfig || input.isPending || isSubmitting) {
      return
    }

    if (
      personalizationSettingsMatch(
        values,
        lastSavedValuesRef.current ?? readPersonalization(input.globalConfig),
      )
    ) {
      return
    }

    const timeout = window.setTimeout(() => {
      void save()
    }, AUTO_SAVE_DELAY_MS)

    return () => {
      window.clearTimeout(timeout)
    }
  }, [input.globalConfig, input.isPending, isSubmitting, save, values])

  return {
    save,
  }
}
