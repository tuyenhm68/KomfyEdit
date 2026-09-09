import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import {
  writeProjectFileAtomic,
  readProjectFromFile,
  deleteProjectFile,
  listProjectFiles,
} from '../project-file-storage'

describe('S1-5: Atomic project file storage (Electron main process)', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'komfyedit-test-projects-'))
  })

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true })
    } catch {
      // Cleanup best effort
    }
  })

  it('performs round-trip write and read of project file intact', () => {
    const projectId = 'proj-roundtrip-123'
    const content = JSON.stringify({
      version: 2,
      id: projectId,
      name: 'Test Project Roundtrip',
      createdAt: 1000,
      updatedAt: 2000,
      bins: { bin1: 'B-Roll' },
      assets: [],
      timelines: [],
    })

    const writeRes = writeProjectFileAtomic(tempDir, projectId, content)
    expect(writeRes.success).toBe(true)

    const readRes = readProjectFromFile(tempDir, projectId)
    expect(readRes.success).toBe(true)
    if (readRes.success) {
      expect(readRes.content).toBe(content)
      const parsed = JSON.parse(readRes.content)
      expect(parsed.id).toBe(projectId)
      expect(parsed.name).toBe('Test Project Roundtrip')
      expect(parsed.bins).toEqual({ bin1: 'B-Roll' })
    }
  })

  it('atomically preserves existing file when a write operation is interrupted or fails', () => {
    const projectId = 'proj-atomic-safeguard'
    const originalContent = JSON.stringify({ id: projectId, name: 'Original Stable Version' })

    // Initial valid write
    const initialWrite = writeProjectFileAtomic(tempDir, projectId, originalContent)
    expect(initialWrite.success).toBe(true)

    // Simulate interrupted write by making target file read-only or intercepting renameSync
    const renameSpy = vi.spyOn(fs, 'renameSync').mockImplementationOnce(() => {
      throw new Error('Disk power loss / write interrupted during atomic rename')
    })

    const failingContent = JSON.stringify({ id: projectId, name: 'Corrupted Incomplete Version' })
    const failedWrite = writeProjectFileAtomic(tempDir, projectId, failingContent)

    expect(failedWrite.success).toBe(false)

    // Verify existing file is completely intact with originalContent
    const readAfterFail = readProjectFromFile(tempDir, projectId)
    expect(readAfterFail.success).toBe(true)
    if (readAfterFail.success) {
      expect(readAfterFail.content).toBe(originalContent)
    }

    // Verify no temporary files remain leaked
    const files = fs.readdirSync(tempDir)
    const tempFiles = files.filter(f => f.includes('.tmp.'))
    expect(tempFiles.length).toBe(0)

    renameSpy.mockRestore()
  })

  it('lists existing project IDs and excludes temporary files', () => {
    writeProjectFileAtomic(tempDir, 'proj-1', JSON.stringify({ id: 'proj-1' }))
    writeProjectFileAtomic(tempDir, 'proj-2', JSON.stringify({ id: 'proj-2' }))

    // Create a rogue temp file
    fs.writeFileSync(path.join(tempDir, '.proj-rogue.tmp.12345'), 'interrupted')

    const list = listProjectFiles(tempDir)
    expect(list).toContain('proj-1')
    expect(list).toContain('proj-2')
    expect(list).not.toContain('.proj-rogue')
    expect(list.length).toBe(2)
  })

  it('deletes project file cleanly', () => {
    const projectId = 'proj-to-delete'
    writeProjectFileAtomic(tempDir, projectId, JSON.stringify({ id: projectId }))
    expect(listProjectFiles(tempDir)).toContain(projectId)

    const deleteRes = deleteProjectFile(tempDir, projectId)
    expect(deleteRes.success).toBe(true)
    expect(listProjectFiles(tempDir)).not.toContain(projectId)

    // Deleting non-existent file is safe
    expect(deleteProjectFile(tempDir, 'non-existent').success).toBe(true)
  })
})
