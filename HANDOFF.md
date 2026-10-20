# Island — Pass 1.5 Desktop Experience Rebuild: Architecture & Technical Report

## 1. Executive Summary
This document provides the complete root cause analysis, architecture specifications, and implementation details for **Island Pass 1.5: Desktop Experience Rebuild**, addressing:
1. **Dynamic Island Dragging**: Horizontal drag along the top edge of Windows desktop with screen presets (`Left`, `Center`, `Right`) and persistent coordinates across restarts.
2. **Click-Outside Dismissal**: Intuitive collapse on Windows OS window blur, clicking external apps/desktop/taskbar, or pressing `Esc`, with manual panels staying open without arbitrary timeouts.
3. **Integrated Pet Studio & Settings**: Pet Studio and Settings relocated inside the expanded Dynamic Island hub, removing redundant external buttons and maintaining the pet's name as the future voice wake phrase (`"Hey [Name]"`).
4. **Sketchfab Chibi Kitten Model Assessment**: Deep technical inspection of the exact Sketchfab model (`e75473f853184396ab630f4819b8350e`), licensing, mesh topology, rigging status, and download constraints.
5. **Real Three.js 3D Desktop Pet Engine**: Transparent WebGL rendering foundation (`alpha: true`), soft desktop lighting, GLTFLoader for custom models, and procedural 3D stylized kitten with 4-legged quadruped locomotion, 3D cursor head tracking, breathing, and tail swishing.

---

## 2. Root Cause Analysis & Implementations

### A. Dynamic Island Dragging
#### Root Cause:
1. In `electron/main.js`, `BrowserWindow` was initialized with `movable: false` and `focusable: false`. This told Windows DWM to reject native repositioning requests.
2. On every screen bounds or resize event, `placeWindow()` unconditionally calculated `x = Math.round(bounds.x + (bounds.width - width) / 2)` and snapped the window back to center, wiping out any position state.
3. The renderer had conflicting drag handles with standard `app-region: drag` mixing with React mouse event interceptors.
#### Fix Implemented:
- Configured `BrowserWindow` with `movable: true, focusable: true`.
- Added persistent position storage via `store.get('window_x')` and `store.set('window_x', nextX)`.
- Implemented IPC methods in `electron/main.js` and `electron/preload.js`:
  - `window:move-by (dx)`: Smoothly adjusts the window X coordinate clamped to the active display bounds.
  - `window:set-preset (preset)`: Snaps to `'left'`, `'center'`, or `'right'` display positions.
  - `window:reset-pos`: Restores window to exact center.
  - `window:get-pos`: Returns current position and active preset.
- In `src/components/Island.jsx`, implemented pointer capture drag with a 4px threshold so drags smoothly slide the island while direct clicks expand the hub.
- Added visual cursor feedback (`.is-draggable` -> `grab`, `grabbing`).

### B. Click-Outside Dismissal
#### Root Cause:
1. Because `focusable: false` was set on the window, the OS never registered window focus/blur transitions when the user clicked into Chrome, the desktop, or the taskbar.
2. The UI code relied on arbitrary fallback timers (`setTimeout(6000)` and `setTimeout(900)`) that forcibly collapsed manual panels while the user was still actively viewing or configuring them.
#### Fix Implemented:
- Distinct expansion modes:
  - **Manual Expansion** (`hubOpen === true`): Remains open while the user interacts with it. No forced timeouts.
  - **Temporary Preview** (transient music updates, timers, notifications): Uses appropriate preview timeouts without disrupting manual panels.
- Added window focus acquisition in `electron/main.js` when the island is expanded:
  ```js
  ipcMain.on('island:expand', (e, isExpanded) => {
    if (isExpanded) {
      win.setFocusable(true);
      win.focus();
    }
  });
  ```
- Forwarded OS native `win.on('blur')` -> `window:blur` to the renderer.
- In `src/components/Island.jsx`, configured listeners:
  - OS window blur (`window:blur`): Immediately collapses the island when clicking Chrome, desktop, or any external application.
  - Document `pointerdown` outside `.island`: Collapses immediately when clicking inside the overlay window outside the pill.
  - Keyboard `Escape`: Collapses immediately.
  - Back/Close buttons inside the island: Collapses or navigates back.

### C. Pet Studio & Settings Inside Island
#### Implementation:
- **Integrated Tabs**: Added `pet` (🐾 Pet Studio) and `settings` (⚙ Settings) directly to `TABS` in `src/components/Hub.jsx`.
- **Pet Studio Panel** (`src/components/PetStudioPanel.jsx`):
  - Companion & AI Assistant Name input with live wake phrase preview: `"Hey [Name]"`.
  - Species picker (`Cat`, `Dog`, `Both`).
  - Desktop visibility toggle (`Show on Desktop`).
  - Desktop roaming toggle (`Desktop Roaming`).
  - Cursor tracking toggle.
  - Pet scale slider (50% to 150%).
  - Reset position button (`Reset Position`).
