import {
  HIGHLIGHT_SYSTEM_INSTRUCTION,
  buildHighlightExtractionPrompt,
  parseHighlightResponse,
} from '../../core/src/auto-highlight'
import { getAllowedRoots } from '../config'
import { runOneShot } from '../editpilot/agent-runner'
import { logger } from '../logger'
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
      onProgress: (phase, percent, step, detail) => {
        emitToRenderer('whisper:progress', {
          jobId: params.jobId,
          phase,
          percent,
          step,
          detail,
        })
      },
    })
  })

  handle('whisperCancel', async ({ jobId }) => {
    const cancelled = whisperService.cancelJob(jobId)
    return { success: cancelled }
  })

  /**
   * Picking highlights needs a model, not a transcription service.
   *
   * The CLI the user already configured in EditPilot goes first: it is a model
   * they are already paying for, so the feature stops needing a separate
   * OpenAI key. The OpenAI path stays as the fallback — for no CLI installed,
   * a CLI that fails, or a reply no JSON could be read out of — because
   * dropping it would silently take the feature away from whoever is using it
   * today.
   */
  handle('whisperExtractHighlights', async (params) => {
    if (!params.transcriptText.trim()) {
      return { success: false, error: 'EMPTY_TRANSCRIPT' }
    }

    const prompt = `${HIGHLIGHT_SYSTEM_INSTRUCTION}\n\n${buildHighlightExtractionPrompt(
      params.transcriptText,
      params.maxItems ?? 4,
    )}`

    try {
      const cli = await runOneShot({ prompt })
      if (cli) {
        const highlights = parseHighlightResponse(cli.text)
        if (highlights.length > 0) {
          logger.info(`[whisper] Highlight qua ${cli.agentLabel}: ${highlights.length} đoạn`)
          return { success: true, highlights }
        }
        logger.warn(`[whisper] ${cli.agentLabel} không trả về JSON đọc được; chuyển sang OpenAI`)
      }
    } catch (err: any) {
      logger.warn(`[whisper] Hỏi CLI thất bại (${err?.message}); chuyển sang OpenAI`)
    }

    return whisperService.analyzeHighlightsWithLlm(params)
  })
}

