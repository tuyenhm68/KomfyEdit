import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import {
  X,
  Download,
  FolderOpen,
  Film,
  Package,
  Loader2,
  Check,
  AlertCircle,
  ChevronDown,
  Sparkles,
  Music,
  Sliders,
  GitBranch,
} from 'lucide-react'
import { Button } from './ui/button'
import { DEFAULT_SUBTITLE_STYLE } from '../types/project-model'
import type { Track, TimelineClip } from '../types/project-model'
import {
  selectActiveTimeline,
  selectTimelines,
  selectAssets,
  selectClipPathFromAssets,
  selectClips,
  selectMarkers,
  selectShowExportModal,
  selectSubtitles,
  selectTracks,
} from '../views/editor/editor-selectors'
import { resolveEffectiveClipFilter } from '@core/video-editor-utils'
import { getEffectiveTimelineDimensions } from '@core/video-resolution'
import {
  SOCIAL_PRESETS,
  EXPORT_FORMATS,
  estimateExportFileSize,
  formatFileSize,
  type ExportCodec,
} from '@core/export-options'
import { useEditorActions, useEditorStore } from '../views/editor/editor-store'
import { useSettings } from '../contexts/SettingsContext'
import { useTranslation } from '../i18n/I18nContext'

interface ExportModalProps {
  projectName: string
}

type ExportStatus = 'idle' | 'exporting' | 'done' | 'error'

interface ExportSettings {
  codec: ExportCodec
  width: number
  height: number
  fps: number
  quality: number // CRF for h264, profile for prores, bitrate(Mbps) for vp9
  customBitrateMbps?: number
  useCustomBitrate?: boolean
}

const CODEC_INFO = EXPORT_FORMATS

const FRAME_RATES = [15, 24, 25, 30, 60]

const PRORES_PROFILES = [
  { value: 0, label: 'Proxy' },
  { value: 1, label: 'LT' },
  { value: 2, label: 'Standard' },
  { value: 3, label: 'HQ' },
]

const LETTERBOX_RATIO_MAP: Record<string, number> = {
  '2.35:1': 2.35,
  '2.39:1': 2.39,
  '2.76:1': 2.76,
  '1.85:1': 1.85,
  '4:3': 4 / 3,
}

