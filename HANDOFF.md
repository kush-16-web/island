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


---

## 8. Pass 2.2.5: Conversational Music Intelligence, Contextual Corrections & Seamless Audio Handoff

### A. Architectural Overview & Core Achievements
Pass 2.2.5 transforms Island from a rigid command parser into an adaptive conversational AI companion with reliable music-control abilities:
1. **Audible External Music Ducking (~10% level)**:
   - Controls physical audio volume in the YouTube Music Chrome tab via extension bridge (`action: 'duck'`, `level: 0.10`).
   - Ducking activates immediately when listening starts (via mic button or `Ctrl+Shift+Space`), remains active while user speaks, while AI processes, and while Island speaks.
   - Smoothly restores volume upon turn completion or session dismissal via `restore_volume` and Web Audio ease-in-out curve.
   - Safe fallback when companion is not connected: temporary pause via SMTC (`pausedForDucking = true`) with strict guard `explicitPauseDuringDuck` preventing accidental auto-resumption if the user requested a pause.
2. **Natural Music Handoff & Transient Dismissal**:
   - Verification before speaking: Never claims "Playing" before `confirmed_playing` is verified from companion or SMTC.
   - Concise, grounded acknowledgments ("Playing Pashmina. Enjoy!").
   - Upon confirmed playback and completion of spoken confirmation, automatically dismisses transient Voice Agent (`island:dismiss-voice`) returning focus to the compact music pill without robotic repetition.
   - Guards against premature dismissal while speaking or when clarification is required.
3. **Structured Ordered Action Planning (`action-plan.js`)**:
   - Replaced brittle string splitting with an ordered `ActionPlan` engine.
   - Compound commands ("Pause this and play Pashmina", "Stop the current song and play Starboy", "Turn the music down and play Tuu") preserve every requested action in order.
   - Handles partial failures explicitly without dropping secondary actions.
4. **Contextual Track Resolution & Corrections (`music-conversation-context.js`)**:
   - Detects corrections across conversational turns ("No, T-U-U. It's a Hindi song").
   - Normalizes spelled-out letter sequences (`T-U-U` -> `tuu`).
   - Uses language clues (`hindi`, `punjabi`, etc.) and artist hints (`by Arijit Singh`) to re-search Favorites with weighted phonetic scoring.
   - Resolves candidate references ("No, the other one", "the second one", "the previous one").
   - Confirmed Title Alias Learning: Persists verified user aliases to `island_music_aliases` in storage only upon successful playback confirmation.
5. **Deterministic Execution + AI Intent Hybrid**:
   - Retains deterministic execution for state transitions, track verification, volume safety, and timeouts.
   - Retains native Windows SAPI speech playback pipeline (`native-audio-player.js`).
   - Retains English Whisper speech recognition preference.

### B. Automated Verification
- **Test Suite**: `test/pass2-2-5-conversational-music.test.cjs` covering all 17 requirements specified in Pass 2.2.5 Priority 8.
- **Full Project Tests**: 271 passed, 0 failed, 1 skipped (272 total tests).
- **Production Bundle**: `npm run build` completed cleanly in 2.04s.

---

## 9. Pass 2.2.6: Premium Full Lyrics Experience

### A. Architectural Overview & Core Achievements
Pass 2.2.6 makes opening the full lyrics screen feel like a seamless physical expansion of the music player rather than a disconnected modal:

1. **Shared Element Album-Art Transition**:
   - Integrated `framer-motion` `LayoutGroup` (`nowplaying-lyrics-group`) and `AnimatePresence mode="popLayout"`.
   - Shared layout tokens across `NowPlaying.jsx` (64×64) and `FullLyrics.jsx` (92×92):
     - `layoutId="island-album-art-wrap"`: Glides and scales smoothly between player position and lyrics hero position.
     - `layoutId="island-album-art-img"`: Image scales naturally preserving aspect ratio with `object-fit: cover`.
     - `layoutId="island-track-meta"`: Track title and artist glide into hero metadata.
     - `layoutId="island-progress-wrap"`: Scrubbing progress bar glides smoothly between player and lyrics layouts.
   - Symmetric, interruptible spring transition (`stiffness: 280, damping: 28, mass: 0.85`), handling rapid open/close toggles without snapping or visual artifacts.
   - Respects `prefers-reduced-motion` accessibility preferences by collapsing to instant/fade transitions.

