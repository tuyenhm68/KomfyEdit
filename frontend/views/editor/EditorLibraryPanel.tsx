import { useState, useMemo, useRef, useEffect } from 'react'
import {
  Captions,
  FileUp,
  Music2,
  Sparkles,
  Type,
  Keyboard,
  MoveUp,
  MoveRight,
  Eye,
  Zap,
  Search,
  Plus,
  Upload,
  X,
  Settings,
  Loader2,
  CheckCircle,
  AlertCircle,
} from 'lucide-react'
import { EFFECT_DEFINITIONS } from '../../types/project'
import type { Asset, EffectType } from '../../types/project-model'
import { TEXT_PRESETS, TEXT_ANIMATIONS, SUBTITLE_PRESETS, getSubtitlePreset } from '@core/text-presets'
import { STICKER_DEFINITIONS, STICKER_CATEGORIES, type StickerCategory } from '@core/stickers'
import { whisperSegmentsToSrtCues } from '@core/whisper-types'
import { makeId } from '@core/id-generator'
import type { HighlightCandidate } from '@core/auto-highlight'
import { buildHighlightEditPatch } from '@core/auto-highlight'
import { detectBrollOpportunities, type BrollOpportunity } from '@core/broll-copilot'
import { applyEditPatchToState } from '@core/edit-patch'
import { pathToFileUrl } from '../../lib/file-url'
import { useSettings } from '../../contexts/SettingsContext'
import { useTranslation } from '../../i18n/I18nContext'
import type { LibraryTab } from './editor-state'
import { selectClips, selectSelectedClipIds } from './editor-selectors'
import { useEditorActions, useEditorStore, useEditorStoreApi } from './editor-store'
import { TransitionsLibrary } from './TransitionsLibrary'
import { FiltersLibrary } from './FiltersLibrary'
import {
  VideoEditorAssetsPanel,
  type VideoEditorAssetsPanelHandle,
} from './VideoEditorAssetsPanel'

export interface EditorLibraryPanelProps {
  tab: LibraryTab
  section: string
  assetsPanelRef: React.Ref<VideoEditorAssetsPanelHandle>
  openSourceAsset: (asset: Asset) => void
  handleImportFile: (e: React.ChangeEvent<HTMLInputElement>) => void
  importFiles: (files: FileList | File[]) => Promise<unknown>
  onImportSrt: () => void
}

/**
 * The panel to the right of the sub-nav. Media and Audio browse project
 * assets with appropriate filters; the rest render their own pickers.
 */
export function EditorLibraryPanel(props: EditorLibraryPanelProps) {
  const { tab, section } = props

  if (tab === 'media') {
    return (
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <VideoEditorAssetsPanel
          ref={props.assetsPanelRef}
          openSourceAsset={props.openSourceAsset}
          handleImportFile={props.handleImportFile}
          importFiles={props.importFiles}
          mediaTypeFilter="all"
        />
      </div>
    )
  }

  if (tab === 'audio') {
    if (section === 'extract') {
      return (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-zinc-950">
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            <ExtractAudioExplanation />
          </div>
        </div>
      )
    }

    return (
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <VideoEditorAssetsPanel
          ref={props.assetsPanelRef}
          openSourceAsset={props.openSourceAsset}
          handleImportFile={props.handleImportFile}
          importFiles={props.importFiles}
          mediaTypeFilter="audio"
        />
      </div>
    )
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-zinc-950">
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {tab === 'text' && <TextLibrary section={section} />}
        {tab === 'filters' && <FiltersLibrary />}
        {(tab === 'effects' || tab === 'adjust') && (
          <EffectLibrary tab={tab} />
        )}
        {tab === 'captions' && (
          <CaptionsLibrary section={section} onImportSrt={props.onImportSrt} />
        )}
        {tab === 'transitions' && <TransitionsLibrary />}
        {tab === 'stickers' && (
          <StickersLibrary importFiles={props.importFiles} />
        )}
      </div>
    </div>
  )
}

function ExtractAudioExplanation() {
  const { t } = useTranslation()
  const actions = useEditorActions()
  const clips = useEditorStore(selectClips)
  const selectedClipIds = useEditorStore(selectSelectedClipIds)

  const selectedVideoClips = clips.filter(
    c => selectedClipIds.has(c.id) && c.type === 'video' && !c.linkedClipIds?.some(id => clips.find(x => x.id === id)?.type === 'audio'),
  )

  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-4 text-center">
      <Music2 className="h-7 w-7 text-zinc-600" />
      <p className="text-[12px] font-medium text-zinc-300">{t('library.audio.extractTitle')}</p>
      {selectedVideoClips.length > 0 ? (
        <button
          onClick={() => {
            for (const clip of selectedVideoClips) {
              actions.detachAudio(clip.id)
            }
          }}
          className="flex items-center gap-2 rounded-[6px] bg-accent px-3 py-2 text-[12px] font-medium text-zinc-950 transition-colors hover:bg-accent/90"
        >
          <Music2 className="h-4 w-4" />
          {selectedVideoClips.length === 1
            ? t('library.audio.extractBtnSingle')
            : t('library.audio.extractBtnMultiple', { count: selectedVideoClips.length })}
        </button>
      ) : (
        <p className="max-w-[260px] text-[11px] leading-relaxed text-zinc-500">
          {t('library.audio.extractHint')}
        </p>
      )}
    </div>
  )
}

/* ── Text ── */

/* ── Text ── */