// Generate FCPXML for Premiere / DaVinci
function generateFCPXML(
  clips: TimelineClip[],
  tracks: Track[],
  projectName: string,
  timelineName: string,
  fps: number = 24
): string {
  const frameDuration = `${Math.round(100 * fps)}/${100 * fps}s`
  const totalDuration = clips.reduce((max, c) => Math.max(max, c.startTime + c.duration), 0)
  const totalFrames = Math.ceil(totalDuration * fps)

  const assetEntries: string[] = []
  const seenAssets = new Set<string>()
  for (const clip of clips) {
    const assetId = clip.assetId || clip.id
    if (seenAssets.has(assetId)) continue
    seenAssets.add(assetId)

    const assetPath = clip.asset?.path || ''
    const dur = clip.asset?.duration || clip.duration
    const durFrames = Math.ceil(dur * fps)
    const format = clip.type === 'audio' ? 'audio' : 'video'

    assetEntries.push(
      `        <asset id="${escapeXml(assetId)}" name="${escapeXml(clip.asset?.prompt?.slice(0, 60) || clip.importedName || 'Clip')}" src="${escapeXml(assetPath)}" start="0s" duration="${durFrames}/${fps}s" hasVideo="${format === 'video' ? '1' : '0'}" hasAudio="1" format="r1" />`
    )
  }

  const trackGroups: Map<number, TimelineClip[]> = new Map()
  for (const clip of clips) {
    if (!trackGroups.has(clip.trackIndex)) trackGroups.set(clip.trackIndex, [])
    trackGroups.get(clip.trackIndex)!.push(clip)
  }

  const laneXml: string[] = []
  const sortedTrackIndices = [...trackGroups.keys()].sort((a, b) => a - b)
  
  for (const trackIdx of sortedTrackIndices) {
    const trackClips = trackGroups.get(trackIdx)!.sort((a, b) => a.startTime - b.startTime)
    const clipElements: string[] = []
    
    for (const clip of trackClips) {
      const assetId = clip.assetId || clip.id
      const startFrame = Math.round(clip.startTime * fps)
      const durFrames = Math.round(clip.duration * fps)
      const trimStartFrame = Math.round(clip.trimStart * fps)
      const name = clip.asset?.prompt?.slice(0, 60) || clip.importedName || 'Clip'

      let clipXml = `            <asset-clip ref="${escapeXml(assetId)}" name="${escapeXml(name)}" offset="${startFrame}/${fps}s" duration="${durFrames}/${fps}s" start="${trimStartFrame}/${fps}s"`
      if (clip.speed !== 1) {
        clipXml += ` tcFormat="NDF"`
      }
      clipXml += ` />`
      clipElements.push(clipXml)
    }

    const trackName = tracks[trackIdx]?.name || `Track ${trackIdx + 1}`
    laneXml.push(
      `          <!-- ${escapeXml(trackName)} -->\n` +
      clipElements.join('\n')
    )
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE fcpxml>
<fcpxml version="1.10">
  <resources>
    <format id="r1" name="FFVideoFormat${fps === 24 ? '1080p2398' : '1080p' + fps}" frameDuration="${frameDuration}" width="1920" height="1080" />
${assetEntries.join('\n')}
  </resources>
  <library>
    <event name="${escapeXml(projectName)}">
      <project name="${escapeXml(timelineName)}">
        <sequence format="r1" duration="${totalFrames}/${fps}s" tcStart="0s" tcFormat="NDF">
          <spine>
${laneXml.join('\n')}
          </spine>
        </sequence>
      </project>
    </event>
  </library>
</fcpxml>`
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

export function ExportModal({ projectName }: ExportModalProps) {
  const { t } = useTranslation()
  const { closeExportModal } = useEditorActions()
  const isOpen = useEditorStore(selectShowExportModal)
  const timeline = useEditorStore(selectActiveTimeline)
  const allTimelines = useEditorStore(selectTimelines)
  const assets = useEditorStore(selectAssets)
  const clips = useEditorStore(selectClips)
  const tracks = useEditorStore(selectTracks)
  const subtitles = useEditorStore(selectSubtitles)
  const markers = useEditorStore(selectMarkers)

  const [selectedVariantIds, setSelectedVariantIds] = useState<string[]>([])

  useEffect(() => {
    if (timeline?.id) {
      setSelectedVariantIds([timeline.id])
    }
  }, [timeline?.id, isOpen])

  const exportClips = useMemo(() => {
    const activeAdjustmentClips = clips.filter(
      c => c.type === 'adjustment' && c.filter && tracks[c.trackIndex]?.enabled !== false
    )

    return clips
      .filter(clip => clip.type === 'video' || clip.type === 'image' || clip.type === 'audio' || clip.type === 'text')
      .filter(clip => tracks[clip.trackIndex]?.enabled !== false)
      .map(clip => {
        // Shared with the preview, so what the monitor grades and what ffmpeg
        // grades cannot drift apart.
        const effectiveFilter = resolveEffectiveClipFilter(clip, activeAdjustmentClips, tracks)

        return {
          id: clip.id,
          path: selectClipPathFromAssets(assets, clip) || '',
          type: clip.type,
          startTime: clip.startTime,
          duration: clip.duration,
          trimStart: clip.trimStart,
          speed: clip.speed || 1,
          reversed: clip.reversed || false,
          flipH: clip.flipH || false,
          flipV: clip.flipV || false,
          opacity: clip.opacity ?? 100,
          trackIndex: clip.trackIndex,
          muted: clip.muted || tracks[clip.trackIndex]?.muted || false,
          volume: clip.volume ?? 1,
          linkedClipIds: clip.linkedClipIds,
          transform: clip.transform ? {
            scale: clip.transform.scale ?? 100,
            positionX: clip.transform.positionX ?? 0,
            positionY: clip.transform.positionY ?? 0,
            rotation: clip.transform.rotation ?? 0,
            cropTop: clip.transform.cropTop ?? 0,
            cropRight: clip.transform.cropRight ?? 0,
            cropBottom: clip.transform.cropBottom ?? 0,
            cropLeft: clip.transform.cropLeft ?? 0,
          } : undefined,
          colorCorrection: clip.colorCorrection ? {
            brightness: clip.colorCorrection.brightness ?? 0,
            contrast: clip.colorCorrection.contrast ?? 0,
            saturation: clip.colorCorrection.saturation ?? 0,
            temperature: clip.colorCorrection.temperature ?? 0,
            tint: clip.colorCorrection.tint ?? 0,
            exposure: clip.colorCorrection.exposure ?? 0,
            highlights: clip.colorCorrection.highlights ?? 0,
            shadows: clip.colorCorrection.shadows ?? 0,
          } : undefined,
          transitionIn: clip.transitionIn ? {
            type: clip.transitionIn.type ?? 'none',
            duration: clip.transitionIn.duration ?? 0,
          } : undefined,
          transitionOut: clip.transitionOut ? {
            type: clip.transitionOut.type ?? 'none',
            duration: clip.transitionOut.duration ?? 0,
          } : undefined,
          filter: effectiveFilter,
          effects: clip.effects ? clip.effects.map(effect => ({
            type: effect.type,
            enabled: effect.enabled ?? true,
            params: effect.params || {},
          })) : undefined,
          textStyle: clip.type === 'text' || clip.textStyle ? {
            text: clip.textStyle?.text ?? (clip.type === 'text' ? 'Text' : ''),
            fontSize: clip.textStyle?.fontSize ?? 64,
            color: clip.textStyle?.color ?? '#FFFFFF',
            backgroundColor: clip.textStyle?.backgroundColor ?? 'transparent',
            positionX: clip.textStyle?.positionX ?? 50,
            positionY: clip.textStyle?.positionY ?? 50,
            strokeColor: clip.textStyle?.strokeColor ?? 'transparent',
            strokeWidth: clip.textStyle?.strokeWidth ?? 0,
            padding: clip.textStyle?.padding ?? 0,
            opacity: clip.textStyle?.opacity ?? 100,
          } : undefined,
          keyframes: clip.keyframes,
          mask: clip.mask,
          chromaKey: clip.chromaKey,
          blendMode: clip.blendMode,
        }
      })
  }, [assets, clips, tracks])

  const subtitleData = useMemo(() => (
    subtitles
      .filter(subtitle => tracks[subtitle.trackIndex]?.enabled !== false)
      .map(subtitle => {
        const track = tracks[subtitle.trackIndex]
        return {
          text: subtitle.text,
          startTime: subtitle.startTime,
          endTime: subtitle.endTime,
          style: {
            ...DEFAULT_SUBTITLE_STYLE,
            ...(track?.subtitleStyle || {}),
            ...(subtitle.style || {}),
          },
        }
      })
  ), [subtitles, tracks])

  const letterbox = useMemo(() => {
    const adjustmentClips = clips.filter(
      clip =>
        clip.type === 'adjustment'
        && clip.letterbox?.enabled
        && tracks[clip.trackIndex]?.enabled !== false,
    )
    if (adjustmentClips.length === 0) return null
    const best = adjustmentClips.reduce((currentBest, candidate) => (
      candidate.duration > currentBest.duration ? candidate : currentBest
    ))
    const config = best.letterbox!
    return {
      ratio: config.aspectRatio === 'custom'
        ? (config.customRatio || 2.35)
        : (LETTERBOX_RATIO_MAP[config.aspectRatio] || 2.35),
      color: config.color || '#000000',
      opacity: (config.opacity ?? 100) / 100,
    }
  }, [clips, tracks])

  const [exportStatus, setExportStatus] = useState<ExportStatus>('idle')
  const [exportType, setExportType] = useState<'package' | 'video' | null>(null)
  const [exportProgress, setExportProgress] = useState(0)
  const [exportError, setExportError] = useState<string | null>(null)
  const [exportPath, setExportPath] = useState<string | null>(null)
  const [exportFrameInfo, setExportFrameInfo] = useState('')
  const abortRef = useRef(false)
  const activeJobIdRef = useRef<string | null>(null)
  const { settings: appSettings } = useSettings()

  const effectiveDimensions = useMemo(() => {
    return getEffectiveTimelineDimensions(timeline, assets, appSettings.defaultFps ?? 30)
  }, [timeline, assets, appSettings.defaultFps])

  // Selected category tab: 'video' | 'social' | 'gif' | 'audio'
  const [activeTab, setActiveTab] = useState<'video' | 'social' | 'gif' | 'audio'>('video')
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null)

  // Export settings
  const [settings, setSettings] = useState<ExportSettings>(() => ({
    codec: 'h264',
    width: effectiveDimensions.width,
    height: effectiveDimensions.height,
    fps: effectiveDimensions.fps,
    quality: 18, // CRF 18 for h264
    customBitrateMbps: 8,
    useCustomBitrate: false,
  }))
  const [burnSubtitles, setBurnSubtitles] = useState(true)

  // Total timeline duration (seconds)
  const timelineDuration = useMemo(() => {
    return exportClips.reduce((max, c) => Math.max(max, c.startTime + c.duration), 0)
  }, [exportClips])

  // Estimated file size
  const estimatedSizeBytes = useMemo(() => {
    return estimateExportFileSize({
      durationSec: timelineDuration,
      codec: settings.codec,
      width: settings.width,
      height: settings.height,
      fps: settings.fps,
      quality: settings.quality,
      customBitrateMbps: settings.useCustomBitrate ? settings.customBitrateMbps : undefined,
    })
  }, [timelineDuration, settings])

  const availableResolutions = useMemo(() => {
    const list: Array<{ label: string; width: number; height: number }> = [
      {
        label: `Project: ${effectiveDimensions.width} × ${effectiveDimensions.height} (${effectiveDimensions.aspectRatioLabel})`,
        width: effectiveDimensions.width,
        height: effectiveDimensions.height,
      },
    ]

    const presets = [
      { label: '1080p (1920 x 1080)', width: 1920, height: 1080 },
      { label: '4K UHD (3840 x 2160)', width: 3840, height: 2160 },
      { label: '720p HD (1280 x 720)', width: 1280, height: 720 },
      { label: 'Vertical 1080p (1080 x 1920)', width: 1080, height: 1920 },
      { label: 'Vertical 720p (720 x 1280)', width: 720, height: 1280 },
      { label: 'Square 1:1 (1080 x 1080)', width: 1080, height: 1080 },
      { label: 'Portrait 4:5 (1080 x 1350)', width: 1080, height: 1350 },
    ]

    for (const p of presets) {
      if (!list.some(r => r.width === p.width && r.height === p.height)) {
        list.push(p)
      }
    }
    return list
  }, [effectiveDimensions])

  const availableFps = useMemo(() => {
    const list = [...FRAME_RATES]
    if (!list.includes(effectiveDimensions.fps)) {
      list.push(effectiveDimensions.fps)
      list.sort((a, b) => a - b)
    }
    return list
  }, [effectiveDimensions.fps])

  const closeModal = useCallback(() => {
    closeExportModal()
  }, [closeExportModal])

  const hasSubtitles = subtitleData.length > 0

  useEffect(() => {
    if (!isOpen) return
    const dims = getEffectiveTimelineDimensions(timeline, assets, appSettings.defaultFps ?? 30)
    setSettings(prev => ({
      ...prev,
      width: dims.width,
      height: dims.height,
      fps: dims.fps,
    }))
    setExportStatus('idle')
    setExportType(null)
    setExportProgress(0)
    setExportError(null)
    setExportPath(null)
    setExportFrameInfo('')
    abortRef.current = false
    activeJobIdRef.current = null
    setSelectedPresetId(null)
    setActiveTab('video')
  }, [isOpen, appSettings.defaultFps, timeline, assets])

  // Subscribe to real FFmpeg progress events from main process
  useEffect(() => {
    if (!window.electronAPI?.on) return

    const unsubProgress = window.electronAPI.on('render:progress', payload => {
      if (activeJobIdRef.current && payload.jobId === activeJobIdRef.current) {
        setExportProgress(Math.round(payload.percent))
        const parts: string[] = []
        if (payload.fps) parts.push(`${Math.round(payload.fps)} fps`)
        if (payload.speed) parts.push(`${payload.speed.toFixed(1)}x`)
        setExportFrameInfo(parts.length > 0 ? `Rendering... (${parts.join(', ')})` : 'Rendering...')
      }
    })

    const unsubComplete = window.electronAPI.on('render:complete', payload => {
      if (activeJobIdRef.current && payload.jobId === activeJobIdRef.current) {
        setExportProgress(100)
        setExportPath(payload.outputPath)
        setExportFrameInfo('Export complete')
        setExportStatus('done')
        activeJobIdRef.current = null

        const isWindowFocusedAndModalOpen = typeof document !== 'undefined' && document.hasFocus() && isOpen
        if (appSettings.exportNotifications && !isWindowFocusedAndModalOpen) {
          window.electronAPI?.showNotification({
            title: t('export.complete'),
            body: `${t('export.exportSuccessNotification', { name: projectName })} ${t('export.showInFolder')}`,
            filePath: payload.outputPath,
          })
        }
      }
    })

    const unsubError = window.electronAPI.on('render:error', payload => {
      if (activeJobIdRef.current && payload.jobId === activeJobIdRef.current) {
        setExportError(payload.error)
        setExportStatus('error')
        activeJobIdRef.current = null
      }
    })

    return () => {
      unsubProgress()
      unsubComplete()
      unsubError()
    }
  }, [])

  // Update quality default when codec changes
  const handleCodecChange = useCallback((codec: ExportCodec) => {
    let quality = 18
    if (codec === 'prores') quality = 3 // HQ profile
    if (codec === 'vp9') quality = 8 // 8 Mbps
    setSettings(prev => ({
      ...prev,
      codec,
      quality,
      // If switching to GIF, cap FPS to 15 or 30
      fps: codec === 'gif' ? Math.min(30, prev.fps) : prev.fps,
    }))
  }, [])

  // Select Social Preset
  const handleSelectSocialPreset = useCallback((preset: typeof SOCIAL_PRESETS[0]) => {
    setSelectedPresetId(preset.id)
    setSettings(prev => ({
      ...prev,
      codec: 'h264',
      width: preset.width,
      height: preset.height,
      fps: preset.fps,
      customBitrateMbps: preset.bitrateMbps,
      useCustomBitrate: true,
      quality: 18,
    }))
  }, [])

  const handleExportPackage = useCallback(async () => {
    if (!timeline) return
    setExportType('package')
    setExportStatus('exporting')
    setExportProgress(0)
    setExportError(null)

    try {
      const filePath = await window.electronAPI?.showSaveDialog({
        title: 'Export FCPXML Package',
        defaultPath: `${projectName}_${timeline.name}.fcpxml`,
        filters: [
          { name: 'Final Cut Pro XML', extensions: ['fcpxml'] },
          { name: 'All Files', extensions: ['*'] },
        ],
      })

      if (!filePath) {
        setExportStatus('idle')
        return
      }

      setExportFrameInfo('Generating FCPXML...')
      const xml = generateFCPXML(clips, tracks, projectName, timeline.name)
      const result = await window.electronAPI?.saveFile({ filePath, data: xml })
      if (result?.success) {
        setExportProgress(100)
        setExportPath(filePath)
        setExportStatus('done')

        const isWindowFocusedAndModalOpen = typeof document !== 'undefined' && document.hasFocus() && isOpen
        if (appSettings.exportNotifications && !isWindowFocusedAndModalOpen) {
          window.electronAPI?.showNotification({
            title: t('export.complete'),
            body: `${t('export.exportSuccessNotification', { name: projectName })} ${t('export.showInFolder')}`,
            filePath,
          })
        }
      } else {
        throw new Error(result && !result.success ? result.error : 'Failed to save file')
      }
    } catch (err) {
      setExportError(String(err))
      setExportStatus('error')
    }
  }, [clips, tracks, timeline, projectName])

  const handleExportVideo = useCallback(async () => {
    if (!timeline || exportClips.length === 0) return
    setExportType('video')
    setExportStatus('exporting')
    setExportProgress(0)
    setExportError(null)
    setExportFrameInfo('Preparing...')
    abortRef.current = false

    try {
      const codecInfo = CODEC_INFO[settings.codec]
      
      const filePath = await window.electronAPI?.showSaveDialog({
        title: `Export ${codecInfo.label}`,
        defaultPath: `${projectName}_${timeline.name}.${codecInfo.ext}`,
        filters: [
          { name: codecInfo.filterName, extensions: [codecInfo.ext] },
          { name: 'All Files', extensions: ['*'] },
        ],
      })

      if (!filePath) {
        setExportStatus('idle')
        return
      }

      setExportFrameInfo('Starting render job...')

      const videoBitrateKbps = settings.useCustomBitrate && settings.customBitrateMbps
        ? settings.customBitrateMbps * 1000
        : undefined

      // Start asynchronous render job with real progress tracking
      const startResult = await window.electronAPI?.['render.start']({
        clips: exportClips,
        outputPath: filePath,
        codec: settings.codec,
        width: settings.width,
        height: settings.height,
        fps: settings.fps,
        quality: settings.quality,
        videoBitrate: videoBitrateKbps,
        background: timeline?.background,
        letterbox: letterbox || undefined,
        subtitles: burnSubtitles && subtitleData.length > 0 ? subtitleData : undefined,
        transitions: timeline?.transitions?.length ? timeline.transitions.map(transition => ({
          leftClipId: transition.leftClipId,
          rightClipId: transition.rightClipId,
          type: transition.type,
          duration: transition.duration,
        })) : undefined,
        hardwareAcceleration: appSettings.hardwareAcceleration,
        markers: markers.length > 0 ? markers.map(m => ({
          id: m.id,
          time: m.time,
          label: m.label,
          color: m.color,
        })) : undefined,
      })

      if (!startResult?.success || !startResult.jobId) {
        throw new Error(startResult && !startResult.success ? startResult.error : 'Failed to start render')
      }

      activeJobIdRef.current = startResult.jobId
    } catch (err) {
      setExportError(String(err))
      setExportStatus('error')
    }
  }, [burnSubtitles, exportClips, letterbox, projectName, settings, subtitleData, timeline, markers, appSettings.hardwareAcceleration])

  const handleCancel = useCallback(async () => {
    abortRef.current = true
    const currentJobId = activeJobIdRef.current
    if (currentJobId) {
      window.electronAPI?.['render.cancel']({ jobId: currentJobId }).catch(() => {})
      activeJobIdRef.current = null
    } else {
      window.electronAPI?.exportCancel({ sessionId: 'current' }).catch(() => {})
    }
    setExportStatus('idle')
  }, [])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={closeModal}>
      <div 
        className="bg-zinc-900 rounded-2xl border border-zinc-700/50 shadow-2xl w-full max-w-xl relative overflow-hidden max-h-[calc(100vh-2rem)] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
          <div>
            <h2 className="text-lg font-bold text-white">{t('export.title')}</h2>
            <p className="text-xs text-zinc-500">
              Duration: {Math.floor(timelineDuration / 60)}:{String(Math.floor(timelineDuration % 60)).padStart(2, '0')} · {formatFileSize(estimatedSizeBytes)} est.
            </p>
          </div>
          <button
            onClick={closeModal}
            className="p-1.5 rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1">
          {/* Exporting state */}
          {exportStatus === 'exporting' && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <Loader2 className="h-5 w-5 text-blue-400 animate-spin" />
                <span className="text-sm text-zinc-300">
                  {exportType === 'package' ? 'Generating FCPXML...' : `Rendering ${CODEC_INFO[settings.codec]?.label || 'output'}...`}
                </span>
              </div>
              <div className="w-full bg-zinc-800 rounded-full h-2 overflow-hidden">
                <div 
                  className="h-full bg-blue-500 rounded-full transition-all duration-300"
                  style={{ width: `${exportProgress}%` }}
                />
              </div>
              <div className="flex items-center justify-between">
                <p className="text-xs text-zinc-500">{exportProgress}% complete</p>
                {exportFrameInfo && <p className="text-xs text-zinc-500">{exportFrameInfo}</p>}
              </div>
              {exportType === 'video' && (
                <Button
                  variant="outline"
                  size="sm"
                  className="border-zinc-700 text-zinc-400"
                  onClick={handleCancel}
                >
                  {t('export.cancel')}
                </Button>
              )}
            </div>
          )}

          {/* Done state */}
          {exportStatus === 'done' && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center">
                  <Check className="h-5 w-5 text-green-400" />
                </div>
                <div>
                  <p className="text-sm text-white font-medium">{t('export.complete')}</p>
                  <p className="text-xs text-zinc-500 truncate max-w-[380px]">{exportPath}</p>
                  {exportFrameInfo && <p className="text-xs text-zinc-500">{exportFrameInfo}</p>}
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="border-zinc-700 text-zinc-300"
                  onClick={() => {
                    if (exportPath) {
                      window.electronAPI?.openParentFolderOfFile({ filePath: exportPath })
                    }
                  }}
                >
                  <FolderOpen className="h-4 w-4 mr-2" />
                  {t('export.openFolder')}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-zinc-700 text-zinc-300"
                  onClick={() => {
                    setExportStatus('idle')
                    setExportType(null)
                  }}
                >
                  Export Another
                </Button>
              </div>
            </div>
          )}

          {/* Error state */}
          {exportStatus === 'error' && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-red-500/20 flex items-center justify-center">
                  <AlertCircle className="h-5 w-5 text-red-400" />
                </div>
                <div>
                  <p className="text-sm text-white font-medium">{t('export.failed', { error: '' }).replace(/:\s*$/, '')}</p>
                  <p className="text-xs text-red-400 max-w-[380px] break-words">{exportError}</p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="border-zinc-700 text-zinc-300"
                onClick={() => {
                  setExportStatus('idle')
                  setExportType(null)
                }}
              >
                Try Again
              </Button>
            </div>
          )}

          {/* Idle state — settings */}
          {exportStatus === 'idle' && (
            <div className="space-y-5">
              {/* Category tabs */}
              <div className="grid grid-cols-4 gap-1.5 p-1 bg-zinc-800/60 rounded-xl border border-zinc-700/50">
                <button
                  onClick={() => {
                    setActiveTab('video')
                    handleCodecChange('h264')
                  }}
                  className={`py-2 px-2 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                    activeTab === 'video'
                      ? 'bg-zinc-700 text-white shadow-sm'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <Film className="h-3.5 w-3.5" />
                  Video
                </button>
                <button
                  onClick={() => {
                    setActiveTab('social')
                    if (!selectedPresetId) {
                      handleSelectSocialPreset(SOCIAL_PRESETS[0])
                    }
                  }}
                  className={`py-2 px-2 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                    activeTab === 'social'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  Social
                </button>
                <button
                  onClick={() => {
                    setActiveTab('gif')
                    handleCodecChange('gif')
                  }}
                  className={`py-2 px-2 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                    activeTab === 'gif'
                      ? 'bg-amber-600 text-white shadow-sm'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <Sliders className="h-3.5 w-3.5" />
                  GIF
                </button>
                <button
                  onClick={() => {
                    setActiveTab('audio')
                    handleCodecChange('mp3')
                  }}
                  className={`py-2 px-2 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                    activeTab === 'audio'
                      ? 'bg-purple-600 text-white shadow-sm'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <Music className="h-3.5 w-3.5" />
                  Audio
                </button>
              </div>

              {/* TAB 1: SOCIAL PRESETS */}
              {activeTab === 'social' && (
                <div className="space-y-3">
                  <div className="space-y-2">
                    <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold block">
                      Social Media Presets
                    </label>
                    <div className="grid grid-cols-1 gap-2">
                      {SOCIAL_PRESETS.map(preset => {
                        const isSelected = selectedPresetId === preset.id
                        return (
                          <button
                            key={preset.id}
                            onClick={() => handleSelectSocialPreset(preset)}
                            className={`p-3 rounded-xl border text-left transition-all flex items-center justify-between ${
                              isSelected
                                ? 'border-blue-500 bg-blue-500/10 text-white'
                                : 'border-zinc-700/60 bg-zinc-800/40 text-zinc-300 hover:border-zinc-600'
                            }`}
                          >
                            <div className="space-y-0.5">
                              <p className="text-xs font-semibold text-white flex items-center gap-2">
                                {preset.name}
                                <span className="px-1.5 py-0.5 text-[9px] font-bold rounded bg-zinc-700 text-blue-300">
                                  {preset.aspectRatio}
                                </span>
                              </p>
                              <p className="text-[10px] text-zinc-400">{preset.description}</p>
                            </div>
                            <div className="text-right flex-shrink-0 ml-3">
                              <span className="text-xs font-bold text-zinc-200">{preset.bitrateMbps} Mbps</span>
                              <p className="text-[10px] text-zinc-500">{preset.fps} fps</p>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: CUSTOM VIDEO */}
              {activeTab === 'video' && (
                <div className="space-y-3">
                  <div>
                    <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold mb-2 block">Format</label>
                    <div className="grid grid-cols-3 gap-2">
                      {(['h264', 'prores', 'vp9'] as ExportCodec[]).map(codec => (
                        <button
                          key={codec}
                          onClick={() => handleCodecChange(codec)}
                          className={`p-2.5 rounded-lg border text-center transition-all ${
                            settings.codec === codec
                              ? 'border-blue-500 bg-blue-500/10 text-white'
                              : 'border-zinc-700 bg-zinc-800/50 text-zinc-400 hover:border-zinc-600 hover:text-zinc-300'
                          }`}
                        >
                          <p className="text-xs font-semibold">{CODEC_INFO[codec].label.split(' / ')[0]}</p>
                          <p className="text-[9px] text-zinc-500 mt-0.5">.{CODEC_INFO[codec].ext}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 3: GIF ANIMATION */}
              {activeTab === 'gif' && (
                <div className="space-y-3">
                  <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                    <p className="text-xs font-medium text-amber-300">High-Quality GIF Export</p>
                    <p className="text-[10px] text-zinc-400 mt-1">
                      Rendered using 2-pass color palette generation (palettegen / paletteuse) with Bayer dithering for smooth gradients.
                    </p>
                  </div>
                </div>
              )}

              {/* TAB 4: AUDIO ONLY */}
              {activeTab === 'audio' && (
                <div className="space-y-3">
                  <div>
                    <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold mb-2 block">Audio Format</label>
                    <div className="grid grid-cols-3 gap-2">
                      {(['wav', 'mp3', 'aac'] as ExportCodec[]).map(codec => (
                        <button
                          key={codec}
                          onClick={() => handleCodecChange(codec)}
                          className={`p-2.5 rounded-lg border text-center transition-all ${
                            settings.codec === codec
                              ? 'border-purple-500 bg-purple-500/10 text-white'
                              : 'border-zinc-700 bg-zinc-800/50 text-zinc-400 hover:border-zinc-600 hover:text-zinc-300'
                          }`}
                        >
                          <p className="text-xs font-semibold">{CODEC_INFO[codec].label.split(' / ')[0]}</p>
                          <p className="text-[9px] text-zinc-500 mt-0.5">.{CODEC_INFO[codec].ext}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* RESOLUTION & FRAME RATE (Hidden for audio-only) */}
              {activeTab !== 'audio' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold mb-1.5 block">{t('export.resolution')}</label>
                    <div className="relative">
                      <select
                        value={`${settings.width}x${settings.height}`}
                        onChange={(e) => {
                          const [w, h] = e.target.value.split('x').map(Number)
                          setSettings(prev => ({ ...prev, width: w, height: h }))
                        }}
                        className="w-full appearance-none bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 pr-8 cursor-pointer"
                      >
                        {availableResolutions.map(r => (
                          <option key={`${r.width}x${r.height}`} value={`${r.width}x${r.height}`}>
                            {r.label}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500 pointer-events-none" />
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold mb-1.5 block">{t('export.frameRate')}</label>
                    <div className="relative">
                      <select
                        value={settings.fps}
                        onChange={(e) => setSettings(prev => ({ ...prev, fps: parseFloat(e.target.value) }))}
                        className="w-full appearance-none bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 pr-8 cursor-pointer"
                      >
                        {availableFps.map(fps => (
                          <option key={fps} value={fps}>{fps} fps</option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500 pointer-events-none" />
                    </div>
                  </div>
                </div>
              )}

              {/* BITRATE & QUALITY CONTROLS */}
              {activeTab !== 'audio' && activeTab !== 'gif' && (
                <div className="space-y-3 pt-1 border-t border-zinc-800">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold block">{t('export.quality')}</label>
                    {(settings.codec === 'h264' || settings.codec === 'vp9') && (
                      <label className="flex items-center gap-1.5 text-xs text-zinc-400 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={Boolean(settings.useCustomBitrate)}
                          onChange={(e) => setSettings(prev => ({ ...prev, useCustomBitrate: e.target.checked }))}
                          className="w-3.5 h-3.5 rounded border-zinc-600 bg-zinc-800 accent-blue-500 cursor-pointer"
                        />
                        <span>{t('export.useCustomBitrate')}</span>
                      </label>
                    )}
                  </div>

                  {/* Custom Bitrate input box */}
                  {settings.useCustomBitrate && (settings.codec === 'h264' || settings.codec === 'vp9') ? (
                    <div className="flex items-center gap-3 bg-zinc-800/70 p-2.5 rounded-lg border border-zinc-700">
                      <span className="text-xs text-zinc-300 font-medium whitespace-nowrap">Target Bitrate:</span>
                      <input
                        type="number"
                        min={1}
                        max={100}
                        step={0.5}
                        value={settings.customBitrateMbps || 8}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value) || 1
                          setSettings(prev => ({ ...prev, customBitrateMbps: Math.max(0.5, val) }))
                        }}
                        className="w-24 bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-blue-500 text-right"
                      />
                      <span className="text-xs text-zinc-400">Mbps</span>
                      <div className="flex-1 text-right text-xs text-blue-400">
                        ~{formatFileSize(estimatedSizeBytes)}
                      </div>
                    </div>
                  ) : (
                    <>
                      {settings.codec === 'h264' && (
                        <div className="flex items-center gap-3">
                          <input
                            type="range"
                            min={15}
                            max={28}
                            step={1}
                            value={settings.quality}
                            onChange={(e) => setSettings(prev => ({ ...prev, quality: parseInt(e.target.value) }))}
                            className="flex-1 h-1.5 accent-blue-500 cursor-pointer"
                          />
                          <span className="text-xs text-zinc-400 w-16 text-right">
                            {settings.quality <= 18 ? 'High' : settings.quality <= 23 ? 'Medium' : 'Low'}
                            <span className="text-zinc-600 ml-1">({settings.quality})</span>
                          </span>
                        </div>
                      )}
                      {settings.codec === 'prores' && (
                        <div className="grid grid-cols-4 gap-1.5">
                          {PRORES_PROFILES.map(p => (
                            <button
                              key={p.value}
                              onClick={() => setSettings(prev => ({ ...prev, quality: p.value }))}
                              className={`py-1.5 px-2 rounded-md text-xs font-medium transition-all ${
                                settings.quality === p.value
                                  ? 'bg-blue-500/20 border border-blue-500 text-blue-300'
                                  : 'bg-zinc-800 border border-zinc-700 text-zinc-400 hover:border-zinc-600'
                              }`}
                            >
                              {p.label}
                            </button>
                          ))}
                        </div>
                      )}
                      {settings.codec === 'vp9' && (
                        <div className="flex items-center gap-3">
                          <input
                            type="range"
                            min={2}
                            max={20}
                            step={1}
                            value={settings.quality}
                            onChange={(e) => setSettings(prev => ({ ...prev, quality: parseInt(e.target.value) }))}
                            className="flex-1 h-1.5 accent-blue-500 cursor-pointer"
                          />
                          <span className="text-xs text-zinc-400 w-20 text-right">
                            {settings.quality} Mbps
                          </span>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* ESTIMATED SIZE BADGE */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-zinc-800/40 border border-zinc-700/40">
                <div className="space-y-0.5">
                  <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold block">{t('export.estimatedSize')}</span>
                  <p className="text-sm font-bold text-emerald-400">~{formatFileSize(estimatedSizeBytes)}</p>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold block">Format</span>
                  <p className="text-xs text-zinc-300 font-medium">.{CODEC_INFO[settings.codec]?.ext.toUpperCase()}</p>
                </div>
              </div>

              {/* SUBTITLES OPTION (Video only) */}
              {hasSubtitles && activeTab !== 'audio' && activeTab !== 'gif' && (
                <div className="space-y-2">
                  <label className="flex items-center gap-2.5 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={burnSubtitles}
                      onChange={(e) => setBurnSubtitles(e.target.checked)}
                      className="w-4 h-4 rounded border-zinc-600 bg-zinc-800 accent-blue-500 cursor-pointer"
                    />
                    <span className="text-xs text-zinc-300 group-hover:text-white transition-colors">{t('export.burnSubtitles')}</span>
                  </label>
                </div>
              )}

              {/* TIMELINE VARIANTS BATCH EXPORT OPTION */}
              {allTimelines.length > 1 && (
                <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-xs font-semibold text-zinc-300">
                      <GitBranch className="h-3.5 w-3.5 text-indigo-400" />
                      Export Variants ({selectedVariantIds.length}/{allTimelines.length})
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        if (selectedVariantIds.length === allTimelines.length) {
                          if (timeline?.id) setSelectedVariantIds([timeline.id])
                        } else {
                          setSelectedVariantIds(allTimelines.map(t => t.id))
                        }
                      }}
                      className="text-[10px] text-indigo-400 hover:text-indigo-300 font-medium"
                    >
                      {selectedVariantIds.length === allTimelines.length ? 'Current Only' : 'Select All'}
                    </button>
                  </div>
                  <div className="space-y-1 max-h-32 overflow-y-auto pt-1">
                    {allTimelines.map(tl => {
                      const isChecked = selectedVariantIds.includes(tl.id)
                      const isCurrent = tl.id === timeline?.id
                      return (
                        <label
                          key={tl.id}
                          className={`flex items-center justify-between px-2 py-1.5 rounded text-xs cursor-pointer transition-colors ${
                            isChecked ? 'bg-indigo-950/40 text-indigo-200' : 'text-zinc-400 hover:bg-zinc-900'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedVariantIds(prev => [...prev, tl.id])
                                } else {
                                  if (selectedVariantIds.length > 1) {
                                    setSelectedVariantIds(prev => prev.filter(id => id !== tl.id))
                                  }
                                }
                              }}
                              className="w-3.5 h-3.5 rounded border-zinc-700 bg-zinc-800 accent-indigo-600 cursor-pointer"
                            />
                            <span className="truncate font-medium">{tl.name}</span>
                            {tl.variantTag && (
                              <span className="rounded bg-indigo-950 px-1 text-[9px] text-indigo-300 border border-indigo-800/50">
                                {tl.variantTag}
                              </span>
                            )}
                          </div>
                          {isCurrent && (
                            <span className="text-[9px] text-zinc-500 uppercase tracking-wider">Active</span>
                          )}
                        </label>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Main Export Action Button */}
              <button
                onClick={handleExportVideo}
                disabled={exportClips.length === 0}
                className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold text-sm flex items-center justify-center gap-2 transition-colors shadow-lg shadow-blue-600/20"
              >
                {activeTab === 'audio' ? (
                  <>
                    <Music className="h-4 w-4" />
                    Export Audio ({CODEC_INFO[settings.codec]?.label.split(' ')[0]})
                  </>
                ) : activeTab === 'gif' ? (
                  <>
                    <Sliders className="h-4 w-4" />
                    Export Animated GIF
                  </>
                ) : (
                  <>
                    <Film className="h-4 w-4" />
                    {selectedVariantIds.length > 1
                      ? `Export ${selectedVariantIds.length} Variants (Batch)`
                      : t('export.startExport')}
                  </>
                )}
              </button>

              {/* Package export (compact) at the bottom */}
              <div className="pt-2 border-t border-zinc-800">
                <button
                  onClick={handleExportPackage}
                  className="w-full flex items-center gap-3 p-2.5 rounded-xl border border-zinc-700/40 bg-zinc-800/30 hover:bg-zinc-800/70 hover:border-zinc-600 transition-all group"
                >
                  <div className="w-8 h-8 rounded-lg bg-zinc-700/40 flex items-center justify-center flex-shrink-0">
                    <Package className="h-4 w-4 text-zinc-400" />
                  </div>
                  <div className="flex-1 text-left">
                    <p className="text-xs font-semibold text-zinc-300">Package (FCPXML)</p>
                    <p className="text-[9px] text-zinc-500">For Premiere Pro &amp; DaVinci Resolve</p>
                  </div>
                  <Download className="h-3.5 w-3.5 text-zinc-500 group-hover:text-zinc-300 transition-colors mr-1" />
                </button>
              </div>

              {exportClips.length === 0 && (
                <p className="text-xs text-zinc-500 text-center">Add clips to the timeline to export.</p>
              )}
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