2. **Refined Full Lyrics Two-Column Layout**:
   - **Left Hero Column (`full-lyrics__hero`)**: 92×92 high-res cover art with depth shadow (`0 8px 24px rgba(0,0,0,0.5)`), overlaid favorite heart button, crisp bold title and artist marquee, and sync/karaoke status pill.
   - **Right Column (`full-lyrics__right`)**: Top navigation bar with "Player" chevron back button, fluid vertical lyrics scroller with smooth gradient masks (`linear-gradient(to bottom, transparent 0%, black 10%, black 88%, transparent 100%)`).
   - Active synchronized line displays crisp white typography with soft ambient glow derived from `--lyric-accent`. Past lines fade gracefully to 0.32 opacity.
   - Responsive cubic-bezier auto-scroll (`1 - Math.pow(1 - t, 3)`) with manual scroll pause detection (2.8s grace period before auto-scroll resumes).
   - Word-level ELRC Karaoke mode when syllable timestamps are present.
   - Click-to-seek directly on any synchronized lyric line.

3. **High-Resolution Artwork Pipeline (`src/hooks/useHighResArt.js` & `src/lib/art-resolver.js`)**:
   - Automatically upgrades low-resolution thumbnails to crystal-clear HD master artwork:
     - Spotify: converts `ab67616d00004851` (64×64) and `ab67616d00001e02` (300×300) to `ab67616d0000b273` (640×640 HD).
     - Apple Music: converts `/100x100bb.` to `/1200x1200bb.`.
     - YouTube: converts `/vi/.../hqdefault.jpg` to `/vi/.../maxresdefault.jpg`.
     - YouTube Music / Google CDN: converts `=w\d+-h\d+` to `=w1200-h1200`.
     - Deezer: converts `/250x250` to `/1000x1000`.
     - Tidal: converts `/320x320` to `/1280x1280`.
   - Zero blank-frame flashing: renders existing raw art immediately, preloads upgraded URL in background `Image()` object, and swaps display only when decoding completes.
   - Graceful fallback: falls back to base art if high-res URL 404s.

4. **Plain Lyrics Integrity**:
   - **Never fabricates timestamps**: When LRCLIB returns plain lyrics, lines maintain `timeMs: null, endMs: null`.
   - Clearly badged as "Plain Lyrics" with an unsynchronized notice pill and clean readable typography.

5. **Performance, Accessibility & Keyboard Controls**:
   - Optimized for modest Windows laptops with integrated graphics and 8 GB RAM.
   - Hardware-accelerated ambient backdrop using CSS `radial-gradient` derived from the artwork color palette (zero expensive continuous blur shaders or canvas loops).
   - Keyboard navigation: Pressing `Escape` while in full lyrics returns immediately and smoothly to the player.
   - Scrub bar supports pointer capture and slider keyboard accessibility.

6. **Canvas Art Dormancy & Future Cinema Separation**:
   - Canvas Art remains dormant (`ENABLE_CANVAS_ART = false`) in `NowPlaying.jsx` and `VideoPiP.jsx`.
   - No Three.js renderer or living canvas loops run on the lyrics screen.
   - Artwork metadata and layout transitions remain cleanly separated for the future Pass 2.2.8 concert stage.

### B. Automated Verification
- **Test Suite**: `test/pass2-2-6-full-lyrics.test.cjs` (10 passing tests verifying high-res artwork upgrading, plain lyrics timestamp integrity, shared `layoutId` alignment, two-column structure, Canvas Art dormancy, and CSS ambient styling).
- **Full Project Test Suite**: 282 passed, 0 failed, 1 skipped (283 total tests across 76 suites).
- **Production Bundle**: `npm run build` compiled cleanly in 3.23s.

---

## 10. Pass 2.2.6: Source-Aware Music Foundation & Natural Conversational Intelligence

### A. Architectural Overview & Core Achievements
Pass 2.2.6 repairs critical cross-provider favorites routing, elevates natural-language music understanding, embeds interactive Favorites in Agent chat, and stabilizes the voice session lifecycle:

