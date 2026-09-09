import { app } from 'electron'
import path from 'path'
import { APP_FOLDER_NAME, resolveUserDataDir } from '../core/src/app-paths'

export { APP_FOLDER_NAME }

app.setPath('userData', resolveUserDataDir())

export function getAppDataDir(): string {
  return app.getPath('userData')
}

export function getLogDir(): string {
  return path.join(app.getPath('userData'), 'logs')
}
