const directoryDocumentSchema = {
  type: "object",
  properties: {
    directory: { type: "string" },
  },
  required: ["directory"],
  additionalProperties: false,
}

export { directoryDocumentSchema }