1. **Provider-Aware Favorites Storage & Playback Routing**:
   - **Root Cause of Spotify -> YouTube Music Substitution**: `addFavorite` was correlating media with `window.__islandCompanionState` even when `media.app === 'Spotify'`. If Chrome had YouTube Music open, `addFavorite` adopted the YTM video ID and marked provider as `YOUTUBE`. Furthermore, duplicate checking on title/artist alone was causing identical titles on different services to overwrite or collide.
   - **Spotify Isolation Guarantee**: If `media.app === 'Spotify'` or `isVerifiedSpotify(track)`, companion correlation is strictly bypassed. The track stores `provider: 'spotify'`, `source: 'spotify'`, `isVerifiedSpotify: true`, and `playableUrl: 'spotify:search:...'` or exact `spotify:` URI.
   - **Authoritative Provider Dispatch**: `playFavoriteTrack` examines the verified provider. Spotify favorites always open Spotify protocol URLs, never substituting YouTube Music. YouTube Music favorites dispatch to the browser companion or open YouTube Music watch URLs.
   - **Multi-Provider Identity & Badges**:
     - Unique IDs use provider prefixes (`spotify:...`, `youtube:...`, `apple:...`). Identical songs across services coexist without collision.
     - Added source badges (`.fav-item__provider-badge`, `.inline-favs__badge`) with distinct color themes for Spotify, YouTube Music, Apple Music, and Unknown.
     - Compact filter pills in `FavoritesMenu.jsx`: `All`, `Spotify`, `YouTube Music`, and dynamically rendered `Unknown` (only shown when unresolved entries exist).

2. **Natural-Language Music Understanding Pipeline (`music-command-interpreter.js` & `favorites-resolver.js`)**:
   - **Constraint Stripping**: Sentences like "Play city of star from my list", "Play attention from my saved songs", "Play Starboy from my favorites" now extract clean song titles (`"city of star"`, `"attention"`, `"starboy"`) and strip packaging constraints.
   - **Fuzzy Resolution**: `resolveFavoriteTrack` resiliently matches fuzzy titles ("city of star" -> "City of Stars") using token overlap, Levenshtein distance, phonetic normalization, and language hint boosts.
   - **Informational Query Guard**: Questions such as "Tell me about this artist", "Who sings this song?", "What genre is this?" are guarded from triggering playback and cleanly fall back to conversational LLM.
   - **Polite Closings**: Courteous phrases ("Thanks", "No, that's all", "Bye") trigger `session_dismiss` without re-arming the microphone.

3. **Interactive Inline Favorites in Agent Chat (`InlineFavorites.jsx` & `VoicePanel.jsx`)**:
   - General list inquiries ("Show my favorite songs", "Name all of them", "Show my Spotify favorites") execute `list_favorites` or `count_favorites` without redirecting away from the conversation.
   - Renders interactive inline cards in the assistant's speech turn with album art, title, artist, source badge, filter pills, and a direct Play button.
   - Tracks are stored in `musicContext.setDisplayedFavorites(list)` allowing natural follow-ups ("Play the third one", "Play number 2") to resolve against `displayedFavorites[index]`.

4. **Voice Session Lifecycle & Audio Ducking**:
   - **Completed Playback Handoff**: When a playback action completes successfully and no clarification is needed, the assistant speaks the confirmation, smoothly restores ducked music, stops the session, and cleanly dismisses the transient voice panel (`island:dismiss-voice`).
   - **Clarification Loops**: If match is ambiguous or needs user selection, the controller remains in `listening` state so the user can speak their choice naturally.
   - **Courteous Dismissals**: Polite closings speak an acknowledgment, restore audio volume, and dismiss cleanly without re-arming the mic.

### B. Automated Verification
- **Test Suite**: `test/pass2-2-6-source-aware-music.test.cjs` covering all 12 acceptance criteria:
  1. Spotify favorite saved with correct source metadata.
  2. Spotify favorite reopened without YouTube Music substitution.
  3. YouTube Music favorite plays correctly via companion.
  4. Existing favorites survive migration idempotently.
  5. Source filters (`All`, `Spotify`, `YouTube Music`, `Unknown`) work.
  6. "Play city of star from my list" resolves to "City of Stars".
  7. "Name all of them" / "Show my favorite songs" returns records via `list_favorites`.
  8. Follow-up "Play the third one" resolves against `displayedFavorites[2]`.
  9. Agent dismisses correctly after completed playback handoff and polite closing.
  10. Agent remains active when clarification is pending.
  11. Music ducking and restoration remain correct.
  12. Non-music queries do not trigger playback.
