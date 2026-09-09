import fs from 'fs'
import path from 'path'
import type { Project } from './project-model'

/**
 * Atomically writes a project model to a JSON file using a temp file and renameSync.
 */
export function saveProjectAtomic(filePath: string, project: Project): void {
  const dir = path.dirname(filePath)
  fs.mkdirSync(dir, { recursive: true })

  const tempPath = path.join(
    dir,
    `.${path.basename(filePath)}.tmp.${Date.now()}.${Math.random().toString(36).slice(2, 8)}`,
  )

  const content = JSON.stringify(project, null, 2)
  fs.writeFileSync(tempPath, content, 'utf8')
  fs.renameSync(tempPath, filePath)
}

/**
 * Atomically writes raw JSON string to file for byte-for-byte undo restoration.
 */
export function restoreProjectRawAtomic(filePath: string, rawContent: string): void {
  const dir = path.dirname(filePath)
  fs.mkdirSync(dir, { recursive: true })

  const tempPath = path.join(
    dir,
    `.${path.basename(filePath)}.tmp.${Date.now()}.${Math.random().toString(36).slice(2, 8)}`,
  )

  fs.writeFileSync(tempPath, rawContent, 'utf8')
  fs.renameSync(tempPath, filePath)
}
