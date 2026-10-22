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
});
