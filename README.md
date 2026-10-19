# Island

A Dynamic Island for Windows, built with Electron + React. It floats at the top of your screen, shows what's playing, pops up notifications, runs timers and alarms, and has a little cat living next to it.

This is phase 1: the island is fully working, the pet is UI only (it reacts to the island and follows your cursor with its eyes, but doesn't do anything yet).

## Run it

You need Node.js 20.19+ or 22.12+ (https://nodejs.org).

```
npm install
npm run dev
```

The island appears at the top-center of your primary monitor. A tray icon (bottom right) lets you hide it, open the hub, toggle launch-at-startup, send a test notification, or quit.

**Design in the browser first (no Electron):** `npm run dev:web` and open http://127.0.0.1:5173. A small dev bar at the bottom lets you fake notifications, music, timers and alarms, so you can iterate on the look quickly.

## What it does

| Feature | How it works |
| --- | --- |
| Now playing | Reads the Windows media session (Spotify, YouTube in a browser, Media Player, VLC...) through a small PowerShell helper. Shows the cover, controls play/pause/next/previous. |
| Notifications | Any tool can send one to a local endpoint. They toast on the island and are kept in the Inbox tab. |
| Timers | Quick buttons (1/5/10/15/25/45 min) or any number of minutes. Shows in the pill while running. |
| Alarms | Time, repeat days, label, on/off switch. Rings with a chime; Snooze (5 min) or Stop. Saved between restarts. |
| Hub | Click the island, press **Ctrl+Alt+Space**, or click the tray icon. Auto-collapses when you move away. |
| Click-through | The window is transparent and never blocks the apps below. It only catches the mouse over the island and the pet. |

### Send a notification from anywhere

From this project:

```
npm run notify -- "Build finished" "42 tests passed" --kind success --app Terminal
```

From PowerShell:

```
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:47823/notify -ContentType 'application/json' -Body (@{ title = 'Build finished'; body = '42 tests passed'; app = 'Terminal'; kind = 'success' } | ConvertTo-Json)
```

Fields: `title` (required), `body`, `app`, `kind` (`info`, `success`, `warning`, `error`), `timeoutMs`.

The endpoint only listens on 127.0.0.1, only accepts `application/json`, checks the Host header and limits request size, so websites in your browser can't push notifications to it.

### Known limits (on purpose, for now)

- **It can't read Windows' own notification toasts** (WhatsApp, Outlook...). Windows only lets packaged apps do that. Planned for a later phase with a small helper. Until then, notifications come from the endpoint above and from the island's own alarms and timers.
- Now playing and its controls are Windows only. On other systems the island still runs; that tab just says nothing is playing.
- The overlay sits on the primary monitor.
- While you type in a text field (alarm label), the window briefly takes keyboard focus, then hands it back.

## Tests

```
npm test
```

Covers the scheduler (alarm and timer maths, repeats, missed alarms, snooze, persistence), the notification endpoint (validation, size limits, host checks) and the media parsing.

## Build an installer

```
npm run dist
```

Creates a Windows installer in `release/`.

## Project layout

```
electron/
  main.js            window, tray, hotkey, IPC, wiring
  preload.js         the only bridge between UI and OS
  scheduler.js       alarms + timers (pure Node, tested)
  notify-server.js   local HTTP endpoint for notifications
  media.js           runs the PowerShell helper, restarts it if it dies
  ps/smtc.ps1        reads/controls the Windows media session
  media-parse.js     turns helper output into UI state
  store.js           small JSON file store
src/
  components/
    Island.jsx       the pill: picks what to show and morphs between sizes
    Hub.jsx          tabs: Playing / Clock / Inbox
    Pet.jsx          the cat (SVG + CSS, no assets)
  hooks/             state from the main process
  lib/mockIsland.js  fake backend for browser-only design
  styles.css         all styling and the pet animations
scripts/
  island-notify.js   CLI for notifications
  make-icons.js      regenerates the tray and app icons
test/                unit tests
```

## Next phases

1. Pet behaviour: walks to the island, reacts to music, opens apps.
2. Drag shelf: drop files on a shelf at the screen edge and drag them out later.
3. Hold-to-talk dictation (local Whisper) and a chat bubble from the pet.
4. Windows notification capture.
