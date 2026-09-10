'use strict'

/**
 * electron-builder afterPack check: the packed app really carries its icon.
 *
 * Windows draws a taskbar button from the window's own icon. A window with
 * none falls back to the class icon Chromium registers from its own embedded
 * resource — the Electron logo — no matter what icon the exe carries. So a
 * packaged KomfyEdit whose `resources/icon.ico` went missing does not look
 * broken to anyone building it: it builds, installs, runs, and shows Electron's
 * icon on the taskbar. That is exactly what shipped, and the only sign was one
 * `[icon] No app icon found` line in a log nobody reads.
 *
 * Configuration alone is not enough to check — `extraResources` can be right
 * while the copy silently lands somewhere else — so this reads the packed
 * output. It runs on every platform because every platform's window takes the
 * icon from the same place; only the file name differs.
 */

const fs = require('fs')
const path = require('path')

/** The file names electron/window.ts looks for, in the order it tries them. */
const ICON_NAMES = { win32: ['icon.ico', 'icon.png'], darwin: ['icon.png'], linux: ['icon.png'] }

/**
 * Where `process.resourcesPath` points inside a packed app — the directory
 * `extraResources` copies into, and the one createWindow() reads at runtime.
 */
function packedResourcesDir(context) {
  const { appOutDir, packager } = context
  if (packager.platform.nodeName === 'darwin') {
    return path.join(appOutDir, `${packager.appInfo.productFilename}.app`, 'Contents', 'Resources')
  }
  return path.join(appOutDir, 'resources')
}

/**
 * Whether the file is an ICO Windows can actually decode into an icon.
 *
 * A PNG renamed to .ico passes every existence check and then loads as an
 * empty nativeImage at runtime — silent in exactly the same way as a missing
 * file. The header is six bytes: reserved 0, type 1, then the image count.
 */
function isUsableIco(filePath) {
  const header = Buffer.alloc(6)
  const handle = fs.openSync(filePath, 'r')
  try {
    if (fs.readSync(handle, header, 0, 6, 0) < 6) return false
  } finally {
    fs.closeSync(handle)
  }
  return header.readUInt16LE(0) === 0 && header.readUInt16LE(2) === 1 && header.readUInt16LE(4) > 0
}

module.exports = function verifyPackedIcon(context) {
  const platform = context.packager.platform.nodeName
  const names = ICON_NAMES[platform] ?? ICON_NAMES.linux
  const resourcesDir = packedResourcesDir(context)

  const found = names.find(name => fs.existsSync(path.join(resourcesDir, name)))
  if (!found) {
    throw new Error(
      `[verify-packed-icon] No app icon in the packed app: expected one of ${names.join(', ')} in ${resourcesDir}. `
      + 'Add it to `extraResources` in electron-builder.yml — without it every window opens with the Electron icon.',
    )
  }

  const iconPath = path.join(resourcesDir, found)
  if (found.endsWith('.ico') && !isUsableIco(iconPath)) {
    throw new Error(
      `[verify-packed-icon] ${iconPath} is not a decodable ICO (wrong header). `
      + 'Windows would open every window with the Electron icon.',
    )
  }

  console.log(`[verify-packed-icon] ${platform}: window icon present at ${iconPath}`)
}
