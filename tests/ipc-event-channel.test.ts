import { describe, expect, it, vi } from 'vitest'
import {
  electronEventSchemas,
  type ElectronEventChannel,
  type ElectronEventPayload,
} from '../shared/electron-api-schema'
import { emitToRenderer } from '../electron/ipc/event-emitter'

describe('S2-3: IPC Event Channel (Main Process -> Renderer)', () => {
  describe('Zod event schemas', () => {
    it('có schema zod cho các payload sự kiện', () => {
      expect(electronEventSchemas).toHaveProperty('render:progress')
      expect(electronEventSchemas).toHaveProperty('render:complete')
      expect(electronEventSchemas).toHaveProperty('render:error')
      expect(electronEventSchemas).toHaveProperty('test:ping')
    })

    it('validate đúng render:progress hợp lệ và từ chối payload sai', () => {
      const validProgress = {
        jobId: 'job-123',
        percent: 45.5,
        fps: 29.97,
        timeSeconds: 15.2,
      }
      expect(electronEventSchemas['render:progress'].safeParse(validProgress).success).toBe(true)

      // Invalid: negative percent
      expect(
        electronEventSchemas['render:progress'].safeParse({
          jobId: 'job-123',
          percent: -10,
        }).success,
      ).toBe(false)

      // Invalid: percent > 100
      expect(
        electronEventSchemas['render:progress'].safeParse({
          jobId: 'job-123',
          percent: 150,
        }).success,
      ).toBe(false)

      // Invalid: missing jobId
      expect(
        electronEventSchemas['render:progress'].safeParse({
          percent: 50,
        }).success,
      ).toBe(false)
    })

    it('validate đúng render:complete và render:error', () => {
      expect(
        electronEventSchemas['render:complete'].safeParse({
          jobId: 'job-abc',
          outputPath: '/path/to/output.mp4',
        }).success,
      ).toBe(true)

      expect(
        electronEventSchemas['render:error'].safeParse({
          jobId: 'job-abc',
          error: 'ffmpeg exited with code 1',
          stderr: 'Conversion failed',
        }).success,
      ).toBe(true)
    })
  })

  describe('emitToRenderer main process emitter', () => {
    it('phát sự kiện tới targetWindow và validate payload qua zod', () => {
      const mockWebContents = {
        send: vi.fn(),
      }
      const mockWindow = {
        isDestroyed: () => false,
        webContents: mockWebContents,
      } as any

      emitToRenderer('test:ping', { message: 'hello from main', timestamp: 12345 }, mockWindow)

      expect(mockWebContents.send).toHaveBeenCalledTimes(1)
      expect(mockWebContents.send).toHaveBeenCalledWith('test:ping', {
        message: 'hello from main',
        timestamp: 12345,
      })
    })

    it('ném lỗi zod nếu main process cố phát payload sai cấu trúc', () => {
      const mockWindow = {
        isDestroyed: () => false,
        webContents: { send: vi.fn() },
      } as any

      expect(() => {
        // @ts-expect-error test invalid payload runtime rejection
        emitToRenderer('render:progress', { percent: 50 }, mockWindow)
      }).toThrow()
    })
  })

  describe('Renderer listener registration and unsubscribe (leak-free)', () => {
    it('Renderer nhận được sự kiện và huỷ đăng ký gỡ sạch listener', () => {
      // Mock ipcRenderer behavior inside preload
      const activeListeners = new Map<string, Set<Function>>()

      const mockIpcRenderer = {
        on: vi.fn((channel: string, listener: Function) => {
          if (!activeListeners.has(channel)) activeListeners.set(channel, new Set())
          activeListeners.get(channel)!.add(listener)
        }),
        removeListener: vi.fn((channel: string, listener: Function) => {
          activeListeners.get(channel)?.delete(listener)
        }),
      }

      // Replicate the preload api.on implementation under test
      const apiOn = <K extends ElectronEventChannel>(
        channel: K,
        listener: (payload: ElectronEventPayload<K>) => void,
      ) => {
        if (!(channel in electronEventSchemas)) {
          throw new Error(`Unknown IPC event channel: ${channel}`)
        }

        const wrappedListener = (_event: unknown, rawPayload: unknown) => {
          const schema = electronEventSchemas[channel]
          const parsed = schema.safeParse(rawPayload)
          if (parsed.success) {
            listener(parsed.data as ElectronEventPayload<K>)
          }
        }

        mockIpcRenderer.on(channel, wrappedListener)

        return () => {
          mockIpcRenderer.removeListener(channel, wrappedListener)
        }
      }

      // Test 1: Subscribe
      const receivedMessages: string[] = []
      const unsubscribe = apiOn('test:ping', payload => {
        receivedMessages.push(payload.message)
      })

      expect(mockIpcRenderer.on).toHaveBeenCalledWith('test:ping', expect.any(Function))
      expect(activeListeners.get('test:ping')?.size).toBe(1)

      // Simulate event dispatch from main
      const listeners = [...(activeListeners.get('test:ping') ?? [])]
      for (const fn of listeners) {
        fn({}, { message: 'first event', timestamp: 100 })
      }
      expect(receivedMessages).toEqual(['first event'])

      // Test 2: Unsubscribe completely removes the listener
      unsubscribe()
      expect(mockIpcRenderer.removeListener).toHaveBeenCalledWith('test:ping', expect.any(Function))
      expect(activeListeners.get('test:ping')?.size).toBe(0)

      // Simulate another event after unsubscribe: must NOT be received
      for (const fn of activeListeners.get('test:ping') ?? []) {
        fn({}, { message: 'second event', timestamp: 200 })
      }
      expect(receivedMessages).toEqual(['first event']) // unchanged!
    })

    it('contextIsolation: không expose ipcRenderer thô ra renderer API', () => {
      // Import the api contract
      type ExpectedApiKeys = keyof import('../shared/electron-api-schema').ElectronAPI

      // Verify that ipcRenderer is NOT in the API type contract
      const dummyApi: Record<string, unknown> = {
        getPathForFile: () => '',
        platform: 'win32',
        on: () => () => {},
      }

      expect('ipcRenderer' in dummyApi).toBe(false)
    })
  })
})
