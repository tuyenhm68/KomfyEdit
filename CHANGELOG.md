# Changelog

What changed, release by release, as a user would see it.

The section for the version being released is cut out by
`scripts/release-notes.cjs` and becomes the body of the GitHub Release — which
is also the text the in-app updater shows when it offers a new version. So write
it for someone editing video, not for a developer: say what changed and what it
means for them, not which function moved.

A release with no section here is refused by CI before anything is built.

## [Unreleased]

## [1.0.3] - 2026-09-11

### Added
- Speech is transcribed once and shared. Auto captions, Auto Highlights and
  B-roll Copilot all read the same transcript, which is saved with the project,
  so the second and third of them cost nothing and work offline. Re-trimming a
  clip reads the words it still covers instead of transcribing again.
- Auto Highlights has its own **Create transcript** button, with a choice of
  whether the words should also appear as captions on the timeline. Analysing no
  longer starts a transcription behind your back.
- Highlights and hooks are written by the CLI you configured in EditPilot
  (Claude Code, Codex or Antigravity), so the feature no longer needs a separate
  OpenAI key. It falls back to OpenAI when no CLI is installed.
- B-roll Copilot lets you choose which footage to insert, and offers to import
  media when the project has none to spare.
- B-roll is inserted on its own **B-roll** track, created once and reused, so it
  can never land among the captions or on the footage it is covering.

### Fixed
- Caption progress read in Vietnamese while the app was set to English.
- EditPilot would not start with Codex CLI, failing with
  `unknown option '--skip-git-repo-check'`. On a machine with Claude Code also
  installed, it was launching Claude Code's program and handing it Codex's
  instructions.
- EditPilot with Codex could see KomfyEdit's tools but not use any of them, and
  reported that its permissions blocked access to the video.
- Clicking a timecode on EditPilot's confirmation card left the playhead where it
  was when the video was playing.
- Auto Highlights suggested segments that had nothing to do with the video: it
  was asking for highlights without sending any transcript, and the suggestions
  were invented. It now refuses rather than guessing.
- B-roll Copilot reported nothing to do on videos that are solid speech. It was
  counting the audio track — and, in a captioned project, the video itself — as
  footage already covering the picture, and it broke a stretch of talking apart
  at every breath between sentences.
- Inserting B-roll appeared to succeed but changed nothing on screen: the clip
  was placed among the captions, where nothing draws it, and it reused the video
  being edited, so it was the same picture either way.

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
