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

## 5. Git Checkpoints
1. `a324b03`: `feat: checkpoint 1 - draggable island, click-outside dismissal, and integrated pet studio`
2. `8fcd91c`: `feat: checkpoint 2 - 3D Three.js pet engine, procedural locomotion, and model loading foundation`

