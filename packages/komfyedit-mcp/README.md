# KomfyEdit MCP Server (`komfyedit-mcp`)

Model Context Protocol (MCP) server for KomfyEdit desktop video editor.
Allows external AI agents (Claude Code, OpenAI Codex CLI, Antigravity CLI) to inspect projects, timelines, media, and analyze audio/video offline via `stdio` transport **without needing the Electron app running**.

## Features

- **Headless**: Operates directly on disk-stored project files (`.json`) without GUI or Electron process.
- **Read-Only Profile**: Zero write tools in this profile. Guarantees non-destructive inspection.
- **Pure Stdio Transport**: Standard JSON-RPC protocol over stdin/stdout.

## Available Tools

| Tool | Purpose |
|---|---|
| `project_list` | List all saved KomfyEdit projects on disk with metadata |
| `project_open` | Load a project into memory by ID or file path |
| `timeline_describe` | Detailed breakdown of tracks, clips, durations, and transitions |
| `timeline_summary` | Compact token-efficient summary (<= 16KB) for LLM context |
| `media_list` | List all media assets referenced in the project with disk verification |
| `media_probe` | Technical inspection of a media file (codecs, resolution, fps, channels) |
| `observe_silence` | Detect audio silence intervals with dB noise threshold |
| `observe_scenes` | Detect scene cut timestamps via visual change threshold |
| `observe_loudness` | EBU R128 loudness metrics (integrated LUFS, True Peak, LRA) |
| `observe_filmstrip` | Generate a composite PNG filmstrip (frames + waveform + time labels) |
| `transcribe` | Speech-to-text transcription with timestamps and word-level timestamps via Whisper |
| `filter_list` | List available built-in 3D LUT video filters with ID, name, category, and intensity |
| `qc_check` | Automated Quality Control check (orphans, missing files, short clips, gaps, invalid filters) |

---

## Host Configuration Guides

### 1. Claude Code (`claude.ai/code`)

Add to your project's `.mcp.json` or run via CLI:

```bash
claude mcp add komfyedit node /path/to/KomfyEdit/packages/komfyedit-mcp/bin/komfyedit-mcp.js
```

Or configure in `.mcp.json`:

```json
{
  "mcpServers": {
    "komfyedit": {
      "command": "node",
      "args": ["H:/WorkSpace/vibe-project/KomfyEdit/packages/komfyedit-mcp/bin/komfyedit-mcp.js"],
      "env": {
        "KOMFYEDIT_PROJECTS_DIR": "H:/WorkSpace/vibe-project/KomfyEdit/.komfyedit-data/projects"
      }
    }
  }
}
```

### 2. OpenAI Codex CLI

Add to your Codex CLI configuration (`~/.codex/config.json` or project-local config):

```json
{
  "mcpServers": {
    "komfyedit": {
      "command": "node",
      "args": ["H:/WorkSpace/vibe-project/KomfyEdit/packages/komfyedit-mcp/bin/komfyedit-mcp.js"]
    }
  }
}
```

Or launch directly:
```bash
codex --mcp-server "node H:/WorkSpace/vibe-project/KomfyEdit/packages/komfyedit-mcp/bin/komfyedit-mcp.js"
```

### 3. Google Antigravity CLI (`agy`)

Add to `mcp_config.json` in your Antigravity workspace root or configuration root:

```json
{
  "mcpServers": {
    "komfyedit": {
      "command": "node",
      "args": ["H:/WorkSpace/vibe-project/KomfyEdit/packages/komfyedit-mcp/bin/komfyedit-mcp.js"]
    }
  }
}
```

Or connect via AGY CLI:
```bash
agy mcp add komfyedit -- node H:/WorkSpace/vibe-project/KomfyEdit/packages/komfyedit-mcp/bin/komfyedit-mcp.js
```

---

## Profiles & Safety Invariants

KomfyEdit MCP supports two operational profiles:

1. **`read` (Default)**:
   - Exposes only read and observation tools (`project.*`, `timeline.*`, `media.*`, `observe.*`, `qc_check`).
   - Zero project files, clip properties, or timeline tracks can be mutated.
   - Cache isolation: no persistent files written outside the OS temp directory (`os.tmpdir()`).

2. **`edit` (`--profile edit` or `KOMFYEDIT_MCP_PROFILE=edit`)**:
   - Exposes transactional editing tools (`edit_propose`, `edit_apply`, `edit_undo`, `render_preview`, `render_cancel`).
   - All mutations pass through the atomic Edit Patch transaction gate (`validateEditPatch`).
   - Invariant enforcement: magnetic V1 contiguity, locked track protection, and fail-closed validation.

## Skill Evaluation

To verify skill execution against automated test fixtures:
```bash
pnpm eval:skills
```
See root `README.md` for adding new scenarios.

