import { projectSchema, type Project } from '../types/project-model'
import { logger } from './logger'

// In-memory cache representing current project state.
// Synchronized with atomic file storage via Electron IPC (or file adapter).
const projectMemoryCache = new Map<string, Project>()
let projectIdsMemoryCache: string[] = []

export function getProjectStorageKey(projectId: string): string {
  return `file://projects/${projectId}.json`
}

export function readProjectIds(): string[] {
  return [...projectIdsMemoryCache]
}

export function writeProjectIds(projectIds: string[]): void {
  projectIdsMemoryCache = Array.from(new Set(projectIds))
}

export function readProject(projectId: string): Project | null {
  return projectMemoryCache.get(projectId) ?? null
}

export type WriteProjectSuccess = Project & {
  success: true
  project: Project
}

export interface WriteProjectError {
  success: false
  error: 'StorageError'
  message: string
  originalError?: unknown
}

export type WriteProjectResult = WriteProjectSuccess | WriteProjectError

/**
 * Normalizes and saves project into memory cache and persists to disk via IPC.
 * No browser storage is used for project data.
 */
export function writeProject(projectId: string, project: Project): WriteProjectResult {
  try {
    const normalizedProject = projectSchema.parse({ ...project, id: projectId })

    // Update in-memory cache
    projectMemoryCache.set(projectId, normalizedProject)
    if (!projectIdsMemoryCache.includes(projectId)) {
      projectIdsMemoryCache.unshift(projectId)
    }

    // Persist to file storage asynchronously via Electron IPC if available
    if (typeof window !== 'undefined' && window.electronAPI?.writeProjectFile) {
      window.electronAPI
        .writeProjectFile({
          projectId,
          content: JSON.stringify(normalizedProject, null, 2),
        })
        .catch(err => {
          logger.error(`[ProjectStorage] Failed to persist project ${projectId} to file: ${err}`)
        })
    }

    return {
      success: true,
      project: normalizedProject,
      ...normalizedProject,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logger.error(`[ProjectStorage] Failed to write project ${projectId}: ${message}`)
    return {
      success: false,
      error: 'StorageError',
      message,
      originalError: error,
    }
  }
}

export function deleteProjectEntry(projectId: string): void {
  projectMemoryCache.delete(projectId)
  projectIdsMemoryCache = projectIdsMemoryCache.filter(id => id !== projectId)

  if (typeof window !== 'undefined' && window.electronAPI?.deleteProjectFile) {
    window.electronAPI.deleteProjectFile({ projectId }).catch(err => {
      logger.error(`[ProjectStorage] Failed to delete project file ${projectId}: ${err}`)
    })
  }
}

/**
 * Loads project files from disk via IPC into the memory cache.
 */
export async function loadProjectsFromDisk(): Promise<void> {
  if (typeof window === 'undefined' || !window.electronAPI?.listProjectFiles) {
    return
  }

  try {
    const fileIds = await window.electronAPI.listProjectFiles()
    for (const projectId of fileIds) {
      const res = await window.electronAPI.readProjectFile({ projectId })
      if (res.success && res.content) {
        try {
          const parsed = JSON.parse(res.content)
          const valid = projectSchema.parse(parsed)
          projectMemoryCache.set(projectId, valid)
        } catch (parseErr) {
          logger.error(`[ProjectStorage] Error parsing project file ${projectId}: ${parseErr}`)
        }
      }
    }

    // Retain sorted order of discovered projects
    const discovered = Array.from(projectMemoryCache.keys())
    projectIdsMemoryCache = Array.from(new Set([...projectIdsMemoryCache, ...discovered]))
  } catch (error) {
    logger.error(`[ProjectStorage] Failed to load projects from disk: ${error}`)
  }
}

/**
 * Reloads a single project directly from disk via IPC, bypassing the cache.
 */
export async function loadProjectFromDisk(projectId: string): Promise<Project | null> {
  if (typeof window === 'undefined' || !window.electronAPI?.readProjectFile) {
    return readProject(projectId)
  }

  try {
    const res = await window.electronAPI.readProjectFile({ projectId })
    if (res.success && res.content) {
      const parsed = JSON.parse(res.content)
      const valid = projectSchema.parse(parsed)
      projectMemoryCache.set(projectId, valid)
      if (!projectIdsMemoryCache.includes(projectId)) {
        projectIdsMemoryCache.unshift(projectId)
      }
      return valid
    }
  } catch (err) {
    logger.error(`[ProjectStorage] Failed to reload project ${projectId} from disk: ${err}`)
  }
  return null
}

/**
 * Immediately persists project to disk via IPC and waits for confirmation.
 */
export async function persistProjectToDisk(projectId: string, project: Project): Promise<boolean> {
  writeProject(projectId, project)
  if (typeof window !== 'undefined' && window.electronAPI?.writeProjectFile) {
    try {
      const res = await window.electronAPI.writeProjectFile({
        projectId,
        content: JSON.stringify(project, null, 2),
      })
      return res.success
    } catch {
      return false
    }
  }
  return true
}

/**
 * Helper to populate memory cache directly (useful for tests and initialization).
 */
export function populateProjectStorage(projects: Project[]): void {
  for (const proj of projects) {
    projectMemoryCache.set(proj.id, proj)
    if (!projectIdsMemoryCache.includes(proj.id)) {
      projectIdsMemoryCache.push(proj.id)
    }
  }
}

/**
 * Clears the in-memory cache (useful for tests).
 */
export function clearProjectStorage(): void {
  projectMemoryCache.clear()
  projectIdsMemoryCache = []
}
