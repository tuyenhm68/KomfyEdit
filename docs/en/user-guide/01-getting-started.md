# Getting Started with KomfyEdit

<p align="center">
  <img src="../../images/overview-ui.png" alt="KomfyEdit Overview" width="85%">
</p>

**KomfyEdit** is an open-source, non-linear video editing desktop application designed for privacy, speed, and local automation. It runs 100% offline on your machine without mandatory cloud accounts, subscriptions, or remote servers.

---

## 💻 System Requirements

| Component | Minimum | Recommended |
|---|---|---|
| **OS** | Windows 10/11 (64-bit), macOS 12+ (Intel / Apple Silicon), Ubuntu 20.04+ | Windows 11, macOS 14+ (M1/M2/M3), Ubuntu 22.04+ |
| **CPU** | 4-core 64-bit x86 or ARM64 processor | 8-core modern processor |
| **RAM** | 8 GB | 16 GB or more |
| **Storage** | 2 GB free disk space (excluding video media) | Fast NVMe SSD |
| **Display** | 1280 × 720 minimum | 1920 × 1080 or higher |

---

## 📥 Installation

### Option 1: Prebuilt Packages (Recommended)
Download the latest prebuilt release for your platform from the [GitHub Releases](https://github.com/Lightricks/LTX-Desktop/releases) tab:
- **Windows**: `KomfyEdit-Setup-x.x.x.exe`
- **macOS**: `KomfyEdit-x.x.x.dmg` or `KomfyEdit-x.x.x-mac.zip`
- **Linux**: `KomfyEdit-x.x.x.AppImage` or `.deb`

### Option 2: Running from Source
If you are a developer or prefer running the latest edge build:

1. **Install Prerequisites**:
   - [Node.js](https://nodejs.org/) (version 20 LTS or higher recommended)
   - [pnpm](https://pnpm.io/) package manager (`npm install -g pnpm`)
   - [Git](https://git-scm.com/)

2. **Clone the Repository**:
   ```bash
   git clone https://github.com/Lightricks/LTX-Desktop.git komfyedit
   cd komfyedit
   ```

3. **Install Dependencies**:
   ```bash
   pnpm install
   ```

4. **Launch Development Mode**:
   ```bash
   pnpm dev
   ```

---

## 🚀 Creating Your First Project

Follow these simple steps to start editing:

```mermaid
flowchart LR
    A[Launch App] --> B[New Project]
    B --> C[Configure Settings<br>Resolution / FPS]
    C --> D[Import Media Files]
    D --> E[Drag to Timeline]
    E --> F[Cut, Grade & Export]
```

1. **Launch KomfyEdit**: The application opens directly to the Home / Project Selection dashboard.
2. **Click "New Project"**:
   - Give your project a clear name (e.g. `My First Vlog`).
   - Select your target aspect ratio:
     - `16:9` (1920×1080 or 3840×2160) for YouTube / TV
     - `9:16` (1080×1920) for TikTok / Reels / Shorts
     - `1:1` (1080×1080) for Instagram feed
   - Choose your timeline framerate (e.g., `24 fps`, `30 fps`, or `60 fps`).
3. **Import Media**:
   - Click the **`+ Import`** button on the top-left Asset Panel or drag-and-drop video, audio, or image files directly from your file manager into the app.
   - Files are indexed with fast waveform and thumbnail generation.
4. **Assemble on the Timeline**:
   - Drag a clip from the Asset Panel down onto the timeline track (`V1` or `A1`).
   - Press `Space` to start and pause playback.

---

[Next: 02. Interface & Workspace →](02-interface-and-workspace.md)
