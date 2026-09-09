/// <reference types="vite/client" />

import type { ElectronAPI } from '../shared/electron-api-schema'
import type {
  RollbackProjectReferencesMigrationOptions,
  RollbackProjectReferencesMigrationResult,
} from './lib/project-storage-devtools'

declare global {
  interface Window {
    electronAPI: ElectronAPI
    __komfyProjectStorageDebug?: {
      rollbackProjectReferencesMigration: (
        options?: RollbackProjectReferencesMigrationOptions
      ) => RollbackProjectReferencesMigrationResult
    }
  }
}