function TextLibrary({ section }: { section: string }) {
  const { t } = useTranslation()
  const actions = useEditorActions()
  const clips = useEditorStore(selectClips)
  const selectedClipIds = useEditorStore(selectSelectedClipIds)

  const selectedTextClip = clips.find(
    c => selectedClipIds.has(c.id) && c.type === 'text',
  )

  const showTemplates = section === 'text-templates' || section === 'add-text' || !section
  const showEffects = section === 'text-effects' || section === 'add-text' || !section

  const handleApplyPreset = (presetId: string, style?: any) => {
    if (selectedTextClip) {
      actions.applyTextPresetToClip(selectedTextClip.id, presetId)
    } else {
      actions.addTextClip({ preset: presetId, style })
    }
  }

  const handleApplyAnimation = (animId: string) => {
    if (selectedTextClip) {
      actions.applyTextAnimationToClip(selectedTextClip.id, animId)
    } else {
      actions.addTextClip({ animation: animId })
    }
  }

  const animIcons: Record<string, React.ReactNode> = {
    'fly-in': <MoveUp className="h-4 w-4 text-cyan-400" />,
    'slide-in': <MoveRight className="h-4 w-4 text-emerald-400" />,
    'fade-in': <Eye className="h-4 w-4 text-violet-400" />,
    'pop': <Zap className="h-4 w-4 text-amber-400" />,
    'typewriter': <Keyboard className="h-4 w-4 text-pink-400" />,
  }

  return (
    <div className="space-y-4">
      {selectedTextClip && (
        <div className="rounded-[6px] bg-cyan-950/40 border border-cyan-800/40 px-3 py-2 text-[11px] text-cyan-300">
          {t('library.text.selectedNotice')}
        </div>
      )}

      {/* Basic Text Button */}
      {section !== 'text-effects' && (
        <div>
          <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">{t('library.text.basicTitle')}</h4>
          <button
            onClick={() => actions.addTextClip({})}
            className="flex h-[68px] w-full items-center gap-3 rounded-[6px] bg-zinc-900 px-4 text-zinc-200 transition-colors hover:bg-zinc-800 border border-white/5 hover:border-white/10"
            title={t('library.text.addDefaultTitle')}
          >
            <div className="flex h-10 w-10 items-center justify-center rounded bg-zinc-800 text-zinc-200">
              <Type className="h-5 w-5" />
            </div>
            <div className="text-left">
              <div className="text-[12px] font-medium text-zinc-200">{t('library.text.defaultText')}</div>
              <div className="text-[10px] text-zinc-500">{t('library.text.defaultTextDesc')}</div>
            </div>
          </button>
        </div>
      )}

      {/* Presets Grid */}
      {showTemplates && (
        <div>
          <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
            {t('library.text.stylePresets', { count: TEXT_PRESETS.length })}
          </h4>
          <div className="grid grid-cols-2 gap-2">
            {TEXT_PRESETS.map((preset) => {
              const st = preset.style
              return (
                <button
                  key={preset.id}
                  onClick={() => handleApplyPreset(preset.id, st)}
                  className="group flex flex-col overflow-hidden rounded-[6px] border border-white/5 bg-zinc-900 transition-all hover:border-accent/50 hover:bg-zinc-850 text-left"
                  title={`${preset.name}: ${preset.description}`}
                >
                  <div
                    className="flex h-[56px] w-full items-center justify-center overflow-hidden p-2"
                    style={{
                      backgroundColor: st.backgroundColor && st.backgroundColor !== 'transparent' && !st.backgroundColor.startsWith('rgba(0,0,0') ? '#18181b' : '#121214',
                    }}
                  >
                    <span
                      style={{
                        fontFamily: st.fontFamily || 'sans-serif',
                        fontWeight: st.fontWeight || 'bold',
                        fontStyle: st.fontStyle || 'normal',
                        color: st.color || '#FFFFFF',
                        backgroundColor: st.backgroundColor || 'transparent',
                        padding: st.padding ? `${Math.min(st.padding, 6)}px` : undefined,
                        borderRadius: st.borderRadius ? `${Math.min(st.borderRadius, 4)}px` : undefined,
                        letterSpacing: st.letterSpacing ? `${st.letterSpacing}px` : undefined,
                        textShadow: st.shadowBlur ? `${st.shadowOffsetX || 0}px ${st.shadowOffsetY || 0}px ${st.shadowBlur}px ${st.shadowColor || 'black'}` : undefined,
                        WebkitTextStroke: st.strokeWidth && st.strokeColor ? `${st.strokeWidth}px ${st.strokeColor}` : undefined,
                        fontSize: '15px',
                        lineHeight: 1,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      Aa Text
                    </span>
                  </div>
                  <div className="px-2 py-1.5 border-t border-white/5">
                    <div className="truncate text-[11px] font-medium text-zinc-300 group-hover:text-zinc-100">
                      {preset.name}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Animations Grid */}
      {showEffects && (
        <div>
          <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
            {t('library.text.animations')}
          </h4>
          <div className="grid grid-cols-1 gap-2">
            {TEXT_ANIMATIONS.map((anim) => (
              <button
                key={anim.id}
                onClick={() => handleApplyAnimation(anim.id)}
                className="group flex items-center justify-between rounded-[6px] border border-white/5 bg-zinc-900 p-2.5 transition-all hover:border-accent/50 hover:bg-zinc-850 text-left"
                title={anim.description}
              >
                <div className="flex items-center gap-2.5">
                  <div className="flex h-7 w-7 items-center justify-center rounded bg-zinc-800">
                    {animIcons[anim.id] || <Sparkles className="h-4 w-4 text-cyan-400" />}
                  </div>
                  <div>
                    <div className="text-[12px] font-medium text-zinc-200 group-hover:text-zinc-100">
                      {anim.name}
                    </div>
                    <div className="text-[10px] text-zinc-500 leading-tight">
                      {anim.description}
                    </div>
                  </div>
                </div>
                <span className="text-[9px] font-mono text-zinc-500 rounded bg-zinc-800 px-1.5 py-0.5">
                  KF
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/* ── Effects / Filters / Adjust ──
   All three read from the same effect registry; the tab just narrows which
   categories are on offer. */

const CATEGORIES_BY_TAB: Record<string, readonly string[]> = {
  effects: ['stylize', 'filter'],
  filters: ['color-preset'],
  adjust: ['filter'],
}

const SWATCH: Record<string, string> = {
  blur:     'linear-gradient(135deg,#3b82f6,#1d4ed8)',
  glow:     'linear-gradient(135deg,#eab308,#ca8a04)',
  sharpen:  'linear-gradient(135deg,#06b6d4,#0891b2)',
  vignette: 'linear-gradient(135deg,#18181b,#27272a)',
  grain:    'linear-gradient(135deg,#71717a,#52525b)',
}

function EffectLibrary({ tab }: { tab: LibraryTab }) {
  const actions = useEditorActions()
  const selectedClipIds = useEditorStore(selectSelectedClipIds)
  const categories = CATEGORIES_BY_TAB[tab] ?? []

  const entries = (Object.entries(EFFECT_DEFINITIONS) as [EffectType, { name: string; category: string }][])
    .filter(([, def]) => categories.includes(def.category))

  const apply = (type: EffectType) => {
    // Effects attach to a clip, so without a selection there is nothing to
    // apply to — greys the whole grid out in that case.
    for (const clipId of selectedClipIds) actions.addClipEffect(clipId, type)
  }

  const disabled = selectedClipIds.size === 0

  return (
    <>
      {disabled && (
        <p className="mb-3 text-[11px] text-zinc-500">Select a clip on the timeline to apply.</p>
      )}
      <div className={`grid grid-cols-3 gap-2 ${disabled ? 'pointer-events-none opacity-40' : ''}`}>
        {entries.map(([type, def]) => (
          <button
            key={type}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData('effectType', type)
              e.dataTransfer.effectAllowed = 'copy'
            }}
            onClick={() => apply(type)}
            className="group flex flex-col gap-1.5"
            title={`${def.name} — click to apply, or drag onto a clip`}
          >
            <div
              className="h-[62px] w-full rounded-[6px] ring-1 ring-white/5 transition-all group-hover:ring-accent"
              style={{ background: SWATCH[type] ?? 'linear-gradient(135deg,#2a2a2e,#3a3a42)' }}
            />
            <span className="truncate text-[11px] text-zinc-400 group-hover:text-zinc-100">{def.name}</span>
          </button>
        ))}
      </div>
    </>
  )
}

/* ── Captions ── */

function AutoCaptionsPanel() {
  const { t } = useTranslation()
  const { settings, openSettings } = useSettings()
  const actions = useEditorActions()
  const clips = useEditorStore(selectClips)
  const selectedClipIds = useEditorStore(selectSelectedClipIds)

  const [isTranscribing, setIsTranscribing] = useState(false)
  const [currentJobId, setCurrentJobId] = useState<string | null>(null)
  const [progress, setProgress] = useState<{ percent: number; message: string }>({ percent: 0, message: '' })
  const [feedback, setFeedback] = useState<{ success: boolean; message: string } | null>(null)
  const [selectedLanguage, setSelectedLanguage] = useState<string>(settings.whisperLanguage || '')
  const [smartChunking, setSmartChunking] = useState<boolean>(true)
  const [selectedPresetId, setSelectedPresetId] = useState<string>('tiktok-classic')

  // Find selected video or audio clip
  const eligibleSelectedClip = useMemo(() => {
    return clips.find(
      c => selectedClipIds.has(c.id) && (c.type === 'video' || c.type === 'audio') && (c.asset?.path || (c as any).path)
    )
  }, [clips, selectedClipIds])

  // If no clip selected, find first playable video/audio clip on timeline
  const defaultTimelineClip = useMemo(() => {
    return clips.find(
      c => (c.type === 'video' || c.type === 'audio') && (c.asset?.path || (c as any).path)
    )
  }, [clips])

  const targetClip = eligibleSelectedClip || defaultTimelineClip

  // Progress listener
  useEffect(() => {
    if (!window.electronAPI?.on) return
    const unbind = window.electronAPI.on('whisper:progress', (payload) => {
      if (currentJobId && payload.jobId === currentJobId) {
        setProgress({
          percent: payload.percent ?? 0,
          message: payload.message ?? '',
        })
      }
    })
    return unbind
  }, [currentJobId])

  const handleStartTranscribe = async () => {
    if (!targetClip) {
      setFeedback({ success: false, message: t('captions.noSelection') })
      return
    }

    const filePath = targetClip.asset?.path || (targetClip as any).path
    if (!filePath) {
      setFeedback({ success: false, message: t('captions.noAudioFound') })
      return
    }

    if (!window.electronAPI?.whisperTranscribe) {
      setFeedback({ success: false, message: 'Electron Whisper API not available' })
      return
    }

    const jobId = makeId('transcribe')
    setCurrentJobId(jobId)
    setIsTranscribing(true)
    setFeedback(null)
    setProgress({ percent: 10, message: t('captions.extractingAudio') })

    try {
      const res = await window.electronAPI.whisperTranscribe({
        jobId,
        filePath,
        startTime: targetClip.trimStart,
        duration: targetClip.duration,
        endpoint: settings.whisperEndpoint,
        apiKey: settings.whisperApiKey,
        model: settings.whisperModel,
        language: selectedLanguage,
        prompt: settings.whisperPrompt,
      })

      const chosenPreset = getSubtitlePreset(selectedPresetId)
      const styleOverride = chosenPreset ? chosenPreset.style : undefined

      if (res.success && res.result && res.result.segments.length > 0) {
        const cues = whisperSegmentsToSrtCues(res.result.segments, targetClip.startTime, {
          chunk: smartChunking,
          minWords: 3,
          maxWords: 5,
          maxChars: 28,
        })
        actions.importSrtCues(cues, { style: styleOverride })
        setFeedback({
          success: true,
          message: t('captions.done', { count: cues.length }),
        })
      } else if (res.success && res.result?.text) {
        const cues = whisperSegmentsToSrtCues(
          [{ id: 0, start: 0, end: targetClip.duration, text: res.result.text }],
          targetClip.startTime,
          {
            chunk: smartChunking,
            minWords: 3,
            maxWords: 5,
            maxChars: 28,
          },
        )
        actions.importSrtCues(cues, { style: styleOverride })
        setFeedback({
          success: true,
          message: t('captions.done', { count: cues.length }),
        })
      } else {
        setFeedback({
          success: false,
          message: res.error || 'Transcription failed',
        })
      }
    } catch (err: any) {
      setFeedback({
        success: false,
        message: err.message || String(err),
      })
    } finally {
      setIsTranscribing(false)
      setCurrentJobId(null)
    }
  }

  const handleCancel = () => {
    if (currentJobId && window.electronAPI?.whisperCancel) {
      window.electronAPI.whisperCancel({ jobId: currentJobId })
    }
    setIsTranscribing(false)
    setCurrentJobId(null)
    setProgress({ percent: 0, message: '' })
  }

  return (
    <div className="flex flex-col gap-4 p-1">
      {/* Header info */}
      <div className="flex items-start justify-between gap-2 border-b border-zinc-800 pb-3">
        <div>
          <p className="text-[12px] font-semibold text-zinc-200">{t('captions.generateTitle')}</p>
          <p className="text-[11px] text-zinc-400 leading-relaxed mt-0.5">{t('captions.generateDesc')}</p>
        </div>
        <button
          onClick={() => openSettings('speech')}
          className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
          title={t('captions.configurePrompt')}
        >
          <Settings className="h-4 w-4" />
        </button>
      </div>

      {/* Whisper Provider status pill */}
      <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-zinc-900/90 border border-zinc-800 text-[11px]">
        <div className="flex flex-col gap-0.5">
          <span className="text-zinc-400">
            {settings.whisperProvider === 'cloud' ? 'OpenAI Cloud' : 'Self-hosted Whisper'}
          </span>
          <span className="text-zinc-500 font-mono truncate max-w-[200px]">
            {settings.whisperEndpoint || 'http://localhost:8000/v1'}
          </span>
        </div>
        <button
          onClick={() => openSettings('speech')}
          className="text-teal-400 hover:underline text-[11px]"
        >
          {t('captions.openSettings')}
        </button>
      </div>

      {/* Target scope */}
      <div className="space-y-1.5">
        <label className="text-[11px] font-medium text-zinc-300 block">{t('captions.sourceScope')}</label>
        <div className="rounded-lg bg-zinc-900 border border-zinc-800 p-2.5 text-[11px]">
          {targetClip ? (
            <div className="flex items-center justify-between">
              <span className="text-zinc-300 font-medium truncate max-w-[190px]">
                {targetClip.importedName || (targetClip.asset?.path ? targetClip.asset.path.split(/[/\\]/).pop() : targetClip.id)}
              </span>
              <span className="text-zinc-500 font-mono">
                {targetClip.duration.toFixed(1)}s
              </span>
            </div>
          ) : (
            <span className="text-zinc-500">{t('captions.noSelection')}</span>
          )}
        </div>
      </div>

      {/* Language */}
      <div className="space-y-1.5">
        <label className="text-[11px] font-medium text-zinc-300 block">{t('captions.language')}</label>
        <select
          value={selectedLanguage}
          onChange={(e) => setSelectedLanguage(e.target.value)}
          disabled={isTranscribing}
          className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-[11px] text-zinc-200 outline-none focus:border-teal-500 cursor-pointer disabled:opacity-50"
        >
          <option value="">{t('settings.speech.languageAuto')}</option>
          <option value="vi">Tiếng Việt (vi)</option>
          <option value="en">English (en)</option>
          <option value="zh">Chinese (zh)</option>
          <option value="ja">Japanese (ja)</option>
          <option value="ko">Korean (ko)</option>
          <option value="fr">French (fr)</option>
          <option value="de">German (de)</option>
          <option value="es">Spanish (es)</option>
        </select>
      </div>

      {/* Smart Captions Chunking Toggle */}
      <div className="flex items-center justify-between rounded-lg bg-zinc-900 border border-zinc-800 p-2.5">
        <div className="flex flex-col">
          <span className="text-[11px] font-medium text-zinc-200">{t('library.smartCaptions')}</span>
          <span className="text-[10px] text-zinc-400">{t('library.smartCaptionsDesc')}</span>
        </div>
        <button
          type="button"
          onClick={() => setSmartChunking(prev => !prev)}
          disabled={isTranscribing}
          className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
            smartChunking ? 'bg-teal-500' : 'bg-zinc-700'
          }`}
        >
          <span
            className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
              smartChunking ? 'translate-x-4' : 'translate-x-0'
            }`}
          />
        </button>
      </div>

      {/* Preset Style Selector */}
      <div className="space-y-1.5">
        <label className="text-[11px] font-medium text-zinc-300 block">{t('library.subtitleStylePreset')}</label>
        <select
          value={selectedPresetId}
          onChange={(e) => setSelectedPresetId(e.target.value)}
          disabled={isTranscribing}
          className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-[11px] text-zinc-200 outline-none focus:border-teal-500 cursor-pointer disabled:opacity-50"
        >
          {SUBTITLE_PRESETS.map(preset => {
            const key = preset.id.replace(/-/g, '_')
            const nameKey = `captions.presets.${key}.name`
            const descKey = `captions.presets.${key}.description`
            const presetName = t(nameKey) !== nameKey ? t(nameKey) : preset.name
            const presetDesc = t(descKey) !== descKey ? t(descKey) : preset.description
            return (
              <option key={preset.id} value={preset.id}>
                {presetName} — {presetDesc}
              </option>
            )
          })}
        </select>
      </div>

      {/* Progress or Actions */}
      {isTranscribing ? (
        <div className="space-y-2.5 pt-2">
          <div className="flex items-center justify-between text-[11px]">
            <span className="flex items-center gap-1.5 text-teal-400 font-medium">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {progress.message || t('captions.transcribing')}
            </span>
            <span className="text-zinc-400 font-mono">{progress.percent}%</span>
          </div>
          <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-teal-500 transition-all duration-300"
              style={{ width: `${Math.max(5, progress.percent)}%` }}
            />
          </div>
          <button
            onClick={handleCancel}
            className="w-full py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-rose-400 text-[11px] font-medium transition-colors"
          >
            {t('captions.cancelBtn')}
          </button>
        </div>
      ) : (
        <div className="pt-2 space-y-2">
          <button
            onClick={handleStartTranscribe}
            disabled={!targetClip}
            className="w-full py-2 px-3 rounded-lg bg-teal-500 hover:bg-teal-400 text-zinc-950 text-[12px] font-semibold transition-all shadow-md shadow-teal-500/10 disabled:opacity-40 disabled:pointer-events-none flex items-center justify-center gap-2 cursor-pointer"
          >
            <Captions className="h-4 w-4" />
            {t('captions.generateBtn')}
          </button>

          {feedback && (
            <div className={`flex items-start gap-1.5 text-[11px] p-2.5 rounded-lg border ${
              feedback.success
                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
            }`}>
              {feedback.success ? (
                <CheckCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
              ) : (
                <AlertCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
              )}
              <span>{feedback.message}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function AutoHighlightsPanel() {
  const { t } = useTranslation()
  const { settings, openSettings } = useSettings()
  const store = useEditorStoreApi()
  const clips = useEditorStore(selectClips)
  const selectedClipIds = useEditorStore(selectSelectedClipIds)

  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [candidates, setCandidates] = useState<HighlightCandidate[]>([])
  const [feedback, setFeedback] = useState<{ success: boolean; message: string } | null>(null)

  const targetClip = useMemo(() => {
    return (
      clips.find(c => selectedClipIds.has(c.id) && (c.type === 'video' || c.type === 'audio') && (c.asset?.path || (c as any).path)) ||
      clips.find(c => (c.type === 'video' || c.type === 'audio') && (c.asset?.path || (c as any).path))
    )
  }, [clips, selectedClipIds])

  const handleExtract = async () => {
    if (!targetClip) {
      setFeedback({ success: false, message: t('library.autoHighlights.noClip') })
      return
    }

    const filePath = targetClip.asset?.path || (targetClip as any).path
    if (!filePath) {
      setFeedback({ success: false, message: t('library.autoHighlights.noClip') })
      return
    }

    if (!window.electronAPI?.whisperExtractHighlights) {
      setFeedback({ success: false, message: 'IPC whisperExtractHighlights not available' })
      return
    }

    setIsAnalyzing(true)
    setFeedback(null)

    try {
      // 1. If transcription exists in project, pass it directly, otherwise let electron transcribe/probe
      const res = await window.electronAPI.whisperExtractHighlights({
        transcriptText: '', // whisper-service will use file or fallback
        apiKey: settings.whisperApiKey,
        endpoint: settings.whisperEndpoint,
        model: 'gpt-4o-mini',
        maxItems: 4,
      })

      if (res.success && res.highlights && res.highlights.length > 0) {
        setCandidates(res.highlights)
        setFeedback({ success: true, message: t('library.autoHighlights.foundCount', { count: res.highlights.length }) })
      } else {
        setFeedback({ success: false, message: res.error || t('library.autoHighlights.notFound') })
      }
    } catch (err: any) {
      setFeedback({ success: false, message: err.message || String(err) })
    } finally {
      setIsAnalyzing(false)
    }
  }

  const handleApplyHighlight = (candidate: HighlightCandidate) => {
    if (!targetClip) return
    const patch = buildHighlightEditPatch(candidate, targetClip)
    store.getState().setStateWithHistory(prev => applyEditPatchToState(prev, patch))
    setFeedback({ success: true, message: t('library.autoHighlights.shortCreated', { title: candidate.title }) })
  }

  return (
    <div className="flex flex-col gap-4 p-1">
      {/* Header */}
      <div className="flex items-start justify-between gap-2 border-b border-zinc-800 pb-3">
        <div>
          <div className="flex items-center gap-1.5">
            <Sparkles className="h-4 w-4 text-accent" />
            <p className="text-[12px] font-semibold text-zinc-200">{t('library.autoHighlights.title')}</p>
          </div>
          <p className="text-[11px] text-zinc-400 leading-relaxed mt-0.5">
            {t('library.autoHighlights.desc')}
          </p>
        </div>
        <button
          onClick={() => openSettings('speech')}
          className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
          title={t('library.autoHighlights.configureApiKeyTitle')}
        >
          <Settings className="h-4 w-4" />
        </button>
      </div>

      {/* Target scope */}
      <div className="space-y-1.5">
        <label className="text-[11px] font-medium text-zinc-300 block">{t('library.autoHighlights.analyzeClip')}</label>
        <div className="rounded-lg bg-zinc-900 border border-zinc-800 p-2.5 text-[11px]">
          {targetClip ? (
            <div className="flex items-center justify-between">
              <span className="text-zinc-300 font-medium truncate max-w-[190px]">
                {targetClip.importedName || (targetClip.asset?.path ? targetClip.asset.path.split(/[/\\]/).pop() : targetClip.id)}
              </span>
              <span className="text-zinc-500 font-mono">
                {targetClip.duration.toFixed(1)}s
              </span>
            </div>
          ) : (
            <span className="text-zinc-500">{t('library.autoHighlights.noClip')}</span>
          )}
        </div>
      </div>

      <button
        onClick={handleExtract}
        disabled={isAnalyzing || !targetClip}
        className="w-full py-2 px-3 rounded-lg bg-accent hover:bg-accent/90 text-zinc-950 text-[12px] font-semibold transition-all shadow-md shadow-accent/10 disabled:opacity-40 disabled:pointer-events-none flex items-center justify-center gap-2 cursor-pointer"
      >
        {isAnalyzing ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>{t('library.autoHighlights.analyzing')}</span>
          </>
        ) : (
          <>
            <Sparkles className="h-4 w-4" />
            <span>{t('library.autoHighlights.extractBtn')}</span>
          </>
        )}
      </button>

      {feedback && (
        <div className={`flex items-start gap-1.5 text-[11px] p-2.5 rounded-lg border ${
          feedback.success
            ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
            : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
        }`}>
          {feedback.success ? (
            <CheckCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
          ) : (
            <AlertCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
          )}
          <span>{feedback.message}</span>
        </div>
      )}

      {/* Candidate list */}
      {candidates.length > 0 && (
        <div className="space-y-2.5 pt-2">
          <p className="text-[11px] font-semibold text-zinc-300 uppercase tracking-wider">
            {t('library.autoHighlights.suggestedTitle', { count: candidates.length })}
          </p>
          {candidates.map((c) => (
            <div
              key={c.id}
              className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-3 space-y-2 hover:border-zinc-700 transition-colors"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="text-[12px] font-medium text-zinc-100 line-clamp-1">{c.title}</span>
                <span className="rounded bg-accent/20 px-1.5 py-0.5 text-[10px] font-bold text-accent shrink-0">
                  {c.viralScore}đ
                </span>
              </div>

              <div className="text-[11px] text-zinc-400 space-y-1">
                <p className="text-[10px] text-zinc-500 font-mono">
                  {c.startTime.toFixed(1)}s – {c.endTime.toFixed(1)}s ({c.duration.toFixed(1)}s)
                </p>
                <div className="rounded bg-zinc-950/80 p-1.5 border border-zinc-800/80">
                  <span className="text-[10px] text-accent font-semibold block">Hook 3s:</span>
                  <span className="text-[11px] text-zinc-200 italic">&ldquo;{c.hookText}&rdquo;</span>
                </div>
                <p className="text-[10px] text-zinc-400 line-clamp-2">{c.reason}</p>
              </div>

              <button
                onClick={() => handleApplyHighlight(c)}
                className="w-full mt-1 py-1.5 px-2.5 rounded bg-zinc-800 hover:bg-zinc-700 text-[11px] font-medium text-accent transition-colors flex items-center justify-center gap-1.5"
              >
                <Zap className="h-3.5 w-3.5" />
                <span>{t('library.autoHighlights.createShortNow')}</span>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function BrollCopilotPanel() {
  const { t } = useTranslation()
  const actions = useEditorActions()
  const clips = useEditorStore(selectClips)
  const subtitles = useEditorStore(s => s.editorModel.timelines.find(t => t.id === s.editorModel.activeTimelineId)?.subtitles || [])
  const assets = useEditorStore(s => s.editorModel.assets)
  const [opportunities, setOpportunities] = useState<BrollOpportunity[]>([])
  const [hasScanned, setHasScanned] = useState(false)
  const [feedback, setFeedback] = useState<{ success: boolean; message: string } | null>(null)

  const handleScan = () => {
    const opps = detectBrollOpportunities({
      subtitles,
      existingClips: clips,
      minDuration: 5.0,
      maxDuration: 8.0,
    })
    setOpportunities(opps)
    setHasScanned(true)
    if (opps.length > 0) {
      setFeedback({ success: true, message: t('library.brollCopilot.foundCount', { count: opps.length }) })
    } else {
      setFeedback({
        success: false,
        message: subtitles.length === 0
          ? t('library.brollCopilot.noSubtitles')
          : t('library.brollCopilot.noLongSpeeches'),
      })
    }
  }

  const handleInsert = (opp: BrollOpportunity) => {
    const brollAsset = assets.find(a => a.type === 'video' || a.type === 'image')
    actions.insertBrollClip({
      assetId: brollAsset?.id,
      assetPath: brollAsset?.path,
      startTime: opp.startTime,
      duration: opp.duration,
      fadeIn: 0.25,
      fadeOut: 0.25,
      muteAudio: true,
    })
    setFeedback({
      success: true,
      message: t('library.brollCopilot.insertedFeedback', {
        time: opp.startTime.toFixed(1),
        duration: opp.duration.toFixed(1),
      }),
    })
    const updatedOpps = opportunities.filter(o => o.id !== opp.id)
    setOpportunities(updatedOpps)
  }

  return (
    <div className="flex flex-col gap-4 p-1">
      {/* Header */}
      <div className="flex items-start justify-between gap-2 border-b border-zinc-800 pb-3">
        <div>
          <div className="flex items-center gap-1.5">
            <Eye className="h-4 w-4 text-accent" />
            <p className="text-[12px] font-semibold text-zinc-200">{t('library.brollCopilot.title')}</p>
          </div>
          <p className="text-[11px] text-zinc-400 leading-relaxed mt-1">
            {t('library.brollCopilot.desc')}
          </p>
        </div>
      </div>

      <button
        onClick={handleScan}
        className="w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg bg-accent text-zinc-950 text-[12px] font-semibold hover:bg-accent/90 transition-colors shadow-sm"
      >
        <Sparkles className="h-4 w-4" />
        <span>{t('library.brollCopilot.scanBtn')}</span>
      </button>

      {feedback && (
        <div
          className={`flex items-start gap-2 p-2.5 rounded-lg text-[11px] leading-relaxed border ${
            feedback.success
              ? 'bg-emerald-950/40 border-emerald-800/80 text-emerald-300'
              : 'bg-amber-950/40 border-amber-800/80 text-amber-300'
          }`}
        >
          {feedback.success ? (
            <CheckCircle className="h-4 w-4 shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          )}
          <span>{feedback.message}</span>
        </div>
      )}

      {hasScanned && opportunities.length > 0 && (
        <div className="space-y-3">
          <p className="text-[11px] font-semibold text-zinc-300 uppercase tracking-wider">
            {t('library.brollCopilot.suggestedSpots', { count: opportunities.length })}
          </p>
          {opportunities.map(o => (
            <div
              key={o.id}
              className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-3 space-y-2 hover:border-zinc-700 transition-colors"
            >
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-mono text-zinc-400">
                  {o.startTime.toFixed(1)}s – {o.endTime.toFixed(1)}s ({o.duration.toFixed(1)}s)
                </span>
                <span className="text-[10px] bg-accent/20 text-accent font-semibold px-1.5 py-0.5 rounded">
                  Overlay Track
                </span>
              </div>

              {o.contextText && (
                <p className="text-[11px] text-zinc-300 italic line-clamp-2 bg-zinc-950/60 p-1.5 rounded border border-zinc-800/50">
                  &ldquo;{o.contextText}&rdquo;
                </p>
              )}

              {o.keywords.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {o.keywords.map(kw => (
                    <span key={kw} className="text-[10px] bg-zinc-800 text-zinc-300 px-1.5 py-0.5 rounded">
                      #{kw}
                    </span>
                  ))}
                </div>
              )}

              <button
                onClick={() => handleInsert(o)}
                className="w-full mt-1 py-1.5 px-2.5 rounded bg-zinc-800 hover:bg-zinc-700 text-[11px] font-medium text-accent transition-colors flex items-center justify-center gap-1.5"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>{t('library.brollCopilot.insertBtn')}</span>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function CaptionsLibrary({ section, onImportSrt }: { section: string; onImportSrt: () => void }) {
  const actions = useEditorActions()
  const { t } = useTranslation()

  if (section === 'auto-captions') {
    return <AutoCaptionsPanel />
  }

  if (section === 'auto-highlights') {
    return <AutoHighlightsPanel />
  }

  if (section === 'broll-copilot') {
    return <BrollCopilotPanel />
  }

  return (
    <div className="space-y-2">
      <button
        onClick={() => actions.addSubtitleTrack()}
        className="flex w-full items-center gap-2.5 rounded-[6px] bg-zinc-900 px-3 py-2.5 text-left text-[12px] text-zinc-200 transition-colors hover:bg-zinc-800"
      >
        <Captions className="h-4 w-4 text-accent" />
        {t('captions.addTrack')}
      </button>
      <button
        onClick={onImportSrt}
        className="flex w-full items-center gap-2.5 rounded-[6px] bg-zinc-900 px-3 py-2.5 text-left text-[12px] text-zinc-200 transition-colors hover:bg-zinc-800"
      >
        <FileUp className="h-4 w-4 text-accent" />
        {t('captions.localCaptions')}
      </button>
    </div>
  )
}

/* ── Stickers Library ── */

function StickersLibrary({
  importFiles,
}: {
  importFiles?: (files: FileList | File[]) => Promise<unknown>
}) {
  const { t } = useTranslation()
  const actions = useEditorActions()
  const assets = useEditorStore(s => s.editorModel.assets)
  const [selectedCategory, setSelectedCategory] = useState<StickerCategory | 'all' | 'custom'>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Custom user-imported images
  const customStickers = useMemo(() => {
    return assets.filter(a => a.type === 'image')
  }, [assets])

  const filteredBuiltInStickers = useMemo(() => {
    if (selectedCategory === 'custom') return []
    return STICKER_DEFINITIONS.filter(sticker => {
      if (selectedCategory !== 'all' && sticker.category !== selectedCategory) {
        return false
      }
      if (!searchQuery.trim()) return true
      const q = searchQuery.toLowerCase().trim()
      return (
        sticker.name.toLowerCase().includes(q) ||
        sticker.id.toLowerCase().includes(q) ||
        sticker.keywords.some(k => k.toLowerCase().includes(q))
      )
    })
  }, [selectedCategory, searchQuery])

  const filteredCustomStickers = useMemo(() => {
    if (selectedCategory !== 'all' && selectedCategory !== 'custom') return []
    return customStickers.filter(a => {
      if (!searchQuery.trim()) return true
      const q = searchQuery.toLowerCase().trim()
      const name = a.path.split(/[/\\]/).pop() || a.id
      return name.toLowerCase().includes(q) || (a.prompt && a.prompt.toLowerCase().includes(q))
    })
  }, [customStickers, selectedCategory, searchQuery])

  const handleAddBuiltIn = (stickerId: string) => {
    actions.addStickerClip({ stickerId })
  }

  const handleAddCustom = (asset: Asset) => {
    actions.addStickerClip({
      stickerId: asset.id,
      imagePath: asset.path,
    })
  }

  const handleFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files.length > 0 && importFiles) {
      await importFiles(files)
      setSelectedCategory('custom')
    }
    e.target.value = ''
  }

  const totalResults = filteredBuiltInStickers.length + filteredCustomStickers.length

  return (
    <div className="flex h-full flex-col gap-3">
      {/* Header controls: Search & Import */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500" />
          <input
            type="text"
            placeholder={t('library.stickers.searchPlaceholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-[6px] bg-zinc-900 border border-zinc-800 py-1.5 pl-8 pr-7 text-[12px] text-zinc-200 placeholder:text-zinc-500 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/png,image/webp,image/svg+xml,image/jpeg"
          className="hidden"
          onChange={handleFileInput}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          title={t('library.stickers.importHint')}
          className="flex items-center gap-1.5 rounded-[6px] bg-zinc-800 px-2.5 py-1.5 text-[11px] font-medium text-zinc-200 border border-zinc-700/60 hover:bg-zinc-700 transition-colors shrink-0"
        >
          <Upload className="h-3.5 w-3.5 text-accent" />
          <span>{t('library.stickers.importBtn')}</span>
        </button>
      </div>

      {/* Category Pills */}
      <div className="flex flex-wrap gap-1.5 pb-1 border-b border-zinc-800/60">
        {STICKER_CATEGORIES.map(cat => {
          const isSelected = selectedCategory === cat.id
          const count = cat.id === 'all'
            ? STICKER_DEFINITIONS.length + customStickers.length
            : cat.id === 'custom'
              ? customStickers.length
              : STICKER_DEFINITIONS.filter(s => s.category === cat.id).length

          return (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
                isSelected
                  ? 'bg-accent text-zinc-950 shadow-sm'
                  : 'bg-zinc-900 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 border border-zinc-800'
              }`}
            >
              {cat.label} {count > 0 && <span className="text-[10px] opacity-75">({count})</span>}
            </button>
          )
        })}
      </div>

      {/* Stickers Grid */}
      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        {totalResults === 0 ? (
          <div className="flex h-48 flex-col items-center justify-center gap-2 text-center text-zinc-500">
            <Sparkles className="h-8 w-8 text-zinc-600" />
            <p className="text-[12px] font-medium text-zinc-400">{t('library.stickers.notFound')}</p>
            <p className="text-[11px] text-zinc-600 max-w-[200px]">
              {selectedCategory === 'custom'
                ? t('library.stickers.emptyCustomHint')
                : t('library.stickers.emptySearchHint')}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Built-in Stickers */}
            {filteredBuiltInStickers.length > 0 && (
              <div>
                {selectedCategory === 'all' && customStickers.length > 0 && (
                  <h4 className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-2">
                    {t('library.stickers.builtIn')}
                  </h4>
                )}
                <div className="grid grid-cols-3 gap-2">
                  {filteredBuiltInStickers.map(sticker => (
                    <div
                      key={sticker.id}
                      onClick={() => handleAddBuiltIn(sticker.id)}
                      title={`${sticker.name} - ${t('library.stickers.clickToAdd')}`}
                      className="group relative flex flex-col items-center justify-center rounded-lg border border-zinc-800/80 bg-zinc-900/50 p-2.5 hover:border-accent/60 hover:bg-zinc-800/90 transition-all cursor-pointer shadow-sm"
                    >
                      <div className="flex h-14 w-14 items-center justify-center">
                        <img
                          src={`/stickers/${sticker.filename}`}
                          alt={sticker.name}
                          className="max-h-12 max-w-12 object-contain filter drop-shadow-md group-hover:scale-110 transition-transform duration-150"
                          loading="lazy"
                        />
                      </div>
                      <span className="mt-1 w-full truncate text-center text-[10px] text-zinc-400 group-hover:text-zinc-200">
                        {sticker.name}
                      </span>
                      <div className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-accent text-zinc-950 opacity-0 shadow transition-opacity group-hover:opacity-100">
                        <Plus className="h-3.5 w-3.5 stroke-[2.5]" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Custom Imported Stickers */}
            {filteredCustomStickers.length > 0 && (
              <div>
                {selectedCategory === 'all' && (
                  <h4 className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-2">
                    {t('library.stickers.imported', { count: filteredCustomStickers.length })}
                  </h4>
                )}
                <div className="grid grid-cols-3 gap-2">
                  {filteredCustomStickers.map(asset => {
                    const name = asset.path.split(/[/\\]/).pop() || asset.id
                    return (
                      <div
                        key={asset.id}
                        onClick={() => handleAddCustom(asset)}
                        title={`${name} - ${t('library.stickers.clickToAdd')}`}
                        className="group relative flex flex-col items-center justify-center rounded-lg border border-zinc-800/80 bg-zinc-900/50 p-2.5 hover:border-accent/60 hover:bg-zinc-800/90 transition-all cursor-pointer shadow-sm"
                      >
                        <div className="flex h-14 w-14 items-center justify-center">
                          <img
                            src={pathToFileUrl(asset.smallThumbnailPath || asset.path)}
                            alt={name}
                            className="max-h-12 max-w-12 object-contain filter drop-shadow-md group-hover:scale-110 transition-transform duration-150"
                            loading="lazy"
                          />
                        </div>
                        <span className="mt-1 w-full truncate text-center text-[10px] text-zinc-400 group-hover:text-zinc-200">
                          {name}
                        </span>
                        <div className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-accent text-zinc-950 opacity-0 shadow transition-opacity group-hover:opacity-100">
                          <Plus className="h-3.5 w-3.5 stroke-[2.5]" />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

