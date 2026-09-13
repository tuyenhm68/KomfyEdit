import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import {
  Search,
  X,
  Play,
  Pause,
  Plus,
  VolumeX,
  Upload,
  Check,
} from 'lucide-react'
import {
  SFX_DEFINITIONS,
  SFX_CATEGORIES,
  type SfxCategory,
  type SfxDefinition,
} from '@core/sfx'
import type { Asset } from '../../types/project-model'
import { useEditorActions, useEditorStore } from './editor-store'
import { useTranslation } from '../../i18n/I18nContext'
import { pathToFileUrl } from '../../lib/file-url'

export interface SoundEffectsLibraryProps {
  importFiles?: (files: FileList | File[]) => Promise<unknown>
}

export function SoundEffectsLibrary({ importFiles }: SoundEffectsLibraryProps) {
  const { t, language } = useTranslation()
  const actions = useEditorActions()
  const assets = useEditorStore(s => s.editorModel.assets)

  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<SfxCategory | 'all' | 'custom'>('all')
  const [playingSfxId, setPlayingSfxId] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<{ id: string; name: string } | null>(null)

  const audioRef = useRef<HTMLAudioElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const feedbackTimerRef = useRef<number | null>(null)

  // Cleanup audio playback on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current.src = ''
        audioRef.current = null
      }
      if (feedbackTimerRef.current) {
        window.clearTimeout(feedbackTimerRef.current)
      }
    }
  }, [])

  // Filter custom user-imported audio assets
  const customAudio = useMemo(() => {
    return assets.filter(a => a.type === 'audio' && !a.source)
  }, [assets])

  // Filter built-in SFX by category and search (matching both English & Vietnamese)
  const filteredBuiltInSfx = useMemo(() => {
    if (selectedCategory === 'custom') return []
    const q = searchQuery.toLowerCase().trim()
    return SFX_DEFINITIONS.filter(sfx => {
      const matchCat = selectedCategory === 'all' || sfx.category === selectedCategory
      if (!matchCat) return false
      if (!q) return true
      const localizedName = (t(`library.sfx.items.${sfx.id}` as any) || '').toLowerCase()
      const localizedDesc = (t(`library.sfx.descriptions.${sfx.id}` as any) || '').toLowerCase()
      return (
        sfx.name.toLowerCase().includes(q) ||
        sfx.description.toLowerCase().includes(q) ||
        localizedName.includes(q) ||
        localizedDesc.includes(q) ||
        sfx.keywords.some(k => k.toLowerCase().includes(q)) ||
        sfx.id.toLowerCase().includes(q)
      )
    })
  }, [selectedCategory, searchQuery, t])

  // Filter custom imported audio
  const filteredCustomAudio = useMemo(() => {
    if (selectedCategory !== 'all' && selectedCategory !== 'custom') return []
    const q = searchQuery.toLowerCase().trim()
    return customAudio.filter(a => {
      if (!q) return true
      const filename = a.path.split(/[/\\]/).pop() || a.id
      return filename.toLowerCase().includes(q) || (a.prompt && a.prompt.toLowerCase().includes(q))
    })
  }, [selectedCategory, customAudio, searchQuery])

  // Audio preview playback handler
  const handleTogglePlay = useCallback((sfxId: string, audioSrc: string) => {
    if (playingSfxId === sfxId) {
      // Pause current
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current.currentTime = 0
      }
      setPlayingSfxId(null)
      return
    }

    // Stop previous audio
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
    }

    const audio = new Audio(audioSrc)
    audioRef.current = audio
    setPlayingSfxId(sfxId)

    audio.onended = () => {
      setPlayingSfxId(null)
    }
    audio.onerror = () => {
      setPlayingSfxId(null)
    }

    audio.play().catch(() => {
      setPlayingSfxId(null)
    })
  }, [playingSfxId])

  // Add built-in SFX to timeline
  const handleAddBuiltIn = useCallback((sfx: SfxDefinition) => {
    actions.addSfxClip({ sfxId: sfx.id })
    const displayName = t(`library.sfx.items.${sfx.id}` as any) || sfx.name
    setFeedback({ id: sfx.id, name: displayName })
    if (feedbackTimerRef.current) window.clearTimeout(feedbackTimerRef.current)
    feedbackTimerRef.current = window.setTimeout(() => setFeedback(null), 2000)
  }, [actions, t])

  // Add custom audio to timeline
  const handleAddCustom = useCallback((asset: Asset) => {
    actions.insertAssetsToTimeline({ assets: [asset] })
    const name = asset.path.split(/[/\\]/).pop() || asset.id
    setFeedback({ id: asset.id, name })
    if (feedbackTimerRef.current) window.clearTimeout(feedbackTimerRef.current)
    feedbackTimerRef.current = window.setTimeout(() => setFeedback(null), 2000)
  }, [actions])

  // Handle custom audio file input
  const handleFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files.length > 0 && importFiles) {
      await importFiles(files)
      setSelectedCategory('custom')
    }
    e.target.value = ''
  }

  const totalResults = filteredBuiltInSfx.length + filteredCustomAudio.length

  const getCategoryLabel = (catId: string) => {
    const fromI18n = t(`library.sfx.categories.${catId}` as any)
    if (fromI18n && fromI18n !== `library.sfx.categories.${catId}`) return fromI18n
    const cat = SFX_CATEGORIES.find(c => c.id === catId)
    if (!cat) return catId
    return language === 'vi' ? cat.nameVi : cat.nameEn
  }

  return (
    <div className="flex h-full flex-col gap-3">
      {/* Header controls: Search & Import */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500" />
          <input
            type="text"
            placeholder={t('library.sfx.searchPlaceholder')}
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

        {importFiles && (
          <>
            <button
              onClick={() => fileInputRef.current?.click()}
              title={t('library.sfx.importTitle')}
              className="flex h-[30px] items-center gap-1.5 rounded-[6px] border border-zinc-800 bg-zinc-900 px-2.5 text-[11px] font-medium text-zinc-300 hover:border-zinc-700 hover:bg-zinc-800 hover:text-white transition-colors flex-shrink-0"
            >
              <Upload className="h-3.5 w-3.5" />
              <span>{t('library.sfx.importBtn')}</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*,.wav,.mp3,.aac,.m4a,.ogg"
              multiple
              className="hidden"
              onChange={handleFileInput}
            />
          </>
        )}
      </div>

      {/* Category Pills */}
      <div className="flex flex-wrap gap-1.5 pb-1">
        {SFX_CATEGORIES.map(cat => {
          const isActive = selectedCategory === cat.id
          const label = getCategoryLabel(cat.id)
          return (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id as any)}
              className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-all ${
                isActive
                  ? 'bg-accent text-zinc-950 shadow-sm font-semibold'
                  : 'bg-zinc-900/80 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 border border-zinc-800/80'
              }`}
            >
              {label}
            </button>
          )
        })}
        {customAudio.length > 0 && (
          <button
            onClick={() => setSelectedCategory('custom')}
            className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-all ${
              selectedCategory === 'custom'
                ? 'bg-accent text-zinc-950 shadow-sm font-semibold'
                : 'bg-zinc-900/80 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 border border-zinc-800/80'
            }`}
          >
            {t('library.sfx.customTab')} ({customAudio.length})
          </button>
        )}
      </div>

      {/* Added notice banner */}
      {feedback && (
        <div className="flex items-center gap-2 rounded-md bg-emerald-950/60 border border-emerald-800/80 px-2.5 py-1.5 text-[11px] text-emerald-300 transition-all animate-fadeIn">
          <Check className="h-3.5 w-3.5 flex-shrink-0" />
          <span className="truncate">{t('library.sfx.insertedFeedback', { name: feedback.name })}</span>
        </div>
      )}

      {/* Sound List Container */}
      <div className="flex-1 overflow-y-auto pr-1">
        {totalResults === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <VolumeX className="h-8 w-8 text-zinc-600 mb-2" />
            <p className="text-[12px] text-zinc-400">
              {t('library.sfx.noResults')}
            </p>
            {selectedCategory === 'custom' && (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="mt-3 flex items-center gap-1.5 rounded-[6px] bg-accent px-3 py-1.5 text-[11px] font-semibold text-zinc-950 hover:bg-accent/90 transition-colors"
              >
                <Upload className="h-3.5 w-3.5" />
                <span>{t('library.sfx.importAudioFile')}</span>
              </button>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {/* Built-in SFX list */}
            {filteredBuiltInSfx.map(sfx => {
              const isPlaying = playingSfxId === sfx.id
              const audioSrc = `/sfx/${sfx.filename}`
              const soundName = t(`library.sfx.items.${sfx.id}` as any) || sfx.name
              const soundDesc = t(`library.sfx.descriptions.${sfx.id}` as any) || sfx.description
              const playLabel = isPlaying ? t('library.sfx.previewPause') : t('library.sfx.previewPlay')

              return (
                <div
                  key={sfx.id}
                  className={`group relative flex items-center justify-between rounded-lg border px-3 py-2 transition-all cursor-pointer ${
                    isPlaying
                      ? 'border-accent/80 bg-accent/10 shadow-sm'
                      : 'border-zinc-800/80 bg-zinc-900/50 hover:border-zinc-700 hover:bg-zinc-800/80'
                  }`}
                  onClick={() => handleTogglePlay(sfx.id, audioSrc)}
                >
                  {/* Left: Play/Pause button + Info */}
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <button
                      type="button"
                      aria-label={playLabel}
                      title={playLabel}
                      onClick={(e) => {
                        e.stopPropagation()
                        handleTogglePlay(sfx.id, audioSrc)
                      }}
                      className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full transition-all ${
                        isPlaying
                          ? 'bg-accent text-zinc-950 scale-105'
                          : 'bg-zinc-800 text-zinc-300 group-hover:bg-zinc-700 group-hover:text-white'
                      }`}
                    >
                      {isPlaying ? (
                        <Pause className="h-3.5 w-3.5 fill-current" />
                      ) : (
                        <Play className="h-3.5 w-3.5 fill-current ml-0.5" />
                      )}
                    </button>

                    <div className="flex flex-col min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-[12px] font-medium text-zinc-200 group-hover:text-white">
                          {soundName}
                        </span>
                        <span className="flex-shrink-0 rounded bg-zinc-800/80 px-1.5 py-0.2 text-[9px] font-mono text-zinc-400">
                          {sfx.duration.toFixed(2)}s
                        </span>
                      </div>
                      <span className="truncate text-[10px] text-zinc-500 group-hover:text-zinc-400">
                        {soundDesc}
                      </span>
                    </div>
                  </div>

                  {/* Right: Category tag & Add button */}
                  <div className="flex items-center gap-2 ml-2 flex-shrink-0">
                    <span className="rounded bg-zinc-800/50 border border-zinc-700/40 px-1.5 py-0.5 text-[9px] text-zinc-400">
                      {getCategoryLabel(sfx.category)}
                    </span>

                    <button
                      type="button"
                      title={t('library.sfx.addToTimeline')}
                      onClick={(e) => {
                        e.stopPropagation()
                        handleAddBuiltIn(sfx)
                      }}
                      className="flex h-6 w-6 items-center justify-center rounded-full bg-zinc-800 text-zinc-400 hover:bg-accent hover:text-zinc-950 opacity-80 group-hover:opacity-100 transition-all shadow-sm"
                    >
                      <Plus className="h-3.5 w-3.5 stroke-[2.5]" />
                    </button>
                  </div>
                </div>
              )
            })}

            {/* Custom Audio List */}
            {filteredCustomAudio.length > 0 && (
              <div className="mt-2 pt-2 border-t border-zinc-800/80">
                {selectedCategory === 'all' && (
                  <h4 className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-2">
                    {t('library.sfx.customAudio')} ({filteredCustomAudio.length})
                  </h4>
                )}
                {filteredCustomAudio.map(asset => {
                  const name = asset.path.split(/[/\\]/).pop() || asset.id
                  const isPlaying = playingSfxId === asset.id
                  const audioSrc = pathToFileUrl(asset.path)
                  const playLabel = isPlaying ? t('library.sfx.previewPause') : t('library.sfx.previewPlay')

                  return (
                    <div
                      key={asset.id}
                      className={`group relative flex items-center justify-between rounded-lg border px-3 py-2 transition-all cursor-pointer mb-1.5 ${
                        isPlaying
                          ? 'border-accent/80 bg-accent/10 shadow-sm'
                          : 'border-zinc-800/80 bg-zinc-900/50 hover:border-zinc-700 hover:bg-zinc-800/80'
                      }`}
                      onClick={() => handleTogglePlay(asset.id, audioSrc)}
                    >
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <button
                          type="button"
                          aria-label={playLabel}
                          title={playLabel}
                          onClick={(e) => {
                            e.stopPropagation()
                            handleTogglePlay(asset.id, audioSrc)
                          }}
                          className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full transition-all ${
                            isPlaying
                              ? 'bg-accent text-zinc-950 scale-105'
                              : 'bg-zinc-800 text-zinc-300 group-hover:bg-zinc-700 group-hover:text-white'
                          }`}
                        >
                          {isPlaying ? (
                            <Pause className="h-3.5 w-3.5 fill-current" />
                          ) : (
                            <Play className="h-3.5 w-3.5 fill-current ml-0.5" />
                          )}
                        </button>

                        <div className="flex flex-col min-w-0 flex-1">
                          <span className="truncate text-[12px] font-medium text-zinc-200 group-hover:text-white">
                            {name}
                          </span>
                          {asset.duration && (
                            <span className="text-[10px] text-zinc-500 font-mono">
                              {asset.duration.toFixed(1)}s
                            </span>
                          )}
                        </div>
                      </div>

                      <button
                        type="button"
                        title={t('library.sfx.addToTimeline')}
                        onClick={(e) => {
                          e.stopPropagation()
                          handleAddCustom(asset)
                        }}
                        className="flex h-6 w-6 items-center justify-center rounded-full bg-zinc-800 text-zinc-400 hover:bg-accent hover:text-zinc-950 opacity-80 group-hover:opacity-100 transition-all shadow-sm ml-2 flex-shrink-0"
                      >
                        <Plus className="h-3.5 w-3.5 stroke-[2.5]" />
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
