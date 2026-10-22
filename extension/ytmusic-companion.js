// Dynamic Island Companion - YouTube Music Playback & State Controller
// Event-driven, low-overhead Manifest V3 companion for https://music.youtube.com/*
(function () {
  'use strict';
  console.log('[Dynamic Island] YouTube Music companion initialized');

  const ISLAND_ENDPOINT = 'http://127.0.0.1:47823';
  let activeVideoElement = null;
  let pollTimer = null;
  let isAutoplayBlocked = false;
  let lastReportedState = null;

  function getVideoId() {
    try {
      const url = new URL(window.location.href);
      return url.searchParams.get('v') || null;
    } catch {
      return null;
    }
  }

  function getTrackInfo() {
    const videoId = getVideoId();
    const titleEl = document.querySelector('ytmusic-player-bar .title');
    const artistEl = document.querySelector('ytmusic-player-bar .byline');

    const title = titleEl ? titleEl.textContent.trim() : document.title.replace(/ - YouTube Music$/i, '').trim();
    const artist = artistEl ? artistEl.textContent.trim() : '';

    return {
      videoId,
      title,
      artist,
    };
  }

  function getPlaybackStatus() {
    if (!activeVideoElement) {
      activeVideoElement = document.querySelector('video');
    }
    if (!activeVideoElement) return 'no_player';
    if (isAutoplayBlocked) return 'autoplay_blocked';
    if (activeVideoElement.ended) return 'ended';
    if (activeVideoElement.paused) return 'paused';
    return 'playing';
  }

  async function postJson(endpoint, data) {
    try {
      const res = await fetch(`${ISLAND_ENDPOINT}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
        mode: 'cors',
      });
      return await res.json();
    } catch {
      return null;
    }
  }

  async function fetchJson(endpoint) {
    try {
      const res = await fetch(`${ISLAND_ENDPOINT}${endpoint}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        mode: 'cors',
      });
      return await res.json();
    } catch {
      return null;
    }
  }

  async function sendHeartbeat() {
    const info = getTrackInfo();
    const status = getPlaybackStatus();

    await postJson('/companion/ping', {
      isYtMusic: true,
      url: window.location.href,
      currentTrack: info.videoId ? { ...info, duration: activeVideoElement ? activeVideoElement.duration : 0 } : null,
      status,
    });
  }

  async function reportState(eventName, extra = {}) {
    const info = getTrackInfo();
    const video = activeVideoElement || document.querySelector('video');
    const status = isAutoplayBlocked ? 'autoplay_blocked' : (video && !video.paused ? 'playing' : 'paused');

    lastReportedState = eventName;
    await postJson('/companion/state', {
      event: eventName,
      status,
      videoId: info.videoId,
      title: info.title,
      artist: info.artist,
      currentTime: video ? video.currentTime : 0,
      duration: video ? video.duration : 0,
      ...extra,
    });
  }

  async function ackCommand(commandId, status, extra = {}) {
    await postJson('/companion/ack', {
      commandId,
      status,
      ...extra,
    });
  }

  // Hook HTMLMediaElement events on the video player
  function hookVideoEvents(video) {
    if (!video || video.__islandHooked) return;
    video.__islandHooked = true;
    activeVideoElement = video;

    video.addEventListener('playing', () => {
      isAutoplayBlocked = false;
      reportState('playing');
    });

    video.addEventListener('pause', () => {
      if (!isAutoplayBlocked) {
        reportState('paused');
      }
    });

    video.addEventListener('ended', () => {
      reportState('ended');
    });

    video.addEventListener('error', (err) => {
      reportState('failed', { error: 'Media element error' });
    });
  }

  // Handle commands arriving from Island
  async function handleCommand(cmd) {
    if (!cmd || !cmd.action) return;
    console.log('[Dynamic Island] Received companion command:', cmd);

    const video = activeVideoElement || document.querySelector('video');
    const currentVideoId = getVideoId();

    switch (cmd.action) {
      case 'play_track': {
        const targetVideoId = cmd.videoId;

        // Case A: exact track is already active on this tab
        if (targetVideoId && currentVideoId === targetVideoId) {
          if (video) {
            try {
              const playPromise = video.play();
              if (playPromise !== undefined) {
                await playPromise;
              }
              isAutoplayBlocked = false;
              await ackCommand(cmd.id, 'playing');
              reportState('playing');
            } catch (err) {
              if (err.name === 'NotAllowedError') {
                isAutoplayBlocked = true;
                await ackCommand(cmd.id, 'autoplay_blocked', { error: 'Autoplay blocked by browser policy' });
                reportState('autoplay_blocked');
              } else {
                await ackCommand(cmd.id, 'failed', { error: err.message });
              }
            }
          } else {
            await ackCommand(cmd.id, 'failed', { error: 'No video element' });
          }
          return;
        }

        // Case B: different track requested -> navigate to track
        if (targetVideoId) {
          const targetUrl = `/watch?v=${targetVideoId}`;
          await ackCommand(cmd.id, 'navigated', { targetUrl });

          // YouTube Music SPA navigation
          if (window.location.pathname === '/watch' && window.location.search.includes(`v=${targetVideoId}`)) {
            // Already there, just attempt play
            if (video) {
              try {
                await video.play();
                isAutoplayBlocked = false;
                reportState('playing');
              } catch (err) {
                if (err.name === 'NotAllowedError') {
                  isAutoplayBlocked = true;
                  reportState('autoplay_blocked');
                }
              }
            }
          } else {
            window.location.href = targetUrl;
          }
          return;
        }

        // Case C: No videoId, fallback URL or query
        if (cmd.url) {
          await ackCommand(cmd.id, 'navigated', { targetUrl: cmd.url });
          window.location.href = cmd.url;
          return;
        }

        await ackCommand(cmd.id, 'failed', { error: 'Missing track videoId or URL' });
        break;
      }

      case 'resume': {
        if (video) {
          try {
            await video.play();
            isAutoplayBlocked = false;
            await ackCommand(cmd.id, 'playing');
            reportState('playing');
          } catch (err) {
            if (err.name === 'NotAllowedError') {
              isAutoplayBlocked = true;
              await ackCommand(cmd.id, 'autoplay_blocked');
              reportState('autoplay_blocked');
            } else {
              await ackCommand(cmd.id, 'failed', { error: err.message });
            }
          }
        }
        break;
      }

      case 'pause': {
        if (video) {
          video.pause();
          await ackCommand(cmd.id, 'paused');
          reportState('paused');
        }
        break;
      }

      default:
        await ackCommand(cmd.id, 'failed', { error: 'Unknown action' });
    }
  }

  // Periodic command polling loop (every 1.5s)
  async function pollCommands() {
    const video = document.querySelector('video');
    if (video) hookVideoEvents(video);

    const resp = await fetchJson('/companion/command');
    if (resp && resp.ok && resp.command) {
      await handleCommand(resp.command);
    }
  }

  // Listen for user click anywhere on page to recover from autoplay block
  document.addEventListener('click', () => {
    if (isAutoplayBlocked) {
      setTimeout(() => {
        const video = activeVideoElement || document.querySelector('video');
        if (video && !video.paused) {
          isAutoplayBlocked = false;
          reportState('playing');
        }
      }, 200);
    }
  }, { capture: true, passive: true });

  // YouTube Music SPA navigation finished event
  window.addEventListener('yt-navigate-finish', () => {
    isAutoplayBlocked = false;
    setTimeout(() => {
      const video = document.querySelector('video');
      if (video) hookVideoEvents(video);
      reportState('trackchange');
      sendHeartbeat();
    }, 500);
  });

  // Attach to existing video element if ready
  const initialVideo = document.querySelector('video');
  if (initialVideo) hookVideoEvents(initialVideo);

  // Initial heartbeat and command loop
  sendHeartbeat();
  pollTimer = setInterval(pollCommands, 1500);
  setInterval(sendHeartbeat, 6000);
})();