- **Full Project Test Suite**: 295 passed, 0 failed, 1 skipped (296 total tests across 77 suites).
---

## 11. Pass 2.2.6.1: Conversational Agent Reliability, Semantic Tool Execution & Companion Timeout Repair

### A. Root Cause Analysis & Proven Divergences
Real multi-turn voice conversations were thoroughly investigated across screen recordings and codebase traces, revealing four interconnected root causes:

1. **"Play any random one from it" Literal Query Defaulting**:
   - In `music-command-interpreter.js`, `playMatch = cleaned.match(/^play\s+(.+)$/i)` caught phrases like "Play any random one from it".
   - The query `"any random one from it"` failed fuzzy resolution against favorites.
   - Execution fell through to `executeMusicAction({ action: 'play_track', query: 'any random one from it' })`, searching Spotify / YouTube for the literal sentence instead of executing collection selection.
2. **Count vs. List Inconsistency & Missing Inline Favorites Cards**:
   - `list_favorites` and `count_favorites` existed solely in local regexes and were omitted from `ISLAND_MUSIC_TOOLS` in `electron/groq.js` and the Gemini system prompt in `electron/gemini.js`.
   - When a user's natural phrasing deviated from local regexes, it fell through to the conversational LLM.
   - The LLM could only call `show_favorites`. In `music-actions.js`, `show_favorites` returned `{ count: 8, spokenConfirmation: 'Opening your favorites. You have 8 saved songs.' }` with **NO `tracks` payload**, preventing `InlineFavorites.jsx` from rendering cards.
   - Furthermore, `show_favorites` never recorded the tracks into `musicContext.setDisplayedFavorites(list)` or `musicContext.setLastReferencedCollection('favorites', list)`.
3. **Chrome Companion Ducking & Restoration Command Timeouts (`12000ms`)**:
   - In `electron/companion-bridge.js`, `dispatchCommand` queued commands into `inFlightCommands` with an unconditional 12,000ms timeout even when `!this.isConnected()` or `!this.companionInfo.isYtMusicActive`.
   - In `extension/background.js`, when `!primaryTab` (no active YouTube Music tab), `pullAndDispatchCommand()` pulled `duck` and `restore_volume` from Island, attempted to create a search tab (`search?q=%20`), and **never posted an acknowledgment** back to `/companion/ack`.
   - This caused Electron main to hang for 12,000ms and log repeated `Command "duck" timed out after 12000ms` and `Command "restore_volume" timed out after 12000ms` errors.
4. **Context Loss on Multi-Turn Anaphoric Queries**:
   - References like "from it", "from them", "those", "that list" were discarded after a single turn because previous collections were not preserved in session-scoped conversation context.

---

### B. Architectural Changes & Implementations

1. **General Semantic Tool Planner (`src/lib/semantic-tool-planner.js`)**:
   - Implements a validated `AgentAction` planning schema:
     - `favorites.count` (filter?: 'all' | 'spotify' | 'youtube')
     - `favorites.list` (filter?: 'all' | 'spotify' | 'youtube')
     - `favorites.select` (selection: { kind: 'random' | 'ordinal' | 'track' }, collectionRef?: string)
     - `music.play` (trackRef: string, provider?: string)
     - `music.control` (operation: 'pause' | 'resume' | 'stop' | 'next' | 'previous' | 'volume')
     - `conversation.clarify` (question: string)
     - `conversation.dismiss` ()
     - `conversation.info` (topic: string, query: string)
   - Resolves conversational anaphora ("from it", "from them", "from those", "that list") against active session collection references.
   - Guarantees runtime schema validation at the model-to-action boundary (`validateAgentAction`).
   - Truthful handling of non-supported capabilities (e.g., weather): routes to `conversation.info` (`topic: 'weather'`), responding with an honest capability limitation rather than fabricating data or triggering playback.

2. **Session-Scoped Multi-Turn Memory (`src/lib/music-conversation-context.js`)**:
   - Added `setLastReferencedCollection(type, tracks, filter)` and `getLastReferencedCollection()`.
   - Added `getRandomTrackFromCollection(filter)` to execute genuine collection-aware track selection.
   - Maintained stable item references surviving across voice turns, state transitions, and TTS playback.

