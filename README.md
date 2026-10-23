# 🏝️ Island — Dynamic Island for Windows

A modern, fluid **Dynamic Island** desktop experience for Windows, built with **Electron + React + Vite + Three.js**.

Island floats unobtrusively at the top of your screen, morphing organically to show active media playback, synchronized karaoke lyrics, an intelligent real-time conversational voice assistant, unified cross-provider music favorites, alarms, timers, system notifications, and an interactive 3D desktop companion.

---

## ✨ Features

### 🎵 1. Music & Full Synchronous Lyrics Engine
- **Universal Media Controls**: Reads and controls active Windows media sessions (Spotify, YouTube Music, Apple Music, Media Player, VLC) via native SMTC integration.
- **Synchronized & Syllable-Level Karaoke Lyrics**:
  - Live synced lyrics integration powered by LRCLIB with ELRC karaoke timestamp support.
  - Interactive click-to-seek: Jump instantly to any part of the track by clicking a lyric line.
  - Smooth inertia auto-scroll with user-scroll pause detection and gentle resumption.
  - Precision 5-second forward and backward skip controls.
  - High-res artwork upgrade pipeline (auto-upgrades Spotify, Apple Music, YouTube thumbnails to 640×640 / 1200×1200 HD master art).
  - Elegant ambient dynamic gradient backdrop derived from artwork color palette.
  - Plain lyrics fallback badge when unsynchronized lyrics are delivered.

### ⭐ 2. Cross-Provider Music Foundation & Unified Favorites
- **Multi-Provider Identity & Isolation**:
  - Preserves exact source provider identity (`Spotify`, `YouTube Music`, `Apple Music`).
  - **Spotify Isolation Guarantee**: Verified Spotify tracks strictly maintain Spotify URIs (`spotify:search:...` or direct track URIs) without unwanted YouTube Music substitution.
  - **Identical Titles Coexist**: Songs with the same title across different providers coexist without collision.
  - Recognizable provider badges (`Spotify`, `YouTube Music`, `Apple Music`, `Unknown`) with tailored theme palettes.
  - Compact source filter pills (`All`, `Spotify`, `YouTube Music`, and dynamically rendered `Unknown` for legacy entries).
- **Interactive Inline Favorites in Agent Chat**:
  - Asking `"Show my favorite songs"`, `"Name all of them"`, or `"Show my Spotify favorites"` renders rich interactive song cards directly within the voice assistant transcript without navigating away.
  - Supports conversational ordinal follow-ups: `"Play the third one"` or `"Play number 2"`.

### 🎙️ 3. Conversational AI Voice Companion
- **Modular Multi-Provider AI Architecture**:
  - **Speech-to-Text (STT)**: High-precision Groq Whisper (`whisper-large-v3-turbo`) or Gemini multimodal STT.
  - **Conversational Intelligence**: Google Gemini or Groq Llama / Mixtral models.
  - **Speech Synthesis (TTS)**: Hardware-verified Native Windows SAPI speech engine, Kokoro offline neural TTS, or Gemini voice synthesis.
  - **Zero-Quota Local Deterministic Actions**: High-confidence music commands (pause, resume, skip, like, play favorites, volume control) execute deterministically with 0 LLM API quota spent.
- **Physical Music Audio Ducking**:
  - External YouTube Music tab volume automatically ducks down smoothly (~10% level) via companion extension when the assistant begins listening or speaking.
  - Volume is restored smoothly via ease-in-out curve upon turn completion.
- **Natural Voice Lifecycle**:
  - Completed playback handoff confirms the song, restores music volume, and dismisses the transient assistant panel cleanly without re-arming the microphone.
  - Polite closings (*"Thanks"*, *"No, that's all"*, *"Bye"*) acknowledge and dismiss.
  - Clarification loops stay active when candidate options need selection.

### 🐾 4. 3D Desktop Pet Companion & Pet Studio
- **Three.js WebGL Engine**: Transparent desktop overlay with stylized soft 3-point studio lighting.
- **Interactive Procedural Rigging**: Real-time 4-legged quadruped locomotion, 3D cursor head tracking, breathing cycles, and expressive animations.
- **Integrated Pet Studio & Settings**:
  - Configure companion name with dynamic wake phrase preview (*"Hey [Name]"*).
  - Select species (*Cat*, *Dog*, *Both*), adjust scale (50% – 150%), toggle roaming, and toggle cursor tracking.

