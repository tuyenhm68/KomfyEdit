import { handle } from './typed-handle'
import {
  getProjectsDir,
  listProjectFiles,
  readProjectFromFile,
  writeProjectFileAtomic,
  deleteProjectFile,
} from '../storage/project-file-storage'

export function registerProjectHandlers(): void {
  handle('getProjectsDir', () => {
    return { path: getProjectsDir() }
  })

  handle('listProjectFiles', () => {
    const projectsDir = getProjectsDir()
    return listProjectFiles(projectsDir)
  })

  handle('readProjectFile', ({ projectId }) => {
    const projectsDir = getProjectsDir()
    const result = readProjectFromFile(projectsDir, projectId)
    if (!result.success) {
      return { success: false, error: result.error }
    }
    return { success: true, content: result.content }
  })

  handle('writeProjectFile', ({ projectId, content }) => {
    const projectsDir = getProjectsDir()
    const result = writeProjectFileAtomic(projectsDir, projectId, content)
    if (!result.success) {
      return { success: false, error: result.error }
    }
    return { success: true, path: result.path }
  })

  handle('deleteProjectFile', ({ projectId }) => {
    const projectsDir = getProjectsDir()
    const result = deleteProjectFile(projectsDir, projectId)
    if (!result.success) {
      return { success: false, error: result.error }
    }
    return { success: true }
  })
}
