// Dynamic Island Companion - YouTube Music Playback & State Controller
// Manifest V3 Content Script for https://music.youtube.com/*
// Communicates with background service worker via chrome.runtime messaging (NO direct localhost fetch)
(function () {
  'use strict';
  console.log('[Dynamic Island] YouTube Music companion content script active');

  let activeVideoElement = null;
  let heartbeatTimer = null;
  let isAutoplayBlocked = false;
  let lastReportedState = null;
  let isBridgeConnected = false;
  let pageBridgeVideoData = null;

  // ----------------------------------------------------------------- Page Bridge Handshake
  function setupPageBridge() {
    window.addEventListener('message', (event) => {
      if (event.source !== window || !event.data || event.data.source !== 'ISLAND_PAGE_BRIDGE') {
        return;
      }

      isBridgeConnected = true;

      if (event.data.videoData) {
        pageBridgeVideoData = event.data.videoData;
      }
    });

    // Ping page bridge
    window.postMessage({ source: 'ISLAND_CONTENT_SCRIPT', action: 'PING_BRIDGE' }, '*');

    // Fallback injection if MAIN world content script is not yet injected
    setTimeout(() => {
      if (!isBridgeConnected) {
        try {
          const script = document.createElement('script');
          script.src = chrome.runtime.getURL('ytmusic-player-bridge.js');
          (document.head || document.documentElement).appendChild(script);
          script.onload = () => script.remove();
        } catch {}
      }
    }, 500);
  }

  setupPageBridge();

  // ----------------------------------------------------------------- Video & Track Identification
  function getVideoId() {
    try {
      // 1. From Page Bridge if available
      if (pageBridgeVideoData?.videoId && /^[a-zA-Z0-9_-]{11}$/.test(pageBridgeVideoData.videoId)) {
        return pageBridgeVideoData.videoId;
      }

      // 2. URL search param ?v=
      const url = new URL(window.location.href);
      const urlId = url.searchParams.get('v');
      if (urlId && /^[a-zA-Z0-9_-]{11}$/.test(urlId)) return urlId;

      // 3. Player bar watch anchor
      const barLink = document.querySelector('ytmusic-player-bar a[href*="watch?v="]');
      if (barLink && barLink.href) {
        const match = barLink.href.match(/watch\?v=([a-zA-Z0-9_-]{11})/);
        if (match) return match[1];
      }

      // 4. Meta tag og:url
      const ogUrl = document.querySelector('meta[property="og:url"]')?.content;
      if (ogUrl) {
        const match = ogUrl.match(/watch\?v=([a-zA-Z0-9_-]{11})/);
        if (match) return match[1];
      }
    } catch {}
    return null;
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

  // ----------------------------------------------------------------- Service Worker Messaging
  function sendHeartbeat() {
    const info = getTrackInfo();
    const status = getPlaybackStatus();

    try {
      if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
        chrome.runtime.sendMessage(
          {
            type: 'ISLAND_HEARTBEAT',
            url: window.location.href,
            title: document.title,
            currentTrack: info,
            status,
          },
          () => {
            // Ignore runtime errors if service worker is waking up
            if (chrome.runtime.lastError) {
              // Expected occasionally during background suspension
            }
          }
        );
      }
    } catch {}
  }

  function notifyStateUpdate(event, extra = {}) {
    const info = getTrackInfo();
    const status = getPlaybackStatus();
    const stateKey = `${event}:${info.videoId}:${status}`;

    if (lastReportedState === stateKey && event !== 'playing') {
      return;
    }
    lastReportedState = stateKey;

    try {
      if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
        chrome.runtime.sendMessage({
          type: 'ISLAND_STATE_UPDATE',
          payload: {
            event,
            status,
            videoId: info.videoId,
            title: info.title,
            artist: info.artist,
            currentTime: activeVideoElement ? activeVideoElement.currentTime : 0,
            duration: activeVideoElement ? activeVideoElement.duration : 0,
            ...extra,
          },
        });
      }
    } catch {}
  }

  // ----------------------------------------------------------------- Command Execution & Verification
  async function executePlayTrack(command, sendResponse) {
    const targetVideoId = command.videoId;
    console.log('[Dynamic Island Content] executePlayTrack:', targetVideoId, command.title);

    // Case A: Unresolved favorite (no exact video ID) -> navigate existing tab to search URL
    if (!targetVideoId) {
      const searchUrl =
        command.url ||
        `https://music.youtube.com/search?q=${encodeURIComponent((command.title || '') + ' ' + (command.artist || ''))}`;
      console.log('[Dynamic Island Content] Navigating existing tab to search URL:', searchUrl);
      window.location.href = searchUrl;

      sendResponse({
        commandId: command.id,
        status: 'navigated',
        url: searchUrl,
        isUnresolved: true,
      });
      return;
    }

    // Case B: Exact video ID -> Load and play in existing tab
    isAutoplayBlocked = false;

    // Send load command to page bridge (MAIN world)
    window.postMessage(
      {
        source: 'ISLAND_CONTENT_SCRIPT',
        action: 'LOAD_VIDEO',
        videoId: targetVideoId,
        commandId: command.id,
      },
      '*'
    );

    // Fallback: Also try direct anchor click in YouTube Music SPA if movie_player takes time
    setTimeout(() => {
      const currentId = getVideoId();
      if (currentId !== targetVideoId) {
        const watchLink = document.querySelector(`a[href*="${targetVideoId}"]`);
        if (watchLink) {
          console.log('[Dynamic Island Content] Triggering SPA anchor click fallback for:', targetVideoId);
          watchLink.click();
        }
      }
    }, 400);

    // Strict Verification Loop:
    // We do NOT acknowledge 'confirmed_playing' until:
    // 1. Target video ID is matched in the player
    // 2. The <video> element is actively playing (!paused, !ended, currentTime > 0)
    const startTime = Date.now();
    const VERIFY_TIMEOUT_MS = 8000;
    let pollInterval = null;

    const cleanup = () => {
      if (pollInterval) clearInterval(pollInterval);
    };

    pollInterval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const video = activeVideoElement || document.querySelector('video');
      if (video) activeVideoElement = video;

      const currentVidId = getVideoId();

      // Check for genuine audible playback
      if (video && !video.paused && !video.ended && video.currentTime > 0) {
        // If currentVidId matches targetVideoId (or if we are playing and title matches)
        if (currentVidId === targetVideoId || !currentVidId) {
          cleanup();
          const info = getTrackInfo();
          console.log('[Dynamic Island Content] Playback confirmed for:', targetVideoId, info.title);
          sendResponse({
            commandId: command.id,
            status: 'confirmed_playing',
            videoId: targetVideoId,
            title: info.title,
            artist: info.artist,
          });
          notifyStateUpdate('playing', { videoId: targetVideoId });
          return;
        }
      }

      // Check for Autoplay block
      if (video && video.paused && elapsed > 2500) {
        // Try triggering video.play() in case of user gesture permission
        const playPromise = video.play();
        if (playPromise && typeof playPromise.catch === 'function') {
          playPromise.catch((err) => {
            if (err.name === 'NotAllowedError') {
              cleanup();
              isAutoplayBlocked = true;
              console.warn('[Dynamic Island Content] Autoplay blocked by browser policy');
              sendResponse({
                commandId: command.id,
                status: 'autoplay_blocked',
                error: 'Autoplay blocked by browser policy. Click Play in YouTube Music.',
              });
              notifyStateUpdate('autoplay_blocked');
            }
          });
        }
      }

      // Timeout check
      if (elapsed >= VERIFY_TIMEOUT_MS) {
        cleanup();
        console.warn('[Dynamic Island Content] Playback verification timed out after 8s');
        sendResponse({
          commandId: command.id,
          status: 'failed',
          error: 'Playback verification timed out. Player did not start within 8 seconds.',
        });
      }
    }, 250);
  }

  // ----------------------------------------------------------------- Extension Message Receiver
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || message.type !== 'ISLAND_COMMAND') return;

    const command = message.command;
    console.log('[Dynamic Island Content] Received command:', command.action, command.id);

    if (command.action === 'play_track') {
      executePlayTrack(command, sendResponse);
      return true; // Keep channel open for async response
    }

    if (command.action === 'pause') {
      window.postMessage({ source: 'ISLAND_CONTENT_SCRIPT', action: 'PAUSE', commandId: command.id }, '*');
      if (activeVideoElement) activeVideoElement.pause();
      sendResponse({ commandId: command.id, status: 'paused' });
      notifyStateUpdate('paused');
      return true;
    }

    if (command.action === 'resume') {
      window.postMessage({ source: 'ISLAND_CONTENT_SCRIPT', action: 'PLAY', commandId: command.id }, '*');
      if (activeVideoElement) activeVideoElement.play().catch(() => {});
      sendResponse({ commandId: command.id, status: 'confirmed_playing' });
      notifyStateUpdate('playing');
      return true;
    }

    sendResponse({ commandId: command.id, status: 'failed', error: `Unknown action: ${command.action}` });
    return true;
  });

  // ----------------------------------------------------------------- Event Listeners on <video>
  function bindVideoListeners() {
    const video = document.querySelector('video');
    if (video && video !== activeVideoElement) {
      activeVideoElement = video;

      video.addEventListener('play', () => {
        isAutoplayBlocked = false;
        notifyStateUpdate('play');
      });

      video.addEventListener('playing', () => {
        isAutoplayBlocked = false;
        notifyStateUpdate('playing');
      });

      video.addEventListener('pause', () => {
        notifyStateUpdate('paused');
      });

      video.addEventListener('ended', () => {
        notifyStateUpdate('ended');
      });
    }
  }

  // Monitor DOM for player changes & SPA navigation
  const observer = new MutationObserver(() => {
    bindVideoListeners();
  });

  observer.observe(document.body || document.documentElement, {
    childList: true,
    subtree: true,
  });

  window.addEventListener('yt-page-data-updated', () => {
    notifyStateUpdate('track_changed');
  });

  window.addEventListener('yt-navigate-finish', () => {
    notifyStateUpdate('navigated');
  });

  // Heartbeat loop (every 2.5 seconds)
  bindVideoListeners();
  sendHeartbeat();
  heartbeatTimer = setInterval(sendHeartbeat, 2500);

  window.addEventListener('beforeunload', () => {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    observer.disconnect();
  });
})();