3. **Deterministic Favorites List & UI Rendering Contract (`src/lib/music-actions.js`)**:
   - Unified `show_favorites` and `list_favorites`: both query authoritative `island_favorites_v2` storage, update session context (`setDisplayedFavorites` and `setLastReferencedCollection`), and return structured payloads containing `tracks: list` and `totalCount: count`.
   - Added `favorites_select_random` and `favorites_select_ordinal` allowlisted actions.
   - Fixed companion playback execution in `play_random_favorite`: passes `companion` and `onDispatchCompanion` to `handlePlaybackExecution` (previously omitted).

4. **LLM Tool Calling Alignment (`electron/groq.js` & `electron/gemini.js`)**:
   - Added `list_favorites` and `count_favorites` to `ISLAND_MUSIC_TOOLS` in `electron/groq.js`.
   - Added `list_favorites` and `count_favorites` to supported music actions in `electron/gemini.js` system prompt.

5. **Chrome Companion Transport Repair (`electron/companion-bridge.js` & `extension/background.js`)**:
   - **Fail-Fast for Disconnected State**: When `!this.isConnected()` or `!this.companionInfo.isYtMusicActive`, `dispatchCommand` for volume commands (`duck`, `restore_volume`, `set_volume`) resolves immediately with `{ ok: false, status: 'no_player' }` within `<200ms`, completely eliminating 12-second hanging promises.
   - **Bounded Volume Command Timeout**: Reduced volume command timeout from 12,000ms to 2,500ms.
   - **Deduplication of Restore Requests**: If a `restore_volume` command is already in flight, returns the in-flight promise.
   - **Extension Ack on Zero Tabs**: When `!primaryTab`, `extension/background.js` immediately posts an ack `{ status: 'no_player' }` for volume and transport commands instead of opening an empty search tab.
   - **Audio Coordinator Hardening (`src/lib/audio-coordinator.js`)**: `startDucking` and `restoreVolume` catch dispatch errors non-blockingly, guaranteeing the voice turn is never stalled by companion latency.

6. **Structured Turn Diagnostics**:
   - Added `recordTurnDiagnostic` logging `turn_id`, `session_id`, `transcript`, `intent_source`, `selected_intent`, `referenced_collection_id`, `tool_execution_status`, `tool_result_count`, `ui_payload_type`, `ui_render_status`, `companion_connection_state`, and `companion_command_duration` to `window.__islandTurnDiagnostics` (capped to 30 turns).

---

### C. Verification & Test Results
- **Pass 2.2.6.1 Test Suite** (`test/pass2-2-6-1-semantic-agent.test.cjs`):
  1. *Repeated Identical-Input Tests*: 5x identical queries for "Show me my favorite songs", "Name all of them", "How many do I have?", and "Play any random one from it" all pass with 100% determinism.
  2. *Paraphrase Invariance Tests*: 15+ varied natural language phrasings correctly resolve to intended actions.
  3. *Multi-turn State Transitions*: Complete 5-turn conversation (List -> Count -> Random select -> Ordinal correction -> Dismissal) maintains collection references throughout.
  4. *Structured UI Result Contract*: Validates non-null `tracks` arrays, `totalCount`, and truthful limitation on weather queries.
  5. *Companion Transport Timeout Repair*: Validates fail-fast resolution (<200ms) when disconnected, bounded 2500ms timeout, and deduplication of restore requests.
- **Full Project Regression Test Suite**:
  - **301 passed, 0 failed, 1 skipped** (302 tests across 78 test suites in 6.56s).
- **Production Build**:
  - `npm run build` compiled cleanly via Vite in 1.71s with 0 errors.

---

## 10. Pass 2.2.6.2: Multilingual Music Intelligence, Accurate Weather & Compact Agent Result UI

### A. Root Cause Analysis

1. **Multilingual Song Title Mismatches in Whisper Transcription**:
   - Spoken Hindi titles like "Tuu" (from favorites) are frequently transcribed by Whisper as English homophones ("two", "too", "to", "2") or with alternative transliterations ("tu", "too").
   - Previous matching strictly relied on character edit distance (`stringSimilarity`) and hardcoded word replacements, giving a low score (~0.33) between "two" and "Tuu", which resulted in `not_found` and prevented natural playback.

