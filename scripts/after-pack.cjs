'use strict'

/**
 * electron-builder allows one `afterPack` hook, and there is more than one
 * thing worth checking before an installer is built. This runs them in order;
 * any of them may throw to stop the build.
 */

const ffmpegPerArch = require('./ffmpeg-per-arch.cjs')
const verifyPackedIcon = require('./verify-packed-icon.cjs')

module.exports = async function afterPack(context) {
  await ffmpegPerArch(context)
  verifyPackedIcon(context)
}
