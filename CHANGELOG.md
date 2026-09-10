# Changelog

What changed, release by release, as a user would see it.

The section for the version being released is cut out by
`scripts/release-notes.cjs` and becomes the body of the GitHub Release — which
is also the text the in-app updater shows when it offers a new version. So write
it for someone editing video, not for a developer: say what changed and what it
means for them, not which function moved.

A release with no section here is refused by CI before anything is built.

## [Unreleased]

## [1.0.2] - 2026-09-10

### Added
- EditPilot's confirmation card lists each cut it is about to make: click a row
  to jump the playhead there, and untick anything you would rather keep.
- The first video added to a new project now sets the project's frame size.

### Fixed
- Ctrl+B cuts at the playhead instead of at the mouse pointer.
- The preview no longer flickers when playback passes a sticker.
- Video filmed upright on a phone is no longer treated as landscape, so the crop
  frame and transform handles sit on the picture.
- Clip volume can be raised above 100% from the properties panel.
- Auto captions cover the whole timeline after a video has been cut, instead of
  stopping at the first cut.
- The app icon shows correctly on the Windows taskbar, in both the installed and
  the development build.
- Adding a sticker no longer leaves a blank image tile in the Import panel.
## [1.0.1] - 2026-09-10

### Fixed
- Small fixes found after packaging the first release.

## [1.0.0] - 2026-09-09

First release of KomfyEdit.
