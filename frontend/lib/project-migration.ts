import { migrateProjectData, type Project } from '../types/project-model'
import { logger } from './logger'

export const PROJECT_MIGRATION_DONE_KEY = 'komfyedit-project-migrated-to-file'
export const LEGACY_PROJECT_IDS_KEY = 'komfyedit-project-ids'
export const LEGACY_PROJECT_KEY_PREFIX = 'komfyedit-project-'

// Aliases for legacy reference migration hook
export const PROJECT_IDS_STORAGE_KEY = LEGACY_PROJECT_IDS_KEY
export const PROJECT_STORAGE_KEY_PREFIX = LEGACY_PROJECT_KEY_PREFIX
export function getProjectStorageKey(projectId: string): string {
  return `${LEGACY_PROJECT_KEY_PREFIX}${projectId}`
}

export interface ProjectFileWriter {
  writeProject: (projectId: string, project: Project) => Promise<boolean> | boolean
}

export interface MigrationResult {
  migratedCount: number
  alreadyDone: boolean
  errors: string[]
}

/**
 * Migrates projects from browser localStorage to file storage.
 * Idempotent: running multiple times will not duplicate or lose data.
 * Once all projects are persisted to file, localStorage project entries are cleaned up.
 */
export async function migrateProjectsFromLocalStorage(
  storageWriter: ProjectFileWriter,
  storage: Storage = typeof localStorage !== 'undefined' ? localStorage : ({} as Storage),
): Promise<MigrationResult> {
  const result: MigrationResult = {
    migratedCount: 0,
    alreadyDone: false,
    errors: [],
  }

  if (!storage || typeof storage.getItem !== 'function') {
    return result
  }

  // Check if already migrated
  if (storage.getItem(PROJECT_MIGRATION_DONE_KEY) === 'true') {
    result.alreadyDone = true
    return result
  }

  try {
    // 1. Discover all project IDs from localStorage
    const projectIds = new Set<string>()

    const rawIds = storage.getItem(LEGACY_PROJECT_IDS_KEY)
    if (rawIds) {
      try {
        const parsed = JSON.parse(rawIds)
        if (Array.isArray(parsed)) {
          for (const id of parsed) {
            if (typeof id === 'string') projectIds.add(id)
          }
        }
      } catch {
        // Ignore parse error on IDs
      }
    }

    // Also scan all keys for komfyedit-project-* (excluding index key)
    const keysToRemove: string[] = []
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i)
      if (key === LEGACY_PROJECT_IDS_KEY) continue
      if (key && key.startsWith(LEGACY_PROJECT_KEY_PREFIX)) {
        const id = key.slice(LEGACY_PROJECT_KEY_PREFIX.length)
        if (id) {
          projectIds.add(id)
          keysToRemove.push(key)
        }
      }
    }

    if (rawIds) {
      keysToRemove.push(LEGACY_PROJECT_IDS_KEY)
    }

    if (projectIds.size === 0) {
      // Nothing to migrate, mark done
      storage.setItem(PROJECT_MIGRATION_DONE_KEY, 'true')
      return result
    }

    // 2. Read each project, migrate data, and write to file
    const successfulKeysToRemove: string[] = []
    for (const projectId of projectIds) {
      const key = `${LEGACY_PROJECT_KEY_PREFIX}${projectId}`
      const rawData = storage.getItem(key)
      if (!rawData) continue

      try {
        const parsedJson = JSON.parse(rawData)
        const { project } = migrateProjectData(parsedJson)
        const normalizedProject: Project = { ...project, id: projectId }

        const success = await storageWriter.writeProject(projectId, normalizedProject)
        if (success) {
          result.migratedCount++
          successfulKeysToRemove.push(key)
        } else {
          result.errors.push(`Failed to write project ${projectId} to file storage`)
        }
      } catch (err) {
        result.errors.push(`Failed to migrate project ${projectId}: ${err}`)
      }
    }

    // 3. If all succeeded without error, clean up localStorage and set migration flag
    if (result.errors.length === 0) {
      for (const k of successfulKeysToRemove) {
        storage.removeItem(k)
      }
      storage.removeItem(LEGACY_PROJECT_IDS_KEY)
      storage.setItem(PROJECT_MIGRATION_DONE_KEY, 'true')
      logger.info(`[Migration] Successfully migrated ${result.migratedCount} projects from localStorage to files`)
    } else {
      logger.error(`[Migration] Migration had ${result.errors.length} errors; keeping localStorage backup`)
    }

    return result
  } catch (error) {
    result.errors.push(`Unexpected migration failure: ${error}`)
    return result
  }
}
