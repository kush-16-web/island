'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const { CompanionBridge } = require('../electron/companion-bridge');
const { createNotifyServer } = require('../electron/notify-server');
const {
  handlePlaybackExecution,
  playFavoriteTrack,
} = require('../src/lib/music-actions');
const {
  SUPPORTED_PROVIDERS,
  buildPlayableReference,
  createFavoriteId,
} = require('../src/lib/favorites');

test('Pass 2.2 Proof of Concept - Browser Companion Bridge & Scenarios', async (t) => {
  let bridge;
  let server;
  let port;

  t.beforeEach(async () => {
    bridge = new CompanionBridge({ pingExpiryMs: 3000, commandTimeoutMs: 2000 });
    server = createNotifyServer({
      port: 0,
      companionBridge: bridge,
      onNotify: () => 'test-id',
      onVideoState: () => {},
    });
    port = await server.listen();
  });

  t.afterEach(async () => {
    if (bridge) bridge.reset();
    if (server) await server.close();
  });

  async function postJson(path, data) {
    const body = JSON.stringify(data);
    return new Promise((resolve, reject) => {
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port,
          path,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(body),
          },
        },
        (res) => {
          let chunks = [];
          res.on('data', (c) => chunks.push(c));
          res.on('end', () => {
            try {
              resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
            } catch (e) {
              resolve({ raw: Buffer.concat(chunks).toString('utf8') });
            }
          });
        }
      );
      req.on('error', reject);
      req.write(body);
      req.end();
    });
  }

  async function getJson(path) {
    return new Promise((resolve, reject) => {
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port,
          path,
          method: 'GET',
        },
        (res) => {
          let chunks = [];
          res.on('data', (c) => chunks.push(c));
          res.on('end', () => {
            try {
              resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
            } catch (e) {
              resolve({ raw: Buffer.concat(chunks).toString('utf8') });
            }
          });
        }
      );
      req.on('error', reject);
      req.end();
    });
  }

  // --- Scenario 1: YouTube Music already open and paused ---
  await t.test('Scenario 1: YouTube Music open & paused -> companion plays exact track and confirms audio', async () => {
    // Companion reports open tab with paused track
    const pingRes = await postJson('/companion/ping', {
      isYtMusic: true,
      url: 'https://music.youtube.com/watch?v=dQw4w9WgXcQ',
      currentTrack: { videoId: 'dQw4w9WgXcQ', title: 'Never Gonna Give You Up', artist: 'Rick Astley' },
      status: 'paused',
    });
    assert.equal(pingRes.ok, true);
    assert.equal(bridge.isConnected(), true);

    // Island dispatches play_track
    const dispatchPromise = bridge.dispatchCommand({
      action: 'play_track',
      videoId: 'dQw4w9WgXcQ',
      title: 'Never Gonna Give You Up',
    });

    // Companion pulls command
    const pullRes = await getJson('/companion/command');
    assert.equal(pullRes.ok, true);
    assert.ok(pullRes.command);
    assert.equal(pullRes.command.videoId, 'dQw4w9WgXcQ');

    // Companion executes video.play() and acks 'playing'
    const ackRes = await postJson('/companion/ack', {
      commandId: pullRes.command.id,
      status: 'playing',
    });
    assert.equal(ackRes.ok, true);

    const outcome = await dispatchPromise;
    assert.equal(outcome.status, 'confirmed_playing');
    assert.equal(bridge.getStatus().playbackState, 'confirmed_playing');
  });

  // --- Scenario 2: YouTube Music open with different track playing ---
  await t.test('Scenario 2: YouTube Music open playing song A -> user asks for song B -> navigates & confirms audio', async () => {
    // Currently playing Song A
    await postJson('/companion/ping', {
      isYtMusic: true,
      url: 'https://music.youtube.com/watch?v=songA123456',
      currentTrack: { videoId: 'songA123456', title: 'Song A', artist: 'Artist A' },
      status: 'playing',
    });

    // Island requests Song B
    const dispatchPromise = bridge.dispatchCommand({
      action: 'play_track',
      videoId: 'songB789012',
      title: 'Attention',
    });

    // Companion pulls command and acknowledges navigation
    const pullRes = await getJson('/companion/command');
    assert.equal(pullRes.command.videoId, 'songB789012');

    await postJson('/companion/ack', {
      commandId: pullRes.command.id,
      status: 'navigated',
    });

    const ackOutcome = await dispatchPromise;
    assert.equal(ackOutcome.status, 'navigated');

    // Once SPA loads and starts producing audio, companion sends state update 'playing'
    await postJson('/companion/state', {
      event: 'playing',
      videoId: 'songB789012',
      title: 'Attention',
      artist: 'Charlie Puth',
      currentTime: 1.5,
    });

    const status = bridge.getStatus();
    assert.equal(status.playbackState, 'confirmed_playing');
    assert.equal(status.currentTrack.videoId, 'songB789012');
  });

  // --- Scenario 3: Browser running but no YouTube Music tab ---
  await t.test('Scenario 3: Companion connected on other tab (no YT Music) -> opens exact track URL', async () => {
    // Companion connected on regular page
    await postJson('/companion/ping', {
      isYtMusic: false,
      url: 'https://example.com',
      status: 'idle',
    });

    const status = bridge.getStatus();
    assert.equal(status.connected, true);
    assert.equal(status.isYtMusicActive, false);

    // Island detects YT Music is not active, launches URL via onOpenUrl
    let openedUrl = null;
    const track = {
      title: 'Attention',
      artist: 'Charlie Puth',
      provider: SUPPORTED_PROVIDERS.YOUTUBE,
      youtubeId: 'nfs8NYg7yQM',
      playableUrl: 'https://music.youtube.com/watch?v=nfs8NYg7yQM',
    };

    const res = handlePlaybackExecution(track, {
      action: 'play_favorite',
      media: { active: false },
      onOpenUrl: (url) => { openedUrl = url; },
    });

    assert.equal(res.status, 'opened_provider');
    assert.equal(openedUrl, 'https://music.youtube.com/watch?v=nfs8NYg7yQM');
    assert.match(res.spokenConfirmation, /Opening Attention in YouTube Music/i);
  });

  // --- Scenario 4: Browser completely closed ---
  await t.test('Scenario 4: Companion completely disconnected -> opens provider URL gracefully without hanging', async () => {
    // Bridge has had no pings
    assert.equal(bridge.isConnected(), false);
    assert.equal(bridge.getStatus().connected, false);

    let openedUrl = null;
    const track = {
      title: 'Pashmina',
      artist: 'Amit Trivedi',
      provider: SUPPORTED_PROVIDERS.YOUTUBE,
      youtubeId: 'xyz123abc45',
      playableUrl: 'https://music.youtube.com/watch?v=xyz123abc45',
    };

    const res = handlePlaybackExecution(track, {
      action: 'play_favorite',
      media: { active: false },
      onOpenUrl: (url) => { openedUrl = url; },
    });

    assert.equal(res.ok, true);
    assert.equal(res.status, 'opened_provider');
    assert.equal(openedUrl, 'https://music.youtube.com/watch?v=xyz123abc45');
    // Does NOT falsely claim "Playing"
    assert.ok(!res.spokenConfirmation.startsWith('Playing'));
  });

  // --- Scenario 5: Saved favorite has an exact YouTube video ID ---
  await t.test('Scenario 5: Exact YouTube video ID builds exact watch URL without search fuzziness', async () => {
    const url = buildPlayableReference('Attention', 'Charlie Puth', SUPPORTED_PROVIDERS.YOUTUBE, {
      youtubeId: 'nfs8NYg7yQM',
    });
    assert.equal(url, 'https://music.youtube.com/watch?v=nfs8NYg7yQM');
  });

  // --- Scenario 6: Favorite only has title and artist ---
  await t.test('Scenario 6: Missing video ID cleanly builds search URL and announces search without pretending exact play', async () => {
    const url = buildPlayableReference('Rare Indie Track', 'Unknown Artist', SUPPORTED_PROVIDERS.YOUTUBE, {});
    assert.equal(url, 'https://music.youtube.com/search?q=Rare%20Indie%20Track%20Unknown%20Artist');
  });

  // --- Scenario 7: Browser blocks autoplay ---
  await t.test('Scenario 7: Browser blocks autoplay -> companion reports autoplay_blocked truthfully -> Island guides user to click Play once', async () => {
    await postJson('/companion/ping', {
      isYtMusic: true,
      url: 'https://music.youtube.com/watch?v=dQw4w9WgXcQ',
      status: 'idle',
    });

    const dispatchPromise = bridge.dispatchCommand({
      action: 'play_track',
      videoId: 'dQw4w9WgXcQ',
    });

    const pullRes = await getJson('/companion/command');
    // Companion catches NotAllowedError on video.play() and acks autoplay_blocked
    await postJson('/companion/ack', {
      commandId: pullRes.command.id,
      status: 'autoplay_blocked',
      error: 'Autoplay blocked by browser policy',
    });

    const outcome = await dispatchPromise;
    assert.equal(outcome.status, 'autoplay_blocked');
    assert.equal(bridge.getStatus().playbackState, 'autoplay_blocked');

    // When user subsequently clicks player, video plays and companion posts 'playing'
    await postJson('/companion/state', {
      event: 'playing',
      videoId: 'dQw4w9WgXcQ',
      currentTime: 0.1,
    });
    assert.equal(bridge.getStatus().playbackState, 'confirmed_playing');
  });

  // --- Scenario 8: User is not signed in / track restricted ---
  await t.test('Scenario 8: Track restricted or sign-in wall -> companion reports failed with reason', async () => {
    await postJson('/companion/ping', {
      isYtMusic: true,
      url: 'https://music.youtube.com/watch?v=restricted12',
      status: 'idle',
    });

    const dispatchPromise = bridge.dispatchCommand({
      action: 'play_track',
      videoId: 'restricted12',
    });

    // Attach catch handler early so Node doesn't trigger unhandledRejection
    const rejectionExpectation = assert.rejects(dispatchPromise, /Sign in required/);

    const pullRes = await getJson('/companion/command');
    // Companion acks failure due to sign-in or region restriction
    await postJson('/companion/ack', {
      commandId: pullRes.command.id,
      status: 'failed',
      error: 'Sign in required to view this content',
    });

    await rejectionExpectation;
    assert.equal(bridge.getStatus().playbackState, 'failed');
  });

  // --- Scenario 9: Manual/Voice Parity ---
  await t.test('Scenario 9: Manual UI clicks and voice commands share the exact same playback dispatcher', async () => {
    const { interpretLocalMusicCommand } = require('../src/lib/music-command-interpreter');
    const mockStorage = {
      getItem(key) {
        if (key === 'island_favorites_v2') {
          return JSON.stringify([
            {
              id: 'youtube:Attention__Charlie Puth',
              title: 'Attention',
              artist: 'Charlie Puth',
              provider: SUPPORTED_PROVIDERS.YOUTUBE,
              youtubeId: 'nfs8NYg7yQM',
              playableUrl: 'https://music.youtube.com/watch?v=nfs8NYg7yQM',
            },
          ]);
        }
        return null;
      },
      setItem() {},
    };

    let manualDispatchedCmd = null;
    let voiceDispatchedCmd = null;

    const favoriteTrack = {
      id: 'youtube:Attention__Charlie Puth',
      title: 'Attention',
      artist: 'Charlie Puth',
      provider: SUPPORTED_PROVIDERS.YOUTUBE,
      youtubeId: 'nfs8NYg7yQM',
      playableUrl: 'https://music.youtube.com/watch?v=nfs8NYg7yQM',
    };

    // 1. Manual click via playFavoriteTrack
    const manualRes = playFavoriteTrack(favoriteTrack, {
      media: { active: false },
      companion: { connected: true, isYtMusicActive: true },
      onDispatchCompanion: (cmd) => { manualDispatchedCmd = cmd; },
    });

    // 2. Voice command via interpretLocalMusicCommand
    const voiceRes = interpretLocalMusicCommand('play Attention', {
      media: { active: false },
      customStorage: mockStorage,
      companion: { connected: true, isYtMusicActive: true },
      onDispatchCompanion: (cmd) => { voiceDispatchedCmd = cmd; },
    });

    assert.equal(manualRes.status, 'playback_requested');
    assert.equal(manualRes.playbackState, 'playback_requested');
    assert.equal(manualRes.track.videoId, 'nfs8NYg7yQM');

    assert.equal(voiceRes.handledLocally, true);
    assert.equal(voiceRes.actionResult.status, 'playback_requested');
    assert.equal(voiceRes.actionResult.playbackState, 'playback_requested');
    assert.equal(voiceRes.actionResult.track.videoId, 'nfs8NYg7yQM');

    assert.deepEqual(manualDispatchedCmd, voiceDispatchedCmd);
    assert.equal(manualDispatchedCmd.videoId, 'nfs8NYg7yQM');
    assert.equal(manualDispatchedCmd.action, 'play_track');
  });

  // --- Scenario 10: Disconnected companion fallback ---
  await t.test('Scenario 10: Disconnected companion gracefully falls back to opening provider URL without hanging', async () => {
    let openedUrl = null;
    let dispatchedCmd = null;

    const favoriteTrack = {
      id: 'youtube:Attention__Charlie Puth',
      title: 'Attention',
      artist: 'Charlie Puth',
      provider: SUPPORTED_PROVIDERS.YOUTUBE,
      youtubeId: 'nfs8NYg7yQM',
    };

    const res = playFavoriteTrack(favoriteTrack, {
      media: { active: false },
      companion: { connected: false, isYtMusicActive: false },
      onOpenUrl: (url) => { openedUrl = url; },
      onDispatchCompanion: (cmd) => { dispatchedCmd = cmd; },
    });

    assert.equal(res.status, 'opened_provider');
    assert.equal(res.playbackState, 'opening_provider');
    assert.equal(openedUrl, 'https://music.youtube.com/watch?v=nfs8NYg7yQM');
    assert.equal(dispatchedCmd, null);
    assert.match(res.spokenConfirmation, /Opening Attention in YouTube Music/i);
  });

  // --- Scenario 11: Saving active song while playing captures exact video ID ---
  await t.test('Scenario 11: Saving active song while playing correlates with companion and captures exact video ID', () => {
    const { addFavorite, getAllFavorites } = require('../src/lib/favorites');
    const store = new Map();
    const mockStorage = {
      getItem: (k) => store.get(k) || null,
      setItem: (k, v) => store.set(k, String(v)),
    };

    // SMTC only has title and artist (Windows limitation)
    const smtcMedia = {
      active: true,
      title: 'Attention',
      artist: 'Charlie Puth',
      app: 'Google Chrome',
    };

    // Connected companion on YouTube Music has exact videoId
    const companionState = {
      connected: true,
      isYtMusicActive: true,
      currentTrack: {
        videoId: 'nfs8NYg7yQM',
        title: 'Attention',
        artist: 'Charlie Puth',
      },
    };

    const saved = addFavorite(smtcMedia, mockStorage, companionState);
    assert.ok(saved);
    assert.equal(saved.provider, 'youtube');
    assert.equal(saved.youtubeId, 'nfs8NYg7yQM');
    assert.equal(saved.providerTrackId, 'nfs8NYg7yQM');
    assert.equal(saved.playableUrl, 'https://music.youtube.com/watch?v=nfs8NYg7yQM');
    assert.equal(saved.isUnresolvedIdentity, false);

    // Verify stored list in mockStorage
    const all = getAllFavorites(mockStorage);
    assert.equal(all.length, 1);
    assert.equal(all[0].youtubeId, 'nfs8NYg7yQM');
  });

  // --- Scenario 12: Reusing existing tab when switching songs ---
  await t.test('Scenario 12: Reusing existing YouTube Music tab dispatches to companion without opening new tab', () => {
    let openedUrl = null;
    let dispatchedCmd = null;

    const savedFavorite = {
      id: 'youtube:Attention__Charlie Puth',
      title: 'Attention',
      artist: 'Charlie Puth',
      provider: 'youtube',
      youtubeId: 'nfs8NYg7yQM',
      playableUrl: 'https://music.youtube.com/watch?v=nfs8NYg7yQM',
    };

    const res = playFavoriteTrack(savedFavorite, {
      media: { active: true, title: 'Some Other Song' },
      companion: { connected: true, isYtMusicActive: true },
      onOpenUrl: (url) => { openedUrl = url; },
      onDispatchCompanion: (cmd) => { dispatchedCmd = cmd; },
    });

    // Exactly dispatches play_track to companion on existing tab
    assert.equal(res.status, 'playback_requested');
    assert.equal(dispatchedCmd?.action, 'play_track');
    assert.equal(dispatchedCmd?.videoId, 'nfs8NYg7yQM');
    // Does NOT call onOpenUrl (which would open a new tab!)
    assert.equal(openedUrl, null);
  });

  // --- Scenario 13: Unresolved favorite reuses existing tab ---
  await t.test('Scenario 13: Unresolved favorite dispatches search to existing tab without spawning new tab', () => {
    let openedUrl = null;
    let dispatchedCmd = null;

    const unresolvedFavorite = {
      id: 'youtube:Rare Track__Unknown',
      title: 'Rare Track',
      artist: 'Unknown',
      provider: 'youtube',
      isUnresolvedIdentity: true,
      playableUrl: 'https://music.youtube.com/search?q=Rare%20Track',
    };

    const res = playFavoriteTrack(unresolvedFavorite, {
      media: { active: false },
      companion: { connected: true, isYtMusicActive: true },
      onOpenUrl: (url) => { openedUrl = url; },
      onDispatchCompanion: (cmd) => { dispatchedCmd = cmd; },
    });

    assert.equal(res.status, 'opened_provider');
    // Dispatches to companion to search on existing tab!
    assert.ok(dispatchedCmd);
    assert.match(dispatchedCmd.url, /music\.youtube\.com\/search/);
    // Never calls onOpenUrl to spawn a duplicate tab!
    assert.equal(openedUrl, null);
  });

  // --- Scenario 14: Auto-healing on confirmed playback ---
  await t.test('Scenario 14: healFavoriteWithExactId updates unresolved favorite with exact video ID', () => {
    const { addFavorite, getAllFavorites, healFavoriteWithExactId } = require('../src/lib/favorites');
    const store = new Map();
    const mockStorage = {
      getItem: (k) => store.get(k) || null,
      setItem: (k, v) => store.set(k, String(v)),
    };

    // Initially saved without video ID (legacy or offline)
    addFavorite({ title: 'Attention', artist: 'Charlie Puth', provider: 'youtube' }, mockStorage, null);
    const initial = getAllFavorites(mockStorage);
    assert.equal(initial[0].youtubeId, null);
    assert.equal(initial[0].isUnresolvedIdentity, true);

    // Player begins playing Attention with confirmed video ID -> heals record
    const healed = healFavoriteWithExactId('Attention', 'nfs8NYg7yQM', mockStorage);
    assert.ok(healed);
    assert.equal(healed.youtubeId, 'nfs8NYg7yQM');
    assert.equal(healed.playableUrl, 'https://music.youtube.com/watch?v=nfs8NYg7yQM');
    assert.equal(healed.isUnresolvedIdentity, false);

    // Storage is updated permanently
    const after = getAllFavorites(mockStorage);
    assert.equal(after[0].youtubeId, 'nfs8NYg7yQM');
    assert.equal(after[0].isUnresolvedIdentity, false);
  });

  // --- Scenario 15: Diagnostics endpoint and Private Network Access CORS ---
  await t.test('Scenario 15: Diagnostics endpoint returns server and bridge health with Private Network Access headers', async () => {
    // OPTIONS preflight check
    const optionsRes = await new Promise((resolve, reject) => {
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port,
          path: '/companion/ping',
          method: 'OPTIONS',
          headers: {
            Origin: 'chrome-extension://abcdefghijklmno',
            'Access-Control-Request-Method': 'POST',
            'Access-Control-Request-Headers': 'Content-Type, X-Island-Client',
          },
        },
        (res) => {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
          });
        }
      );
      req.on('error', reject);
      req.end();
    });

    assert.equal(optionsRes.statusCode, 204);
    assert.equal(optionsRes.headers['access-control-allow-private-network'], 'true');
    assert.equal(optionsRes.headers['access-control-allow-origin'], 'chrome-extension://abcdefghijklmno');

    // Service worker ping with multi-tab metadata
    const pingRes = await postJson('/companion/ping', {
      source: 'service_worker',
      version: '1.2.0',
      isYtMusic: true,
      tabsCount: 2,
      status: 'paused',
      currentTrack: { videoId: 'nfs8NYg7yQM', title: 'Attention', artist: 'Charlie Puth' },
    });
    assert.equal(pingRes.ok, true);
    assert.equal(pingRes.diagnostics.connectionState, 'connected');
    assert.equal(pingRes.diagnostics.tabsCount, 2);

    // Diagnostics endpoint check
    const diag = await getJson('/companion/diagnostics');
    assert.equal(diag.ok, true);
    assert.equal(diag.serverListening, true);
    assert.equal(diag.status.connected, true);
    assert.equal(diag.status.tabsCount, 2);
    assert.equal(diag.diagnostics.connectionState, 'connected');
  });

  // --- Scenario 16: Multi-tab isolation and primary tab tracking ---
  await t.test('Scenario 16: Companion bridge tracks tabsCount and isolates command dispatch', async () => {
    // Ping with 3 tabs open
    await postJson('/companion/ping', {
      source: 'service_worker',
      isYtMusic: true,
      tabsCount: 3,
      currentTrack: { videoId: 'nfs8NYg7yQM', title: 'Attention' },
    });

    const status = bridge.getStatus();
    assert.equal(status.tabsCount, 3);
    assert.equal(status.isYtMusicActive, true);

    // Dispatch command
    const dispatchPromise = bridge.dispatchCommand({
      action: 'play_track',
      videoId: 'nfs8NYg7yQM',
      title: 'Attention',
    });

    // Verify command pulled exactly once
    const cmd1 = await getJson('/companion/command');
    assert.equal(cmd1.command?.videoId, 'nfs8NYg7yQM');

    // Second pull returns null (ensuring duplicate tabs do not consume command)
    const cmd2 = await getJson('/companion/command');
    assert.equal(cmd2.command, null);

    // Ack from primary tab
    await postJson('/companion/ack', {
      commandId: cmd1.command.id,
      status: 'confirmed_playing',
      videoId: 'nfs8NYg7yQM',
    });

    const result = await dispatchPromise;
    assert.equal(result.status, 'confirmed_playing');
  });

  // --- Scenario 17: Confirmed playback vs mere navigation ---
  await t.test('Scenario 17: Bridge distinguishes confirmed_playing from mere navigation and autoplay_blocked', async () => {
    // Ensure companion is connected
    await postJson('/companion/ping', { isYtMusic: true, status: 'paused' });

    // 1. Navigation ack does not claim playing
    const cmdNavPromise = bridge.dispatchCommand({ action: 'play_track', title: 'Unknown' });
    const pulledNav = await getJson('/companion/command');
    await postJson('/companion/ack', { commandId: pulledNav.command.id, status: 'navigated' });
    const navResult = await cmdNavPromise;
    assert.equal(navResult.status, 'navigated');
    assert.equal(bridge.getStatus().playbackState, 'waiting_for_player');

    // 2. Autoplay blocked ack reports autoplay_blocked truthfully
    const cmdBlockPromise = bridge.dispatchCommand({ action: 'play_track', videoId: 'abc12345678' });
    const pulledBlock = await getJson('/companion/command');
    await postJson('/companion/ack', {
      commandId: pulledBlock.command.id,
      status: 'autoplay_blocked',
      error: 'Autoplay blocked by browser policy',
    });
    const blockResult = await cmdBlockPromise;
    assert.equal(blockResult.status, 'autoplay_blocked');
    assert.equal(bridge.getStatus().playbackState, 'autoplay_blocked');
  });

  // --- Scenario 18: Service worker dormancy & reconnection resilience ---
  await t.test('Scenario 18: Bridge gracefully handles service-worker restart and reconnects seamlessly', async () => {
    // Initial active connection
    await postJson('/companion/ping', { isYtMusic: true, status: 'playing' });
    assert.equal(bridge.isConnected(), true);

    // Simulate inactivity past ping expiry (3000ms configured in test)
    bridge.lastPingTimestamp = Date.now() - 3500;
    assert.equal(bridge.isConnected(), false);
    assert.equal(bridge.getDiagnostics().connectionState, 'disconnected');

    // New heartbeat arrives when service worker wakes up
    await postJson('/companion/ping', { isYtMusic: true, status: 'playing' });
    assert.equal(bridge.isConnected(), true);
    assert.equal(bridge.getDiagnostics().connectionState, 'connected');
  });

  // --- Scenario 19: Rapid commands superseding & deduplication ---
  await t.test('Scenario 19: Five rapid commands safely supersede older commands without timeouts or crashes', async () => {
    await postJson('/companion/ping', { isYtMusic: true, status: 'playing' });

    // User rapidly clicks 5 different tracks
    const p1 = bridge.dispatchCommand({ action: 'play_track', videoId: 'vid1', title: 'Track 1' });
    const p2 = bridge.dispatchCommand({ action: 'play_track', videoId: 'vid2', title: 'Track 2' });
    const p3 = bridge.dispatchCommand({ action: 'play_track', videoId: 'vid3', title: 'Track 3' });
    const p4 = bridge.dispatchCommand({ action: 'play_track', videoId: 'vid4', title: 'Track 4' });
    const p5 = bridge.dispatchCommand({ action: 'play_track', videoId: 'vid5', title: 'Track 5' });

    // First 4 must resolve as superseded
    const [r1, r2, r3, r4] = await Promise.all([p1, p2, p3, p4]);
    assert.equal(r1.status, 'superseded');
    assert.equal(r2.status, 'superseded');
    assert.equal(r3.status, 'superseded');
    assert.equal(r4.status, 'superseded');

    // Only 5th command is pending
    const pull = await getJson('/companion/command');
    assert.equal(pull.command?.videoId, 'vid5');

    // Ack 5th command
    await postJson('/companion/ack', {
      commandId: pull.command.id,
      status: 'confirmed_playing',
      videoId: 'vid5',
    });

    const r5 = await p5;
    assert.equal(r5.status, 'confirmed_playing');
    assert.equal(bridge.getStatus().currentTrack?.videoId, 'vid5');
  });

  // --- Scenario 20: Late acknowledgment from superseded command is safely ignored ---
  await t.test('Scenario 20: Late ack from superseded command cannot overwrite active track', async () => {
    await postJson('/companion/ping', { isYtMusic: true, status: 'playing' });

    const pOld = bridge.dispatchCommand({ action: 'play_track', videoId: 'oldVid', title: 'Old Song' });
    const pullOld = await getJson('/companion/command');

    // User switches to new song before old song finishes
    const pNew = bridge.dispatchCommand({ action: 'play_track', videoId: 'newVid', title: 'New Song' });
    const pullNew = await getJson('/companion/command');

    // Acknowledge new song
    await postJson('/companion/ack', {
      commandId: pullNew.command.id,
      status: 'confirmed_playing',
      videoId: 'newVid',
      title: 'New Song',
    });
    await pNew;
    assert.equal(bridge.getStatus().currentTrack?.videoId, 'newVid');

    // Late ack arrives for old song
    const lateAckRes = await postJson('/companion/ack', {
      commandId: pullOld.command.id,
      status: 'confirmed_playing',
      videoId: 'oldVid',
      title: 'Old Song',
    });
    assert.equal(lateAckRes.ok, false);
    assert.equal(lateAckRes.status, 'ignored');

    // Current track remains the new song!
    assert.equal(bridge.getStatus().currentTrack?.videoId, 'newVid');
  });

  // --- Scenario 21: "Die For You" favorite identity repair with title noise stripping ---
  await t.test('Scenario 21: Die For You legacy unresolved favorite is healed by confirmed playback of official video', () => {
    const { addFavorite, getAllFavorites, healFavoriteWithExactId } = require('../src/lib/favorites');
    const store = new Map();
    const mockStorage = {
      getItem: (k) => store.get(k) || null,
      setItem: (k, v) => store.set(k, String(v)),
    };

    // Stored as legacy favorite without videoId (reproducing Bug D)
    addFavorite({
      title: 'Die For You',
      artist: 'The Weeknd',
      provider: 'youtube',
    }, mockStorage, null);

    const initial = getAllFavorites(mockStorage);
    assert.equal(initial[0].title, 'Die For You');
    assert.equal(initial[0].youtubeId, null);
    assert.equal(initial[0].isUnresolvedIdentity, true);
    assert.match(initial[0].playableUrl, /search\?q=Die/);

    // User searches and plays official video on YouTube Music: "The Weeknd - Die For You (Official Music Video)"
    const healed = healFavoriteWithExactId(
      'The Weeknd - Die For You (Official Music Video)',
      'u9n7Ey24L3x',
      mockStorage
    );

    assert.ok(healed);
    assert.equal(healed.youtubeId, 'u9n7Ey24L3x');
    assert.equal(healed.playableUrl, 'https://music.youtube.com/watch?v=u9n7Ey24L3x');
    assert.equal(healed.isUnresolvedIdentity, false);

    // Persisted in storage permanently
    const after = getAllFavorites(mockStorage);
    assert.equal(after[0].youtubeId, 'u9n7Ey24L3x');
    assert.equal(after[0].isUnresolvedIdentity, false);
  });

  // --- Scenario 22: Track synchronization from How Long to Pashmina ---
  await t.test('Scenario 22: State update directly updates track state without lagging SMTC conflict', async () => {
    await postJson('/companion/ping', {
      isYtMusic: true,
      status: 'playing',
      currentTrack: { videoId: 'howLongVid', title: 'How Long', artist: 'Charlie Puth' },
    });
    assert.equal(bridge.getStatus().currentTrack?.title, 'How Long');

    // Pashmina starts playing on YouTube Music
    await postJson('/companion/state', {
      event: 'playing',
      status: 'playing',
      videoId: 'pashminaVid',
      title: 'Pashmina',
      artist: 'Amit Trivedi',
    });

    const status = bridge.getStatus();
    assert.equal(status.currentTrack?.videoId, 'pashminaVid');
    assert.equal(status.currentTrack?.title, 'Pashmina');
    assert.equal(status.playbackState, 'confirmed_playing');
  });
});
