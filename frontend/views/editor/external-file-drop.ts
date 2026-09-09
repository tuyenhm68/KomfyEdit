/** Media-file classification shared by the file picker and OS drag-and-drop. */

export type MediaKind = 'video' | 'audio' | 'image'

const EXTENSION_KIND: Record<string, MediaKind> = {
  mp4: 'video', mov: 'video', mkv: 'video', webm: 'video', avi: 'video',
  m4v: 'video', mpg: 'video', mpeg: 'video', wmv: 'video',
  mp3: 'audio', wav: 'audio', m4a: 'audio', aac: 'audio',
  flac: 'audio', ogg: 'audio', opus: 'audio',
  png: 'image', jpg: 'image', jpeg: 'image', webp: 'image',
  gif: 'image', bmp: 'image', tif: 'image', tiff: 'image',
}

/**
 * Classify a file as media, or null if it isn't. Prefers the MIME type, but
 * Chromium reports an empty type for some containers (notably .mkv), so it
 * falls back to the file extension.
 */
export function classifyMediaFile(file: File): MediaKind | null {
  if (file.type.startsWith('video/')) return 'video'
  if (file.type.startsWith('audio/')) return 'audio'
  if (file.type.startsWith('image/')) return 'image'
  const ext = file.name.split('.').pop()?.toLowerCase()
  return ext ? EXTENSION_KIND[ext] ?? null : null
}

/** True when the drag originates from outside the app and carries files. */
export function isExternalFileDrag(e: React.DragEvent): boolean {
  return Array.from(e.dataTransfer.types).includes('Files')
}

export function hasMediaFiles(fileList: FileList | File[]): boolean {
  return Array.from(fileList).some(file => classifyMediaFile(file) !== null)
}
