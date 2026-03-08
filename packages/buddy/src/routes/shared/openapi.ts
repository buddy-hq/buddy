import { DirectoryHeader, DirectoryQuery, ErrorSchema } from "../../openapi/compatibility-schemas.js"

export const directoryParameters = [DirectoryHeader, DirectoryQuery]

export const directoryForbiddenResponse = {
  description: "Directory is outside allowed roots",
  content: {
    "application/json": { schema: ErrorSchema },
  },
}