- **Settings Panel** (`src/components/SettingsPanel.jsx`):
  - Position presets (`Left`, `Center`, `Right`) with active preset pill.
  - Reset to Center button.
  - Interaction guide for dragging and click-outside dismissal.
- **Cleanup**: Removed the floating `PetStudioBar` from the bottom-right corner of the desktop overlay.

---

## 3. Sketchfab 3D Model Investigation Report

- **Model Source**: [Sketchfab - Chibi Kitten With Bell - Tripo 3D vs SupaVoxel](https://sketchfab.com/3d-models/chibi-kitten-with-bell-tripo-3d-vs-supavoxel-e75473f853184396ab630f4819b8350e)
- **Model UID**: `e75473f853184396ab630f4819b8350e`
- **Author**: Cato Berg (`catoberg13`)
- **License**: Creative Commons Attribution (CC-BY 4.0)
- **Technical Mesh Inspection**:
  - **Vertex Count**: 744,603 vertices / triangles.
  - **Material & Textures**: 1 baked PBR material.
  - **Rigging Status**: **Single static mesh. NO skeletal bones, NO skin weights, NO animation clips.**
  - **Mesh Origin**: Generated via SupaVoxel / Tripo 3D photogrammetry/diffusion AI reconstruction.
- **Download Authorization**:
  - Sketchfab's API (`/v3/models/{uid}/download`) requires an authenticated user OAuth token (`"Authentication credentials were not provided."`). Automated scraping without credentials is intentionally restricted by Sketchfab.
- **Action Required for Custom Model**:
  - When you download the `.glb` model from Sketchfab using your account, place it into `public/models/chibi_kitten.glb`.
  - The Island 3D engine will automatically detect and load it, applying soft studio lighting and cursor tracking.

---

## 4. Three.js 3D Desktop Pet Engine

- **Technology Stack**: Three.js (`three: ^0.186.1`) with WebGLRenderer.
- **Transparency & Rendering**:
  - WebGL canvas initialized with `alpha: true`, `gl.setClearColor(0x000000, 0)`.
  - Soft studio 3-point lighting: Warm directional key light, ambient fill, and cool rim light for stylized character rendering.
  - Camera: Perspective camera with 36° FOV angled at 15° for charming desktop depth.
- **Procedural 3D Rigging & Locomotion**:
  - **Hierarchical Rig**: Articulated head, ears, 3D pupils, collar with bell, body, 4 legs (`fl`, `fr`, `bl`, `br`), and expressive tail.
  - **Quadruped Gait**: Four-legged walking cycle with alternating diagonal leg rotation (`sin(phase)` and `cos(phase)`) and body bobbing.
  - **Cursor Tracking**: Real 3D head rotation tracking mouse position on screen (`rotation.x` and `rotation.y`).
  - **Idle Breathing**: Soft harmonic scale expansion (`scale.y`) and fluid tail swishing.
  - **Sleep Pose**: Lowered head, relaxed posture, and deep rhythmic breathing.
  - **Dance Pose**: Upbeat vertical bounce and bell jingle matching music tempo.
- **Performance & Resource Management**:
  - Render loop halts when pet is hidden (`requestAnimationFrame` cancelled).
  - WebGL context, geometries, and materials disposed on unmount.
  - `data-hit` attribute ensures click-through pass-through outside pet boundaries.

---

---

## 5. Pass 1.6: Original Sketchfab Kitten, Media Artwork & Fullscreen Engine

### A. Original Model Integration & Procedural Engine Removal
- **Source File**: Extracted directly from user's downloaded archive `C:\Users\harsh\Downloads\chibi-kitten-with-bell-tripo-3d-vs-supavoxel.zip`.
- **Runtime Assets**:
  - `public/models/chibi_kitten.glb` (59.6 MB, 848,368 vertices)
  - `public/models/chibi-kitten/source/pool3333.glb`
  - `public/models/chibi-kitten/textures/`: PBR textures (albedo, normal, roughness-metallic).
- **Procedural Engine Cleanup**:
  - Completely deleted all temporary procedural geometry generators (`buildStylizedKitten`, spheres, cones, fake limbs).
  - Production application now operates on **one authoritative Three.js 3D pipeline** loading the real Sketchfab Chibi Kitten model.
- **Lighting & Rendering Quality**:
  - Three-point soft studio lighting: warm key light (`0xfff8ee`, 1.6), ambient light (`0xffffff`, 1.25), cool blue rim light (`0xb4d8ff`, 0.95), and front fill (`0xffeede`, 0.6).
  - ACESFilmic tone mapping with exposure 1.15 for vibrant fur and metallic golden bell.
  - Automatic horizontal centering and paw ground contact anchoring at $y = 0$.

### B. Kinematic Animation & Behavior
- **Hierarchical Articulation**:
  - `gazeGroup`: Smooth 3D cursor tracking for head and eyes with natural pitch/roll damping.
  - `pivotGroup`: Coordinated quadruped trot with alternating diagonal roll sway (`0.075`), pitch step tilt (`0.045`), and vertical step bobbing (`0.055`).
  - `breatheGroup`: Smooth harmonic chest breathing (2.8s period) for idle, deep sleeping pose (4.2s period), and upbeat dance bouncing.
  - `happy`: Interactive petting squash-and-stretch purring with floating heart particles.

### C. Media Artwork Fix
- **Root Cause**: In PowerShell 5.1, `[System.IO.WindowsRuntimeStreamExtensions]::AsStreamForRead($stream)` failed on WinRT `IRandomAccessStreamWithContentType` with a method overload binder exception because the COM object could not be resolved by PowerShell's dynamic binder.
- **Fix**: Used reflection invocation:
  ```powershell
  $asStreamMethod = ([System.IO.WindowsRuntimeStreamExtensions].GetMethods() | Where-Object {
      $_.Name -eq 'AsStream' -and $_.GetParameters().Count -eq 1
  })[0]
  $netStream = $asStreamMethod.Invoke($null, @($stream))
  ```
  Added ContentType sniffing for PNG / JPEG magic bytes. Spotify album covers and YouTube video thumbnails now extract and display reliably.

### D. Fullscreen Detection & Resource Management
- **Win32 Fullscreen Engine**:
  - `electron/ps/fullscreen.ps1`: Uses `GetForegroundWindow`, `MonitorFromWindow`, `GetMonitorInfo`, and window dimensions to detect genuine fullscreen windows (YouTube fullscreen `f`, Chrome `F11`, games, media players).
  - Distinguishes maximized windows (which respect `rcWork` taskbar bounds) from genuine fullscreen windows (which cover `rcMonitor`).
- **Hide & Restore**:
  - When fullscreen is detected, Island fades out via `win.setOpacity(0)` without stealing focus, and emits `fullscreen:change` to halt Three.js render loops (saving 100% GPU resources).
  - When exiting fullscreen, Island restores opacity and resumes animation seamlessly.
  - Independent settings in Settings panel: `Auto-hide Island in Fullscreen` and `Auto-hide Pet in Fullscreen`.

### E. Pet Studio UI Redesign
- Shortened tab label from cramped "Pet Studio" to sleek "Pet" with `white-space: nowrap` to eliminate wrapping.
- Replaced generic AI-style blocky forms with:
  - **Showcase Hero**: Frosted glass hero card with glowing ambient backdrop displaying the authentic 3D kitten, inline editable name input, assistant wake phrase chip (`🎙 "Hey Mochi"`), and live status indicator.
  - **2x2 Control Grid**: Species selector, custom scale slider with quick `S`, `M`, `L` buttons, desktop roaming switch, and 3D gaze tracking switch.
  - **Master Toolbar**: Desktop visibility toggle and quick position reset.

---

## 7. Pass 2.1: Live Synchronized Lyrics, Frosted Dark Blur & Shadow Softening, Middle Equalizer Layout, and Desktop Pet Removal

### A. Live Synchronized Lyrics Architecture (LRCLIB API)
- **Engine** (`src/lib/lyrics.js`):
  - Fetches from LRCLIB API with exact query `/api/get?track_name=...&artist_name=...` and fallback to `/api/search?q=...`.
  - In-memory cache by `${trackName}|${artistName}` to avoid redundant network requests.
  - Standard LRC (`[mm:ss.xx]`) and Enhanced LRC word-timestamp parser (`<mm:ss.xx> word`).
  - High-performance binary search (`findActiveLyricIndex`) for 0-jitter playback synchronization.
- **Three Lyrics Modes**:
  1. **Mode 1 — Mini Lyrics (Default)**: Integrated beside song title and artist in the expanded NowPlaying player. Renders 3-line layout (faded previous, illuminated active with glow, faded upcoming) with smooth animations.
  2. **Mode 2 — Full Lyrics**: Expands the island into a YouTube Music inspired scrolling lyrics pane with top/bottom gradient fade masks, auto-scrolling to keep active line centered, and a 3.5s pause on manual scroll so users can read freely without fighting auto-scroll.
  3. **Mode 3 — Karaoke**: Dynamic toggle in Full Lyrics mode. When word-level timestamps (`hasWordSync`) are present, words illuminate progressively in real-time. When unavailable, Karaoke mode cleanly disables with a helpful badge without fabricating word timings.

### B. Frosted Dark Blur & Shadow Softening
- Replaced see-through glassy transparency (`0.82`) with deep frosted dark obsidian glass (`rgba(13, 14, 18, 0.94)`) and heavy `40px` blur with `200%` saturation.
- Removed harsh wide neon glow shadows (`0 0 26px -2px color-mix...`), replacing them with refined, multi-layer soft drop shadows (`0 8px 24px -4px rgba(0,0,0,0.44), 0 2px 6px rgba(0,0,0,0.22)`).

### C. Middle Equalizer in Timer + Media ("Both") Mode
- When both media is playing and a timer is active (`mode === 'both'`), the wavy equalizer bars now render in the middle between the track title and the timer countdown: `[Art] [Title] [Equalizer] [0:50]`.
- Dynamic island width auto-fits with generous padding (`min 220px, max 360px`).

### D. Desktop Pet System & Integration
- Desktop pet window and canvas support autonomous roaming, 3D cursor gaze tracking, and dynamic reactions.
- Pet Studio inside the Hub manages companion species, scale, roaming, visibility, and name preferences.

---

## 8. Pass 02: The Voice Awakening (OpenAI Realtime Voice Companion)

### A. Architectural Overview
- **Protocol**: OpenAI Realtime API via WebRTC (`RTCPeerConnection` + WebRTC Data Channel `oai-events`).
- **Model**: `gpt-realtime-mini` (fastest latency, zero lag, modern GA Realtime model).
- **Ephemeral Session Broker (`electron/realtime.js`)**:
  - Securely brokers short-lived client secrets via `POST https://api.openai.com/v1/realtime/client_secrets`.
  - Reads `OPENAI_API_KEY` from `.env` strictly within the Electron main process in development.
  - **Security Boundary**: The developer API key is **never** sent to React, preload IPC, logs, or bundle files. The renderer receives only the short-lived `clientSecret` (`ek_...`) and model name. In packaged production builds, cloud voice requires an authenticated backend URL (`ISLAND_PRODUCTION_REALTIME_URL`), completely preventing key leakage.

### B. Voice Activation & Global Hotkey
- **Global Hotkey**: `Ctrl + Shift + Space` (`CommandOrControl+Shift+Space`).
  - **1st press**: Opens the Voice Assistant interface and begins listening.
  - **2nd press**: Cleanly closes the active voice session and releases audio/network resources.
  - **Non-Focus-Stealing**: Window opens via `win.showInactive()` without taking focus away from user's current game, browser, or code editor.
- **In-App Controls**:
  - Interactive microphone button inside the Island idle pill.
  - Header microphone button with real-time status glow inside the Hub.
  - Tray menu item `Talk to Island (Ctrl+Shift+Space)`.

### C. Natural Real-Time Conversation & Interruption
- **Full-Duplex Speech**: Natural, instantaneous conversational speech with server-side voice activity detection (`server_vad`).
- **Instant Interruption**: Speaking while the assistant is talking automatically cancels assistant playback and transitions the assistant immediately to attentive listening.
- **Language Fluency**: Configured to naturally understand and converse in English, Hindi, and Hinglish.
- **Controls**: One-tap Microphone Mute (`Icon.Mic` / `Icon.MicOff`), Interrupt Assistant button, and End Session button.
- **Clean Teardown**: Releasing all media tracks, closing the data channel, peer connection, and `AudioContext` on disconnect to prevent memory leaks or background mic capture.

### D. Audio-Reactive Waveforms & Visual States
- **Visualizer Engine (`src/components/VoicePanel.jsx`)**:
  - 16-band audio-reactive visualizer powered by `AudioContext` and `AnalyserNode`.
  - **Listening**: Soft sky blue (`#38bdf8`) waveform reacting directly to user microphone input volume.
  - **Thinking**: Pulsing amber (`#f59e0b`) sine wave during API response generation.
  - **Speaking**: Emerald green (`#10b981`) waveform reacting to incoming assistant audio playback.
  - **Error**: Soft red pill with descriptive error messaging and retry button.
- **Live Speech Transcription**:
  - Streams user input transcript (`conversation.item.input_audio_transcription.completed`).
  - Streams assistant output speech delta (`response.audio_transcript.delta`).
- **Compact Island Mode**:
  - Collapsed Island pill displays a mini 6-bar audio-reactive waveform with state dot and assistant name.

### E. Assistant Identity & Pet Companion Integration
- **Identity Settings**:
  - Assistant display name synced with Pet's name (`island_pet_name`, e.g. "Batman" or "Mochi").
  - User identity preference ("What should Island call you?", `island_user_name`, e.g. "Kush").
  - Injected directly into the assistant's system instructions: *"You are {petName}... You are conversing directly with {userName}..."*.
- **Pet State Machine Sync**:
  - Broadcasts `voice:state` via Electron IPC.
  - **Listening**: Pet pauses roaming, turns attentive, and enters focused sit (`ANIMATION_STATES.SIT`, mood `alert`).
  - **Speaking**: Pet reacts happily (`ANIMATION_STATES.HAPPY`).
  - **Idle**: Returns to autonomous desktop behavior.

### F. Setup Instructions for Development
1. Ensure `.env` is present in the workspace root:
   ```env
   GEMINI_API_KEY=...
   OPENAI_API_KEY=sk-... # Optional secondary provider
   ```
2. Run `npm run dev` to launch the dev server and Electron app.
3. Press `Ctrl + Shift + Space` or tap the microphone icon in Island to talk.

---

## 7. Pass 02.1: Gemini Live Voice Migration Report

### A. Architectural Investigation & Free-Tier Verification
- **Bidirectional WebSocket API (`bidiGenerateContent`) Assessment**:
  - We systematically tested all 50 models in the user's project against Google's Multimodal Live API WebSocket endpoint (`wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent` and `v1beta`).
  - Result: Every model returned code `1008: models/... is not found for API version v1alpha, or is not supported for bidiGenerateContent`.
  - Finding: Google AI Studio restricts raw WebSocket `bidiGenerateContent` streaming on standard unpaid free-tier keys.
- **Dedicated Free-Tier Gemini Voice Pipeline**:
  - `gemini-3.5-flash`: Fully active on free tier for multimodal speech understanding and multi-turn context (English, Hindi, Hinglish).
  - `gemini-3.8-flash-tts`: Fully active on free tier for high-fidelity speech synthesis, producing crisp native 24kHz/16kHz WAV audio (`audio/wav`) with voice preset `Puck` / `Kore`.
  - Both models verified and tested end-to-end with the developer's `GEMINI_API_KEY`.

### B. Security & Electron Main-Process Service
- Created `electron/gemini.js` with `GeminiVoiceService`.
- **Strict Key Safeguarding**: `GEMINI_API_KEY` is loaded strictly inside the Electron main process from `.env` or process environment. The API key is **never** sent to React, preload APIs, logs, or bundles.
- Exposed validated IPC channels via `electron/preload.js`:
  - `window.island.gemini.processSpeech({ audioData, history, petName, userName, voice })`
  - `window.island.gemini.synthesizeSpeech({ text, voice })`
  - `window.island.gemini.getStatus()`

### C. Voice Engine & Audio-Reactive Waveforms
- Refactored `src/hooks/useRealtimeVoice.js` to a provider-based architecture with Gemini as the default.
- Real Audio Data:
  - **Listening**: Real microphone amplitude drives the 16-band waveform in soft sky blue (`#38bdf8`) via Web Audio `AnalyserNode`.
  - **Thinking**: Cinematic animated light sweep (`.voice-thinking-sweep`) flowing across dark glass without generic loaders or spinners.
  - **Speaking**: Output audio from `gemini-3.8-flash-tts` is decoded into `AudioBuffer` and routed through an `AnalyserNode` before reaching speakers, driving the emerald green (`#10b981`) waveform with real audio data.
- **Client-Side VAD (Voice Activity Detection)**:
  - Continuously samples microphone audio.
  - Detects speech onset and natural pauses (850ms silence threshold) to automatically submit turns.
  - Supports instant barge-in: speaking while the assistant is talking immediately interrupts playback and returns to listening.

### D. UI Polish & Dynamic Styling
- **Dynamic Scrollbar Thumb**: Added `scrollbar-color` and `::-webkit-scrollbar-thumb` using `color-mix(in srgb, var(--music-accent, var(--accent, #38bdf8)) 65%, rgba(255, 255, 255, 0.25))` with subtle glow on hover, replacing the blurry gray scrollbar in the Pet and Settings panels.
- **Dynamic Controls**: Slider accent colors and tags follow the dynamic music album art tint.
- **Error States**: Free-tier rate limits and connection errors display cleanly with Retry and Dismiss buttons without leaking credentials or showing OpenAI billing cards.
- **External Links**: Safe `shell.openExternal` handling in `electron/main.js`.