2. **Weather Discrepancies (6–7°C offset from Windows Weather)**:
   - **Timezone Mismatch**: Without explicit timezone specification, Open-Meteo defaulted to UTC, returning observations hours out of phase with the user's local diurnal cycle.
   - **Location Ambiguity**: IP geolocation without validation could point to ISP gateway hubs hundreds of kilometers away rather than the user's actual city.
   - **Apparent vs Current Temperature**: Conflating `temperature_2m` with `apparent_temperature` ("feels like") or daily maximums resulted in reported discrepancies.
   - **Forecast Flattening**: Questions about tomorrow or rain were answered using current weather conditions only.

3. **Overcrowded Agent Tool Results UI**:
   - `InlineFavorites.jsx` rendered tall cards with oversized album art, multiple vertical text blocks, and huge margins, allowing only one song to be visible at a time inside the expanded Agent window.
   - No bounded scrollable list existed, causing tool results to push the voice waveform and primary controls off-screen.
   - There was no structured, native weather card with clean monochrome icons.

---

### B. Architecture & Implementations

1. **Phonetic & Hindi-English Transliteration Similarity Engine (`src/lib/phonetic-transliteration.js`)**:
   - **Homophone & Number Reduction**: Normalizes English number homophones to phonetic roots (`two`/`too`/`to`/`2` -> `tu`, `one`/`won`/`1` -> `wan`, `four`/`for`/`4` -> `for`).
   - **Hindi Transliteration Invariants**: Maps equivalent vowel and consonant digraphs (`uu`/`oo` -> `u`, `ee`/`ii` -> `i`, `aa` -> `a`, `bh` -> `b`, `dh` -> `d`, `th` -> `t`, `w` <-> `v`, geminates `tt` -> `t`).
   - **Phonetic Fingerprinting & Distance**: Computes composite phonetic similarity without requiring heavyweight local AI models, maintaining ultra-low latency on low-power hardware.

2. **Natural Clarification & Confirmation Pipeline**:
   - **Candidate Disambiguation**: In `favorites-resolver.js`, when a phonetic match occurs with text divergence, returns `{ clarificationNeeded: true, confidence: 'medium', suggestedCandidate, candidates, spokenConfirmation: "Did you mean Tuu by Arijit Singh?" }`.
   - **Natural Confirmation Responses**: In `music-conversation-context.js`, handles natural affirmations ("Yes, that one", "Yes", "Yeah", "That one", "Play it") as well as ordinal/contrastive corrections ("No, the other one", "The second one", "The one by [artist]", "No, I meant the Hindi song").
   - **Learned Alias Persistence**: After confirmed clarification, persists the spoken alias (e.g., `'two'` -> `track.id`) into local storage, enabling instant high-confidence direct execution on subsequent turns.

3. **Accurate Weather Engine (`src/lib/weather.js`)**:
   - **4-Tier Location Resolution**:
     1. Explicitly named city in current query (e.g., "in Delhi", "for Mumbai").
     2. Persistent user-configured default weather city (`island_weather_default_city`).
     3. Approximate IP-based city (`http://ip-api.com/json/`) with explicit approximate attribution.
     4. Clear conversational prompt when location cannot be determined.
   - **Open-Meteo Integration**:
     - Coordinates and elevation fetched via Open-Meteo Geocoding API.
     - Fetches `current` (`temperature_2m`, `apparent_temperature`, `weather_code`, `relative_humidity_2m`, `wind_speed_10m`, `is_day`), `daily` (highs, lows, precipitation probabilities), and `hourly` with `timezone=auto`.
   - **Intent-Aware Speech Generation**: Distinguishes current temperature, feels-like, heat queries ("Is it hot outside?"), rain forecasts ("Will it rain this evening?"), and future day forecasts ("How about tomorrow?").

4. **Compact Agent Result UI (`src/components/`)**:
   - **InlineFavorites (`src/components/InlineFavorites.jsx`)**:
     - Compact rows (~48px height), 34px album artwork with lazy load & fallback.
     - Single-line title and artist truncation with subtle provider icon (Spotify / YouTube Music).
     - Bounded scroll container (`max-height: 180px`, custom thin scrollbars) displaying 3-4 songs simultaneously without window expansion.
     - Play button and ordinal index matching voice reference numbering.
   - **InlineWeather (`src/components/InlineWeather.jsx`)**:
     - Compact structured card with temperature, condition, feels-like, daily high/low, precipitation chance, and update time.
     - **Strict Monochrome Line Icons**: Uses Lucide SVG white line icons (`Sun`, `Moon`, `Cloud`, `CloudRain`, `CloudLightning`, `CloudSnow`, `CloudDrizzle`, `CloudFog`, `Thermometer`, `Wind`, `Droplets`). Zero emojis, zero colored backgrounds.
   - **InlineClarification (`src/components/InlineClarification.jsx`)**:
     - Displays up to 3 candidate rows matching clarification prompts for tap or voice selection.

