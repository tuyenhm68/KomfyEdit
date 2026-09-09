import { useCallback, useRef } from 'react'
import type { Asset } from '../../types/project-model'
import { addGenericAssetToProject, addVisualAssetToProject } from '../../lib/asset-copy'
import { classifyMediaFile } from './external-file-drop'
import { pathToFileUrl } from '../../lib/file-url'
import { useEditorActions } from './editor-store'
import { useSettings } from '../../contexts/SettingsContext'

interface UseEditorMediaImportParams {
  currentProjectId: string | null
}

export function useEditorMediaImport(params: UseEditorMediaImportParams) {
  const { currentProjectId } = params
  const { addAssetToEditor, adoptTimelineSizeFromAsset } = useEditorActions()
  const { settings } = useSettings()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const getMediaDuration = useCallback((url: string, isAudio = false): Promise<number> => {
    return new Promise((resolve) => {
      const media = document.createElement(isAudio ? 'audio' : 'video')
      media.src = url
      media.onloadedmetadata = () => resolve(media.duration)
      media.onerror = () => resolve(5)
    })
  }, [])

  /**
   * Copy media files into the project and register them as assets.
   * Shared by the file picker and by files dropped from the OS file manager.
   * Returns the assets that were created, in the order they were accepted.
   */
  const importFiles = useCallback(async (fileList: FileList | File[]): Promise<Asset[]> => {
    if (!currentProjectId) return []
    const imported: Asset[] = []

    for (const file of Array.from(fileList)) {
      const kind = classifyMediaFile(file)
      if (!kind) continue
      const isVideo = kind === 'video'
      const isAudio = kind === 'audio'
      const isImage = kind === 'image'

      const electronFilePath = window.electronAPI?.getPathForFile(file)
      // Inside the desktop app every real file dropped from the OS resolves to a
      // path. One that does not is a drag that originated inside the app itself
      // — dragging a thumbnail hands Chromium's synthesised image over as a
      // "file" — and importing it would add a nameless, thumbnail-less asset.
      if (window.electronAPI && !electronFilePath) continue
      let persistentPath = electronFilePath || file.name
      let bigThumbnailPath: string | undefined
      let smallThumbnailPath: string | undefined
      let width: number | undefined
      let height: number | undefined

      let duration = isImage ? (settings.defaultImageDuration ?? 3.0) : 5
      if (isVideo || isAudio) {
        const mediaUrl = electronFilePath ? pathToFileUrl(electronFilePath) : URL.createObjectURL(file)
        duration = await getMediaDuration(mediaUrl, isAudio)
      }

      if (electronFilePath) {
        if (isVideo || isImage) {
          const copied = await addVisualAssetToProject(electronFilePath, currentProjectId, isVideo ? 'video' : 'image')
          if (!copied) continue
          persistentPath = copied.path
          bigThumbnailPath = copied.bigThumbnailPath
          smallThumbnailPath = copied.smallThumbnailPath
          width = copied.width
          height = copied.height
        } else if (isAudio) {
          const copied = await addGenericAssetToProject(electronFilePath, currentProjectId)
          if (copied?.path) persistentPath = copied.path
        }
      }

      const asset: Asset = {
        id: `asset-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
        type: kind,
        path: persistentPath,
        bigThumbnailPath,
        smallThumbnailPath,
        width,
        height,
        // The main process measures a video the way a player shows it, display
        // matrix included, so this asset never needs the one-time re-measure.
        ...(isVideo ? { rotationChecked: true } : {}),
        prompt: `Imported: ${file.name}`,
        resolution: 'imported',
        duration,
        createdAt: Date.now(),
      }
      addAssetToEditor(asset)
      // Runs after the asset is in the model, so "is this the first video?"
      // sees the project as it now stands.
      adoptTimelineSizeFromAsset(asset)
      imported.push(asset)
    }

    return imported
  }, [addAssetToEditor, adoptTimelineSizeFromAsset, currentProjectId, getMediaDuration, settings.defaultImageDuration])

  const handleImportFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return
    const target = e.target
    await importFiles(files)

    target.value = ''
    if (fileInputRef.current && fileInputRef.current !== target) {
      fileInputRef.current.value = ''
    }
  }, [importFiles])

  return {
    fileInputRef,
    handleImportFile,
    importFiles,
  }
}
