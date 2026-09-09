import { describe, it, expect, beforeEach, vi } from 'vitest'
import fs from 'fs'
import path from 'path'
import {
  writeProject,
  readProject,
  readProjectIds,
  writeProjectIds,
  deleteProjectEntry,
  clearProjectStorage,
  loadProjectsFromDisk,
} from '../project-storage'
import { normalizeProject, type Project } from '../../types/project-model'

describe('S1-5: File-backed project storage without localStorage', () => {
  const dummyProject: Project = normalizeProject({
    id: 'test-project-1',
    name: 'Test Project',
    createdAt: 1000,
    updatedAt: 2000,
    assets: [],
  })

  beforeEach(() => {
    clearProjectStorage()
  })

  it('verifies project-storage.ts source code contains ZERO localStorage references', () => {
    const filePath = path.resolve(__dirname, '../project-storage.ts')
    const source = fs.readFileSync(filePath, 'utf-8')

    // Must not contain any localStorage calls
    expect(source.includes('localStorage')).toBe(false)
  })

  it('saves and reads project in memory cache synchronously', () => {
    const result = writeProject('test-project-1', dummyProject)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.project.id).toBe('test-project-1')
      expect(result.project.name).toBe('Test Project')
    }

    const saved = readProject('test-project-1')
    expect(saved).not.toBeNull()
    expect(saved?.id).toBe('test-project-1')
    expect(saved?.name).toBe('Test Project')

    const ids = readProjectIds()
    expect(ids).toContain('test-project-1')
  })

  it('deletes project entry from storage', () => {
    writeProject('p-delete', dummyProject)
    expect(readProject('p-delete')).not.toBeNull()

    deleteProjectEntry('p-delete')
    expect(readProject('p-delete')).toBeNull()
    expect(readProjectIds()).not.toContain('p-delete')
  })

  it('manages project IDs list correctly', () => {
    writeProjectIds(['p1', 'p2', 'p3', 'p2'])
    const ids = readProjectIds()
    expect(ids).toEqual(['p1', 'p2', 'p3'])
  })

  it('syncs with window.electronAPI when available', async () => {
    const mockWrite = vi.fn().mockResolvedValue({ success: true })
    const mockList = vi.fn().mockResolvedValue(['disk-p1'])
    const mockRead = vi.fn().mockResolvedValue({
      success: true,
      content: JSON.stringify(dummyProject),
    })

    vi.stubGlobal('window', {
      electronAPI: {
        writeProjectFile: mockWrite,
        listProjectFiles: mockList,
        readProjectFile: mockRead,
      },
    })

    // Writing project invokes IPC
    writeProject('test-project-1', dummyProject)
    expect(mockWrite).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'test-project-1',
      }),
    )

    // Loading from disk populates memory cache
    await loadProjectsFromDisk()
    expect(mockList).toHaveBeenCalled()
    expect(mockRead).toHaveBeenCalledWith({ projectId: 'disk-p1' })
    expect(readProject('test-project-1')).not.toBeNull()

    vi.unstubAllGlobals()
  })
})