---

### C. Verification & Test Results

- **Pass 2.2.6.2 Test Suite** (`test/pass2-2-6-2-multilingual-weather-agent.test.cjs`):
  1. *Phonetic & Transliteration Engine*: `two`/`too`/`to`/`tu` vs `Tuu` = 1.0; `pashmina` vs `Pasmina` = 1.0; `channa mereya` vs `Chana Merya` >= 0.90; `raataan lambiyan` vs `Ratan Lambiyan` >= 0.85; `Attention` vs `Starboy` < 0.3.
  2. *Phonetic Candidate Ranking & Clarification*: "Play two from my list" triggers clarification with `Tuu` by Arijit Singh.
  3. *Clarification Affirmation & Alias Learning*: "Yes, that one" confirms playback, saves alias, and makes next direct query execute immediately.
  4. *Disambiguation Responses*: "No, the other one", "The second one", "By [artist]" accurately select candidates.
  5. *Weather 4-Tier Location & Grounded Forecasts*: Explicit city ("Delhi"), IP fallback, feels-like distinction, tomorrow forecast, rain probability.
  6. *Weather Conversational Follow-up*: "What's the weather outside?" -> "How about Mumbai instead?" resolves seamlessly.
  7. *Structured UI Result Contracts*: Validates UI payload schema for favorites, clarification, and weather.
  - **Result: 7/7 passed**.

- **Full Project Regression Test Suite**:
  - **309 passed, 0 failed, 1 skipped** (310 tests across 79 test suites).
  - All Pass 2.2.5, 2.2.6.1, and 2.2.6.2 tests pass with 100% determinism.

- **Production Build**:
  - `npm run build` compiled cleanly via Vite in 9.44s with 0 errors.

---

## 11. Pass 2.2.6.3: AI Agent Speech Output, Natural Responses & Latency Repair

### A. Root Cause Analysis

1. **Conflation of Visual Responses & Spoken Speech**:
   - The voice pipeline previously routed the same raw string to both visual chat bubbles and speech synthesis engines.
   - When models or templates used Markdown (e.g. `**title**`, `*artist*`, headings `#`, bullets `* `, numbered lists `1. `), Windows SAPI literally attempted to speak formatting markers (pronouncing "asterisk asterisk", "one dot", etc.) or tripped on URLs, tables, and code snippets.

2. **Excessive Spoken Narration on Visual Cards**:
   - On Favorites list requests, the Agent audibly recited every song title and artist even though rich visual cards were already displayed simultaneously.
   - Conversely, when the user explicitly asked to "read all of them aloud", there was no dedicated logic to cleanly enumerate tracks without Markdown artifacts.

3. **Premature Speaking State (Visualizer Pulsing Before Audio)**:
   - In `VoicePanel.jsx`, turn states `'acknowledging'` and `'completed'` were mapped directly to `currentStatus = 'speaking'`.
   - This caused the living waveform to pulse and status to display "Speaking" while audio synthesis was still in-flight and before the audio hardware began playback.

4. **Lack of End-to-End Pipeline Latency Instrumentation**:
   - Turn timestamps between speech completion, transcription, intent classification, tool execution, and first audible playback were untracked, making it difficult to pinpoint real-world bottlenecks.

5. **Agent Identity Dynamic Configuration**:
   - Verified that the Agent identity is dynamically resolved via `getAssistantName()` (persisted in `island_assistant_name` with fallback to `Nova`).
   - Confirmed zero hardcoded assumptions (such as "Jett") in system prompts, UI labels, TTS output, or new constants.

---

### B. Architecture & Implementations

1. **Structured Agent Response Contract (`src/lib/agent-response-contract.js`)**:
   - **Contract Fields**:
     - `displayText`: Rich conversation content for UI display (Markdown, formatting, cards).
     - `spokenText`: Concise, natural language strictly prepared for TTS.
     - `toolResults`: Structured verified tool outputs (tracks, weather, candidates).
     - `responseStatus`: `'success' | 'clarification' | 'failure' | 'info'`.
   - Single-generation grounding: visual and spoken responses are formed together in a single step without redundant sequential LLM calls.