### 🖥️ 5. Desktop Integration & Window Ergonomics
- **Horizontal Desktop Dragging**: Grab and reposition Island anywhere along your top display edge, with quick screen presets (**Left**, **Center**, **Right**) and persistent coordinates across restarts.
- **Click-Outside Dismissal**: Intuitive collapse on Windows OS blur, clicking external apps/taskbar, or pressing `Escape`. Manual panels stay open until deliberately dismissed.
- **Transparent Click-Through**: Outside the interactive pill and pet, the overlay window is fully click-through and never obstructs underlying applications.
- **Local Notification Server**: Built-in HTTP endpoint (`http://127.0.0.1:47823/notify`) for CLI tools, builds, or scripts to push toast notifications to the Island inbox.
- **Persistent Alarms & Quick Timers**: Set alarms with customizable repeat days, audio chimes, and snooze; quick 1/5/10/15/25/45 min timers.

---

## 🚀 Getting Started

### Prerequisites
- **Node.js**: `20.19+` or `22.12+` ([Download Node.js](https://nodejs.org))
- **OS**: Windows 10 / 11

### Installation

```bash
# Clone the repository
git clone https://github.com/kush-16-web/island.git
cd island

# Install dependencies
npm install
```

### Configuration

Copy `.env.example` to `.env` and insert your API keys:

```bash
cp .env.example .env
```

Edit `.env`:
```env
# Google Gemini API Key (Multimodal Intelligence & Speech)
GEMINI_API_KEY=your_gemini_api_key_here

# Groq API Key (Ultra-fast Whisper STT & Llama / Mixtral Models)
GROQ_API_KEY=your_groq_api_key_here
```

> **Note**: Real API keys should never be committed to git. `.env` and credentials are excluded by `.gitignore`.

### Running in Development

```bash
# Launch the full Electron desktop app
npm run dev
```

Alternatively, to iterate on UI components in your browser without Electron:
```bash
npm run dev:web
# Open http://127.0.0.1:5173
```

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
| --- | --- |
| `Ctrl + Alt + Space` | Toggle Dynamic Island Hub (Now Playing, Clock, Inbox, Pet Studio, Settings) |
| `Ctrl + Shift + Space` | Toggle Real-Time AI Voice Assistant |
| `Escape` | Collapse Island Hub or return from Full Lyrics to Player |

---

## 🧪 Testing & Verification

Island includes an automated test suite verifying music controls, scheduler, turn controllers, favorites integrity, provider isolation, and window lifecycle.

```bash
# Run the complete test suite (295+ tests across 77 suites)
npm test

# Build production bundle
npm run build

# Package desktop installer
npm run dist
```

---

## 📁 Project Architecture

```
island/
├── electron/                   # Main Process (Node.js & Native OS Bridges)
│   ├── main.js                 # Window management, tray, global shortcuts, IPC
│   ├── preload.js              # Context-isolated secure bridge
│   ├── gemini.js               # Google Gemini voice & vision service
│   ├── groq.js                 # Groq Whisper STT & conversational engine
│   ├── windows-tts.js          # Native Windows SAPI speech synthesis service
│   ├── media.js                # SMTC media session listener (PowerShell)
│   ├── scheduler.js            # Alarms & timers scheduler
│   └── notify-server.js        # Local HTTP notification webhook
│
├── src/                        # Renderer Process (React & Three.js UI)
│   ├── components/
│   │   ├── Island.jsx          # Dynamic morphing pill container
│   │   ├── NowPlaying.jsx      # Compact & expanded music player
│   │   ├── FullLyrics.jsx      # Full-screen synchronized lyrics & karaoke
│   │   ├── VoicePanel.jsx      # Living audio visualizer & voice conversation
│   │   ├── InlineFavorites.jsx # Interactive inline favorites in chat
│   │   ├── FavoritesMenu.jsx   # Standalone unified favorites library
│   │   ├── Pet.jsx / Pet3D.jsx # Procedural Three.js 3D desktop companion
│   │   └── PetStudioPanel.jsx  # Companion customizer & settings
│   ├── hooks/                  # Custom React hooks (voice, media, high-res art)
│   ├── lib/                    # Core engines (music-actions, favorites, ducking)
│   └── styles.css              # Custom styling, glassmorphism, animations
│
├── scripts/                    # Helper scripts (notify CLI, icon generator)
└── test/                       # Node.js automated test suites
```

---

## 📄 License

MIT License. Designed and engineered for Windows.
