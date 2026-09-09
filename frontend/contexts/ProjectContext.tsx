import React, { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { hasLegacyProjectsEntry } from '../hooks/useProjectReferencesMigration'
import { createDefaultTimeline, normalizeProject, type Project, type Asset } from '../types/project-model'
import { useSettings } from './SettingsContext'
import {
  deleteProjectEntry,
  readProject,
  readProjectIds,
  writeProject,
  writeProjectIds,
  loadProjectsFromDisk,
  loadProjectFromDisk,
} from '../lib/project-storage'
import { migrateProjectsFromLocalStorage } from '../lib/project-migration'

interface ProjectContextType {
  projectIds: string[]
  activeProject: Project | null
  getProject: (id: string) => Project | null
  setProject: (id: string, project: Project) => void
  createProject: (name: string) => Project
  deleteProject: (id: string) => void
  renameProject: (id: string, name: string) => void
  activateProject: (id: string) => void
  clearActiveProject: () => void
  reloadProjectIds: () => void
  reloadActiveProjectFromDisk: () => Promise<Project | null>
  storageError: string | null
  clearStorageError: () => void

  addAsset: (projectId: string, asset: Omit<Asset, 'id' | 'createdAt'>) => Asset
  deleteAsset: (projectId: string, assetId: string) => void
  updateAsset: (projectId: string, assetId: string, updates: Partial<Asset>) => void
  toggleFavorite: (projectId: string, assetId: string) => void
}

const ProjectContext = createContext<ProjectContextType | null>(null)

function loadInitialProjectIds(): string[] {
  if (hasLegacyProjectsEntry()) return []
  return readProjectIds()
}

export function ProjectProvider({ children }: { children: React.ReactNode }) {
  const { settings } = useSettings()
  const [projectIds, setProjectIds] = useState<string[]>(() => loadInitialProjectIds())
  const [activeProject, setActiveProject] = useState<Project | null>(null)
  const [projectRevision, setProjectRevision] = useState(0)
  const [storageError, setStorageError] = useState<string | null>(null)

  const clearStorageError = useCallback(() => setStorageError(null), [])

  const bumpProjectRevision = useCallback(() => {
    setProjectRevision(prev => prev + 1)
  }, [])

  useEffect(() => {
    async function initStorage() {
      // 1. Migrate any legacy localStorage projects to file
      await migrateProjectsFromLocalStorage({
        writeProject: (id, proj) => {
          const res = writeProject(id, proj)
          return res.success
        },
      })
      // 2. Load projects from disk
      await loadProjectsFromDisk()
      // 3. Refresh project IDs list in context
      const ids = readProjectIds()
      setProjectIds(ids)
      bumpProjectRevision()
    }
    initStorage()
  }, [bumpProjectRevision])

  const getProject = useCallback((id: string): Project | null => readProject(id), [projectRevision])

  const reloadProjectIds = useCallback(() => {
    const nextProjectIds = hasLegacyProjectsEntry() ? [] : readProjectIds()
    setProjectIds(nextProjectIds)
    setActiveProject(prev => (
      prev && nextProjectIds.includes(prev.id) ? prev : null
    ))
    bumpProjectRevision()
  }, [bumpProjectRevision])

  const activateProject = useCallback((id: string) => {
    setActiveProject(readProject(id))
  }, [])

  const clearActiveProject = useCallback(() => {
    setActiveProject(null)
  }, [])

  const reloadActiveProjectFromDisk = useCallback(async (): Promise<Project | null> => {
    if (!activeProject?.id) return null
    const reloaded = await loadProjectFromDisk(activeProject.id)
    if (reloaded) {
      setActiveProject(reloaded)
      bumpProjectRevision()
      return reloaded
    }
    return null
  }, [activeProject?.id, bumpProjectRevision])

  const persistProject = useCallback((projectId: string, project: Project): Project | null => {
    const result = writeProject(projectId, normalizeProject({ ...project, id: projectId }))
    if (!result.success) {
      setStorageError(`Storage error: ${result.message}`)
      return null
    }
    setStorageError(null)
    const persistedProject = result.project
    setActiveProject(prev => (prev?.id === projectId ? persistedProject : prev))
    bumpProjectRevision()
    return persistedProject
  }, [bumpProjectRevision])

  const mutateProject = useCallback((projectId: string, updater: (project: Project) => Project): Project | null => {
    const project = readProject(projectId)
    if (!project) return null
    return persistProject(projectId, updater(project))
  }, [persistProject])

  const setProject = useCallback((projectId: string, project: Project) => {
    persistProject(projectId, project)
  }, [persistProject])

  const createProject = useCallback((name: string): Project => {
    const defaultTimeline = createDefaultTimeline('Timeline 1', settings.defaultFps)
    const newProject = normalizeProject({
      id: `project-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      assets: [],
      timelines: [defaultTimeline],
      activeTimelineId: defaultTimeline.id,
    })

    const writeResult = writeProject(newProject.id, newProject)
    if (!writeResult.success) {
      setStorageError(`Storage error: ${writeResult.message}`)
      return newProject
    }
    const persistedProject = writeResult.project
    const nextProjectIds = [persistedProject.id, ...readProjectIds().filter(id => id !== persistedProject.id)]
    writeProjectIds(nextProjectIds)
    setProjectIds(nextProjectIds)
    bumpProjectRevision()
    return persistedProject
  }, [bumpProjectRevision, settings.defaultFps])

  const deleteProject = useCallback((id: string) => {
    const nextProjectIds = readProjectIds().filter(projectId => projectId !== id)
    writeProjectIds(nextProjectIds)
    setProjectIds(nextProjectIds)
    deleteProjectEntry(id)
    setActiveProject(prev => (prev?.id === id ? null : prev))
    bumpProjectRevision()
  }, [bumpProjectRevision])

  const renameProject = useCallback((id: string, name: string) => {
    mutateProject(id, project => ({
      ...project,
      name,
      updatedAt: Date.now(),
    }))
  }, [mutateProject])

  const addAsset = useCallback((projectId: string, assetData: Omit<Asset, 'id' | 'createdAt'>): Asset => {
    const newAsset: Asset = {
      ...assetData,
      id: `asset-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      createdAt: Date.now(),
    }

    mutateProject(projectId, project => ({
      ...project,
      assets: [newAsset, ...project.assets],
      updatedAt: Date.now(),
    }))

    return newAsset
  }, [mutateProject])

  const deleteAsset = useCallback((projectId: string, assetId: string) => {
    mutateProject(projectId, project => ({
      ...project,
      assets: project.assets.filter(asset => asset.id !== assetId),
      updatedAt: Date.now(),
    }))
  }, [mutateProject])

  const updateAsset = useCallback((projectId: string, assetId: string, updates: Partial<Asset>) => {
    mutateProject(projectId, project => ({
      ...project,
      assets: project.assets.map(asset => (
        asset.id === assetId ? { ...asset, ...updates } : asset
      )),
      updatedAt: Date.now(),
    }))
  }, [mutateProject])

  const toggleFavorite = useCallback((projectId: string, assetId: string) => {
    mutateProject(projectId, project => ({
      ...project,
      assets: project.assets.map(asset => (
        asset.id === assetId ? { ...asset, favorite: !asset.favorite } : asset
      )),
      updatedAt: Date.now(),
    }))
  }, [mutateProject])

  return (
    <ProjectContext.Provider value={{
      projectIds,
      activeProject,
      getProject,
      setProject,
      createProject,
      deleteProject,
      renameProject,
      activateProject,
      clearActiveProject,
      reloadProjectIds,
      reloadActiveProjectFromDisk,
      addAsset,
      deleteAsset,
      updateAsset,
      toggleFavorite,
      storageError,
      clearStorageError,
    }}>
      {children}
      {storageError && (
        <div
          role="alert"
          aria-live="assertive"
          className="fixed bottom-6 right-6 z-50 max-w-md bg-red-950/95 border border-red-500 text-red-100 p-4 rounded-lg shadow-2xl backdrop-blur flex flex-col gap-2"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="font-semibold text-red-200 flex items-center gap-2 text-sm">
              <span className="text-red-400 text-base">⚠️</span>
              Storage Error
            </div>
            <button
              onClick={clearStorageError}
              className="text-red-300 hover:text-white text-xs px-2 py-1 rounded bg-red-900/60 hover:bg-red-800 transition-colors"
            >
              Dismiss
            </button>
          </div>
          <p className="text-xs text-red-300 leading-relaxed">{storageError}</p>
        </div>
      )}
    </ProjectContext.Provider>
  )
}

export function useProjects() {
  const context = useContext(ProjectContext)
  if (!context) {
    throw new Error('useProjects must be used within a ProjectProvider')
  }
  return context
}
