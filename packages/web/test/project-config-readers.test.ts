import { describe, expect, test } from "bun:test"
import {
  buildPersonalizationPatch,
  normalizePersonalizationSettings,
  readConciseResponses,
  readPersonalization,
  shouldResetPersonalizationForm,
} from "../src/state/project-config-readers"

describe("project-config personalization helpers", () => {
  test("defaults concise responses on and reads an explicit override", () => {
    expect(readConciseResponses({})).toBe(true)
    expect(readConciseResponses({ concise_responses: false })).toBe(false)
  })

  test("reads missing personalization as empty values", () => {
    expect(readPersonalization({})).toEqual({
      primaryUse: undefined,
      preferredName: "",
      occupation: "",
      moreAboutYou: "",
    })
  })

  test("builds a null personalization patch when all fields are empty", () => {
    expect(
      buildPersonalizationPatch({
        preferredName: "   ",
        occupation: "",
        moreAboutYou: "  ",
      }),
    ).toEqual({ personalization: null })
  })

  test("builds a trimmed personalization patch when values are present", () => {
    expect(
      buildPersonalizationPatch({
        preferredName: " Pat ",
        occupation: " Researcher ",
        moreAboutYou: " Loves systems thinking. ",
      }),
    ).toEqual({
      personalization: {
        preferred_name: "Pat",
        occupation: "Researcher",
        more_about_you: "Loves systems thinking.",
      },
    })
  })

  test("reads and writes the user's primary use", () => {
    expect(
      readPersonalization({
        personalization: {
          primary_use: "teach",
        },
      }),
    ).toEqual({
      primaryUse: "teach",
      preferredName: "",
      occupation: "",
      moreAboutYou: "",
    })

    expect(
      buildPersonalizationPatch({
        primaryUse: "learn",
        preferredName: "",
        occupation: "",
        moreAboutYou: "",
      }),
    ).toEqual({
      personalization: {
        primary_use: "learn",
      },
    })
  })

  test("normalizes personalization values by trimming whitespace", () => {
    expect(
      normalizePersonalizationSettings({
        preferredName: " Pat ",
        occupation: " Researcher ",
        moreAboutYou: " Likes systems. ",
      }),
    ).toEqual({
      preferredName: "Pat",
      occupation: "Researcher",
      moreAboutYou: "Likes systems.",
    })
  })

  test("does not reset when fetched personalization would overwrite newer local edits", () => {
    expect(
      shouldResetPersonalizationForm({
        nextValues: {
          preferredName: "Patricia",
          occupation: "Researcher",
          moreAboutYou: "",
        },
        currentValues: {
          preferredName: "Pat",
          occupation: "Researcher",
          moreAboutYou: "",
        },
        lastSavedValues: {
          preferredName: "Pat",
          occupation: "Researcher",
          moreAboutYou: "",
        },
      }),
    ).toBe(false)
  })

  test("resets when the form still matches the last saved personalization", () => {
    expect(
      shouldResetPersonalizationForm({
        nextValues: {
          preferredName: "Pat",
          occupation: "Researcher",
          moreAboutYou: "",
        },
        currentValues: {
          preferredName: "Patricia",
          occupation: "Researcher",
          moreAboutYou: "Enjoys systems thinking.",
        },
        lastSavedValues: {
          preferredName: "Pat",
          occupation: "Researcher",
          moreAboutYou: "",
        },
      }),
    ).toBe(true)
  })

  test("resets when fetched personalization is the first loaded snapshot", () => {
    expect(
      shouldResetPersonalizationForm({
        nextValues: {
          preferredName: "",
          occupation: "",
          moreAboutYou: "",
        },
        currentValues: {
          preferredName: "Pat",
          occupation: "Researcher",
          moreAboutYou: "",
        },
      }),
    ).toBe(true)
  })

  test("does not reset on first load when the user already typed local edits", () => {
    expect(
      shouldResetPersonalizationForm({
        nextValues: {
          preferredName: "Patricia",
          occupation: "",
          moreAboutYou: "",
        },
        currentValues: {
          preferredName: "Pat",
          occupation: "Researcher",
          moreAboutYou: "",
        },
      }),
    ).toBe(false)
  })
})
