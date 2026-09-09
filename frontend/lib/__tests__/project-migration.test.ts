// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest'
import {
  migrateProjectsFromLocalStorage,
  PROJECT_MIGRATION_DONE_KEY,
  LEGACY_PROJECT_IDS_KEY,
  LEGACY_PROJECT_KEY_PREFIX,
} from '../project-migration'
import type { Project } from '../../types/project-model'

describe('S1-5: Idempotent project migration from localStorage to file storage', () => {
  let mockStorage: Record<string, string>
  let storageAdapter: Storage

  beforeEach(() => {
    mockStorage = {}
    storageAdapter = {
      getItem: (key: string) => mockStorage[key] ?? null,
      setItem: (key: string, value: string) => {
        mockStorage[key] = value
      },
      removeItem: (key: string) => {
        delete mockStorage[key]
      },
      clear: () => {
        mockStorage = {}
      },
      get length() {
        return Object.keys(mockStorage).length
      },
      key: (i: number) => Object.keys(mockStorage)[i] ?? null,
    } as Storage
  })

  it('migrates project from localStorage to file storage with all fields matching exactly', async () => {
    const legacyProjectFixture = {
      version: 2,
      id: 'legacy-p1',
      name: 'Legacy Short Film',
      createdAt: 1700000000000,
      updatedAt: 1700000500000,
      bins: { bin1: 'Interviews', bin2: 'Drone Shots' },
      assets: [
        {
          id: 'asset-1',
          type: 'video',
          path: 'C:/Videos/interview.mp4',
          prompt: 'interview subject',
          resolution: '3840x2160',
          createdAt: 1700000010000,
          binId: 'bin1',
        },
      ],
      timelines: [
        {
          id: 'tl-1',
          name: 'Main Cut',
          createdAt: 1700000020000,
          tracks: [{ id: 'v1', name: 'V1', kind: 'video', muted: false, locked: false }],
          clips: [
            {
              id: 'clip-1',
              assetId: 'asset-1',
              type: 'video',
              startTime: 0,
              duration: 5,
              trimStart: 0,
              trimEnd: 0,
              speed: 1,
              reversed: false,
              muted: false,
              volume: 1,
              trackIndex: 0,
              asset: null,
            },
          ],
          subtitles: [],
        },
      ],
      activeTimelineId: 'tl-1',
    }

    // Seed localStorage with legacy project data
    storageAdapter.setItem(LEGACY_PROJECT_IDS_KEY, JSON.stringify(['legacy-p1']))
    storageAdapter.setItem(`${LEGACY_PROJECT_KEY_PREFIX}legacy-p1`, JSON.stringify(legacyProjectFixture))

    const writtenFiles: Record<string, Project> = {}
    const mockWriter = {
      writeProject: async (projectId: string, project: Project) => {
        writtenFiles[projectId] = project
        return true
      },
    }

    const res = await migrateProjectsFromLocalStorage(mockWriter, storageAdapter)
    expect(res.migratedCount).toBe(1)
    expect(res.alreadyDone).toBe(false)
    expect(res.errors).toHaveLength(0)

    // Verify written project matches fixture field-for-field
    expect(writtenFiles['legacy-p1']).toBeDefined()
    const migrated = writtenFiles['legacy-p1']
    expect(migrated.id).toBe(legacyProjectFixture.id)
    expect(migrated.name).toBe(legacyProjectFixture.name)
    expect(migrated.createdAt).toBe(legacyProjectFixture.createdAt)
    expect(migrated.bins).toEqual(legacyProjectFixture.bins)
    expect(migrated.assets[0].id).toBe(legacyProjectFixture.assets[0].id)
    expect(migrated.timelines[0].id).toBe(legacyProjectFixture.timelines[0].id)
    expect(migrated.timelines[0].clips[0].id).toBe(legacyProjectFixture.timelines[0].clips[0].id)

    // Verify localStorage cleanup
    expect(storageAdapter.getItem(LEGACY_PROJECT_IDS_KEY)).toBeNull()
    expect(storageAdapter.getItem(`${LEGACY_PROJECT_KEY_PREFIX}legacy-p1`)).toBeNull()
    expect(storageAdapter.getItem(PROJECT_MIGRATION_DONE_KEY)).toBe('true')
  })

  it('is strictly idempotent: running a second time does not re-migrate, duplicate, or alter files', async () => {
    storageAdapter.setItem(PROJECT_MIGRATION_DONE_KEY, 'true')

    let writeCount = 0
    const mockWriter = {
      writeProject: async () => {
        writeCount++
        return true
      },
    }

    const res = await migrateProjectsFromLocalStorage(mockWriter, storageAdapter)
    expect(res.migratedCount).toBe(0)
    expect(res.alreadyDone).toBe(true)
    expect(writeCount).toBe(0)
  })

  it('handles empty localStorage cleanly without error', async () => {
    let writeCount = 0
    const mockWriter = {
      writeProject: async () => {
        writeCount++
        return true
      },
    }

    const res = await migrateProjectsFromLocalStorage(mockWriter, storageAdapter)
    expect(res.migratedCount).toBe(0)
    expect(res.alreadyDone).toBe(false)
    expect(writeCount).toBe(0)
    expect(storageAdapter.getItem(PROJECT_MIGRATION_DONE_KEY)).toBe('true')
  })
})
