import fs from 'fs'
import path from 'path'

/* ────────────────────────────────────────────────────────────────
   Deleting a file or folder so that it is actually deleted.

   `fs.rmSync(target, { recursive: true, force: true })` is the obvious call and
   it is the wrong one on Windows: it silently no-ops — no throw, nothing
   removed — whenever the path holds a character outside ASCII. Measured on
   Node v24.10.0:

       "plain.komfytemplate"           → deleted
       "Xoá.komfytemplate"             → STILL THERE
       "a (b).komfytemplate"           → deleted

   It is not Unicode normalisation: the name on disk and the name passed in are
   byte-identical (`58 6f e1 …`, both NFC), and `fs.unlinkSync` on that same
   path removes it without complaint.

   Worse, it depends on the WHOLE path rather than the leaf. An ASCII cache
   file under `C:\\Users\\Nguyễn\\…` survives too, so every cache the app offers
   to clear quietly stayed on disk for a large share of its users while the UI
   reported success.

   Walking the tree by hand costs nothing at these sizes and works on any name.
   ──────────────────────────────────────────────────────────────── */

/**
 * Removes a file or a whole directory tree.
 *
 * A path that is already gone is not an error — that is the outcome the caller
 * asked for. Anything else throws, so a caller that cares can report it.
 */
export function removeEntry(target: string): void {
  let stat: fs.Stats
  try {
    stat = fs.lstatSync(target)
  } catch {
    return
  }

  // lstat, not stat: a symlink is removed itself rather than followed into
  // whatever it points at.
  if (!stat.isDirectory()) {
    fs.unlinkSync(target)
    return
  }

  for (const entry of fs.readdirSync(target)) {
    removeEntry(path.join(target, entry))
  }
  fs.rmdirSync(target)
}

/** Removes an entry, swallowing failure. For best-effort cleanup paths. */
export function removeEntryQuietly(target: string): void {
  try {
    removeEntry(target)
  } catch {
    // Best effort: a temp directory left behind is untidy, not broken.
  }
}
