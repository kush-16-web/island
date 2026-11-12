/**
 * Music Volume Visual & Functional Correction Test Suite
 *
 * Verifies:
 * 1. Shared MusicVolumeControl component (pill track, custom pointer slider, keyboard nav, mute toggle, solid white fill, no <input type="range">)
 * 2. Applied consistently in both Hover Music (Island.jsx) and Expanded Music (NowPlaying.jsx)
 * 3. Per-app Windows WASAPI ISimpleAudioVolume controller (does not modify Windows Master Volume)
 * 4. Volume normalization, single-backend routing (no YTM + WASAPI double-muting), mute restoration, and no volume:null silencing
 * 5. CompanionBridge supersedes rapid set_volume commands instead of deduplicating them
 * 6. IPC & Preload contracts (media:get-volume, media:set-volume, media:set-mute, media:volume-changed)
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { AppVolumeController, normalizeVolumePercent, toNormalizedRatio } = require('../electron/app-volume');
const { CompanionBridge } = require('../electron/companion-bridge');

test('Music Volume Visual & Functional Correction Suite', async (t) => {
  const mvcJsx = fs.readFileSync(path.join(__dirname, '../src/components/MusicVolumeControl.jsx'), 'utf-8');
  const css = fs.readFileSync(path.join(__dirname, '../src/styles.css'), 'utf-8');
  const islandJsx = fs.readFileSync(path.join(__dirname, '../src/components/Island.jsx'), 'utf-8');
  const npJsx = fs.readFileSync(path.join(__dirname, '../src/components/NowPlaying.jsx'), 'utf-8');
  const preloadJs = fs.readFileSync(path.join(__dirname, '../electron/preload.js'), 'utf-8');
  const psScript = fs.readFileSync(path.join(__dirname, '../electron/ps/app-volume.ps1'), 'utf-8');

  await t.test('1. MusicVolumeControl: custom pill slider with solid white fill, hover/drag expansion & no default range input', () => {
    assert.ok(!mvcJsx.includes('<input'), 'Must NOT use default <input type="range">');
    assert.ok(mvcJsx.includes('role="slider"'), 'Must expose ARIA slider role');
    assert.ok(mvcJsx.includes('ArrowRight') && mvcJsx.includes('ArrowLeft'), 'Must support keyboard arrow adjustment');
    assert.ok(mvcJsx.includes('setPointerCapture'), 'Must support smooth pointer drag');
    assert.ok(mvcJsx.includes("backgroundColor: '#ffffff'"), 'Volume fill must be solid white');
    assert.ok(mvcJsx.includes('mvc__mute-btn') && mvcJsx.includes('Icon.VolumeX'), 'Must support mute/unmute via speaker icon');
    assert.ok(css.includes('.mvc__track') && css.includes('height: 4px;') && css.includes('height: 10px;'), 'Track must be thin at rest and expand on interaction');
    assert.ok(css.includes('.mvc__fill') && css.includes('.mvc__thumb'), 'Must render filled track and circular thumb');
  });

  await t.test('2. Shared component usage in both Hover and Expanded players', () => {
    assert.ok(islandJsx.includes('<MusicVolumeControl'), 'Hover Music must use shared MusicVolumeControl');
    assert.ok(npJsx.includes('<MusicVolumeControl'), 'Expanded Music must use shared MusicVolumeControl');
    assert.ok(islandJsx.includes('media:volume-changed'), 'Must sync external/cross-view volume changes');
  });

  await t.test('3. WASAPI per-app volume script targets ISimpleAudioVolume, never Master Endpoint', () => {
    assert.ok(psScript.includes('ISimpleAudioVolume'), 'Must use per-app ISimpleAudioVolume');
    assert.ok(!psScript.includes('IAudioEndpointVolume'), 'Must NOT touch Windows Master Volume');
  });

  await t.test('4. Volume normalization & clamping (0-100 and 0.0-1.0)', () => {
    assert.equal(normalizeVolumePercent(72.4), 72);
    assert.equal(normalizeVolumePercent(-10), 0);
    assert.equal(normalizeVolumePercent(145), 100);
    assert.equal(normalizeVolumePercent(NaN), null);
    assert.equal(toNormalizedRatio(80), 0.8);
    assert.equal(toNormalizedRatio(20), 0.2);
    assert.equal(toNormalizedRatio(0), 0);
    assert.equal(toNormalizedRatio(100), 1);
  });

  await t.test('5. YouTube Music Companion receives normalized 0-1 volume (never null/0 silencing) and exclusive routing', async () => {
    const dispatched = [];
    const mockBridge = {
      isConnected: () => true,
      getStatus: () => ({ isYtMusicActive: true }),
      dispatchCommand: async (cmd) => {
        dispatched.push(cmd);
        return { ok: true };
      },
    };
    const ctrl = new AppVolumeController();
    // Prevent accidental PS call if routing breaks
    ctrl._execPs = async () => { throw new Error('WASAPI must NOT run when YTM companion is active'); };

    const r1 = await ctrl.setVolume('Chrome', 80, mockBridge);
    assert.equal(r1.ok, true);
    assert.equal(r1.supported, true);
    assert.equal(r1.volume, 80);
    assert.equal(r1.source, 'youtube_music_companion');
    assert.equal(dispatched[0].volume, 0.8);

    const r2 = await ctrl.setVolume('Chrome', 20, mockBridge);
    assert.equal(r2.volume, 20);
    assert.equal(dispatched[1].volume, 0.2);

    // Mute and unmute restoration preserves 20%
    const m1 = await ctrl.setMute('Chrome', true, mockBridge);
    assert.equal(m1.ok, true);
    assert.equal(m1.muted, true);
    assert.equal(dispatched[2].volume, 0);

    const m2 = await ctrl.setMute('Chrome', false, mockBridge);
    assert.equal(m2.ok, true);
    assert.equal(m2.muted, false);
    assert.equal(m2.volume, 20);
    assert.equal(dispatched[3].volume, 0.2);
  });

  await t.test('6. CompanionBridge supersedes rapid set_volume commands instead of deduplicating', async () => {
    const bridge = new CompanionBridge();
    bridge.handlePing({ isYtMusic: true, status: 'playing' });
    const p1 = bridge.dispatchCommand({ action: 'set_volume', volume: 0.8 });
    const p2 = bridge.dispatchCommand({ action: 'set_volume', volume: 0.2 });
    const r1 = await p1;
    assert.equal(r1.status, 'superseded');
    assert.equal(bridge.pendingCommands.length, 1);
    assert.equal(bridge.pendingCommands[0].volume, 0.2);
    // Clean up pending command timer
    bridge.handleAck({ commandId: bridge.pendingCommands[0].id, status: 'volume_set' });
    const r2 = await p2;
    assert.equal(r2.ok, true);
  });

  await t.test('7. AppVolumeController reports unsupported cleanly when no matching audio session exists', async () => {
    const ctrl = new AppVolumeController();
    const res = await ctrl.getVolume('nonexistent-island-test-app-xyz');
    assert.equal(res.ok, true);
    assert.equal(res.supported, false);
    assert.ok(res.reason.includes('No active Windows audio session'));
  });

  await t.test('8. Preload exposes media volume IPC contracts', () => {
    assert.ok(preloadJs.includes('media:volume-changed'), 'Preload must whitelist media:volume-changed');
    assert.ok(preloadJs.includes('getVolume:'), 'Preload must expose media.getVolume');
    assert.ok(preloadJs.includes('setVolume:'), 'Preload must expose media.setVolume');
    assert.ok(preloadJs.includes('setMute:'), 'Preload must expose media.setMute');
  });
});
