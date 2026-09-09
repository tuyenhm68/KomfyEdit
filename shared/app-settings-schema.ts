import { z } from 'zod'

export const appLanguageSchema = z.enum(['en', 'vi'])
export type AppLanguage = z.infer<typeof appLanguageSchema>

export const cachePolicySchema = z.enum(['keep', 'auto-30-days'])
export type CachePolicy = z.infer<typeof cachePolicySchema>

export const timecodeFormatSchema = z.enum(['timecode', 'frames'])
export type TimecodeFormat = z.infer<typeof timecodeFormatSchema>

export const whisperProviderSchema = z.enum(['cloud', 'self-hosted'])
export type WhisperProvider = z.infer<typeof whisperProviderSchema>

export const appSettingsSchema = z.object({
  // General & i18n
  language: appLanguageSchema.default('en'),
  autoSave: z.boolean().default(true),
  autoSaveIntervalMinutes: z.number().int().min(0).max(30).default(1),
  exportNotifications: z.boolean().default(true),

  // Drafts & Storage
  projectsDir: z.string().default(''),
  defaultExportDir: z.string().default(''),
  cachePolicy: cachePolicySchema.default('keep'),
  presetsDir: z.string().default(''),

  // Edit Defaults
  defaultImageDuration: z.number().min(0.5).max(60).default(3.0),
  defaultTransitionDuration: z.number().min(0.1).max(5).default(0.5),
  defaultFps: z.number().int().default(30),
  timecodeFormat: timecodeFormatSchema.default('timecode'),

  // Performance
  hardwareAcceleration: z.boolean().default(true),
  hardwareDecode: z.boolean().default(true),
  gpuUiRendering: z.boolean().default(true),
  proxyEnabled: z.boolean().default(false),
  audioOutputDeviceId: z.string().default('default'),

  // Speech Recognition (Whisper / OpenAI Audio API)
  whisperProvider: whisperProviderSchema.default('self-hosted'),
  whisperEndpoint: z.string().default('http://localhost:8000/v1'),
  whisperApiKey: z.string().default(''),
  whisperModel: z.string().default('whisper-1'),
  whisperLanguage: z.string().default(''),
  whisperPrompt: z.string().default(''),
})

export type AppSettings = z.infer<typeof appSettingsSchema>

export const DEFAULT_APP_SETTINGS: AppSettings = appSettingsSchema.parse({})
