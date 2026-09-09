import { getAllowedRoots } from '../config'
import { validatePath } from '../path-validation'
import { whisperService } from '../whisper/whisper-service'
import { emitToRenderer } from './event-emitter'
import { handle } from './typed-handle'

export function registerWhisperHandlers(): void {
  handle('whisperTestConnection', async ({ endpoint, apiKey }) => {
    return whisperService.testConnection(endpoint, apiKey)
  })

  handle('whisperSaveSecureKey', async ({ apiKey }) => {
    return whisperService.saveSecureApiKey(apiKey)
  })

  handle('whisperGetSecureKey', async () => {
    const res = whisperService.getStoredApiKey()
    const masked = res.apiKey
      ? res.apiKey.length > 8
        ? `${res.apiKey.slice(0, 3)}...${res.apiKey.slice(-4)}`
        : '••••••••'
      : ''
    return {
      hasKey: res.hasKey,
      maskedKey: masked,
      isEncrypted: res.isEncrypted,
    }
  })

  handle('whisperTranscribe', async (params) => {
    const normalizedPath = validatePath(params.filePath, getAllowedRoots())

    return whisperService.transcribe({
      jobId: params.jobId,
      filePath: normalizedPath,
      startTime: params.startTime,
      duration: params.duration,
      endpoint: params.endpoint,
      apiKey: params.apiKey,
      model: params.model,
      language: params.language,
      prompt: params.prompt,
      temperature: params.temperature,
      onProgress: (phase, percent, message) => {
        emitToRenderer('whisper:progress', {
          jobId: params.jobId,
          phase,
          percent,
          message,
        })
      },
    })
  })

  handle('whisperCancel', async ({ jobId }) => {
    const cancelled = whisperService.cancelJob(jobId)
    return { success: cancelled }
  })

  handle('whisperExtractHighlights', async (params) => {
    return whisperService.analyzeHighlightsWithLlm(params)
  })
}

