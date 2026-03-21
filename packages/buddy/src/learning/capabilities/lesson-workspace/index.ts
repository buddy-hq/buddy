export { TeachingService } from './service/operations'
export {
  TeachingRevisionConflictError,
  TeachingWorkspaceFileError,
  TeachingWorkspaceNotFoundError,
} from './service/errors'
export { teachingTools } from './tools/tools'
export {
  TeachingPromptContextSchema,
  TeachingProvisionRequestSchema,
  TeachingWorkspaceResponseSchema,
  TeachingWorkspaceActivateFileRequestSchema,
  TeachingWorkspaceCreateFileRequestSchema,
  TeachingWorkspaceUpdateRequestSchema,
} from './model/types'
export type {
  TeachingPromptContext,
  TeachingProvisionRequest,
  TeachingWorkspaceActivateFileRequest,
  TeachingWorkspaceCreateFileRequest,
  TeachingWorkspaceUpdateRequest,
} from './model/types'