2. **TTS-Safe Text Normalizer (`cleanTextForSpeech`)**:
   - Structurally strips asterisks (`**`, `*`), underscores (`__`, `_`), strikethroughs, headers (`#`), blockquotes (`>`), and code fences.
   - Normalizes numbered lists from `"1. Track\n2. Track"` into natural spoken pauses: `"1, Track. 2, Track."`.
   - Converts Markdown links to title text and strips long URL query parameters.
   - Translates units and currency into words (`24°C` $\to$ `24 degrees Celsius`, `60%` $\to$ `60 percent`, `$10` $\to$ `10 dollars`, `&` $\to$ `and`).
   - Strips action tags `[[ACTION:...]]` and Unicode emojis.
   - Applied at both the application response boundary and the Windows SAPI service boundary (`electron/windows-tts.js`).

3. **Adaptive Speech Length & Read-Aloud Detection**:
   - `isExplicitReadAloudRequest`: Detects commands like "read all of them aloud", "read them to me", "read my list aloud".
   - `formatFavoritesResponse`:
     - Standard request: Spoken response is concise (`"Here are your 4 favorites."`) while visual cards render tracks.
     - Explicit read-aloud: Spoken response cleanly enumerates tracks without Markdown artifacts.
   - `formatWeatherResponse`: Aligns visual card data with concise, grounded spoken conditions.

4. **Real Voice Pipeline Latency Tracker (`src/lib/latency-tracker.js`)**:
   - Measures all 8 key stages with high-precision timestamps:
     1. `speech_end`: End of user speech / VAD silence trip
     2. `stt_start` & `stt_end`: Whisper transcription
     3. `intent_start` & `intent_end`: Semantic intent & grammar resolution
     4. `tool_start` & `tool_end`: Tool execution
     5. `llm_start` & `llm_end`: Conversational LLM generation
     6. `tts_start` & `tts_end`: TTS synthesis
     7. `audio_first_chunk`: Exact moment hardware begins audible playback (`onStart`)
     8. `speech_completed`: End of speech audio output (`onEnded`)
   - Computes `firstAudioLatencyMs` (`audio_first_chunk - speech_end`) and preserves history on `window.__islandLatencyMetrics`.

5. **Honest Speaking State Synchronization**:
   - In `VoicePanel.jsx`, mapped `acknowledging` and `completed` to `thinking` until hardware `onStart` actually fires.
   - Waveform pulsing and "Speaking" state only activate when audible audio begins.
   - Added `.voice-turn__caption` to render the exact spoken dialogue as a live caption subtitle when `spokenText` differs from `displayText`.

---

### C. Verification & Test Results

- **Pass 2.2.6.3 Test Suite** (`test/pass2-2-6-3-speech-latency.test.cjs`):
  1. *Bold Markdown*: Zero asterisks in spoken text (`**Attention**` $\to$ `Attention`).
  2. *Numbered Lists*: Spoken naturally without "one dot" or linebreaks.
  3. *Headers, Bullets, Code & Units*: Headers, code blocks, links, and units translated to spoken words.
  4. *Favorites Concise Speech*: "Show my favorites" speaks concise count without narrating all songs.
  5. *Explicit Read-Aloud*: "Read my favorites aloud" cleanly narrates all tracks without asterisks.
  6. *Weather Agreement*: Visual card and spoken text agree on temperature and conditions.
  7. *Contract Validation*: Validates `displayText`, `spokenText`, `toolResults`, `responseStatus`.
  8. *Configurable Identity*: Changing name to "Aura" and "Zephyr" reflects dynamically with zero hardcoding.
  9. *Latency Tracking*: Correctly records 8 stages and calculates `firstAudioLatencyMs`.
  - **Result: 9/9 passed**.

- **Full Project Regression Test Suite**:
  - **319 passed, 0 failed, 1 skipped** (320 tests across 80 test suites in 7.26s).
  - Pass 2.2.5, 2.2.6.1, 2.2.6.2, and 2.2.6.3 tests all pass with 100% determinism.

- **Production Build**:
  - `npm run build` compiled cleanly via Vite in 1.92s with 0 errors.





