// Dynamic Island Companion - YouTube Music Player Bridge (MAIN World)
// Runs in page context with direct access to #movie_player, ytmusic-app, and YouTube's internal APIs
(function () {
  'use strict';

  // Prevent multiple injections
  if (window.__ISLAND_PLAYER_BRIDGE_INITIALIZED__) return;
  window.__ISLAND_PLAYER_BRIDGE_INITIALIZED__ = true;

  console.log('[Dynamic Island] YouTube Music Page Bridge active');

  function getMoviePlayer() {
    return document.querySelector('#movie_player');
  }

  function getPlayerVideoData() {
    try {
      const player = getMoviePlayer();
      if (player && typeof player.getVideoData === 'function') {
        const data = player.getVideoData();
        return {
          videoId: data?.video_id || null,
          title: data?.title || '',
          author: data?.author || '',
        };
      }
    } catch {}
    return null;
  }

  function sendToIsolated(type, data = {}) {
    window.postMessage(
      {
        source: 'ISLAND_PAGE_BRIDGE',
        type,
        ...data,
      },
      '*'
    );
  }

  // Listen for commands from the isolated content script (ytmusic-companion.js)
  window.addEventListener('message', (event) => {
    if (event.source !== window || !event.data || event.data.source !== 'ISLAND_CONTENT_SCRIPT') {
      return;
    }

    const { action, videoId, commandId } = event.data;

    if (action === 'PING_BRIDGE') {
      sendToIsolated('BRIDGE_PONG', { videoData: getPlayerVideoData() });
      return;
    }

    if (action === 'LOAD_VIDEO' && videoId) {
      const watchUrl = `/watch?v=${videoId}`;
      let navSuccess = false;

      // 1. YouTube Music native SPA navigation event
      try {
        const app = document.querySelector('ytmusic-app');
        if (app) {
          app.dispatchEvent(
            new CustomEvent('yt-navigate', {
              bubbles: true,
              composed: true,
              detail: {
                endpoint: {
                  watchEndpoint: {
                    videoId,
                  },
                },
              },
            })
          );
          navSuccess = true;
        }
      } catch (err) {
        console.warn('[Dynamic Island Bridge] yt-navigate error:', err);
      }

      // 2. Click an in-DOM anchor (YouTube Music's global click router catches and updates UI & queue)
      try {
        const anchor = document.createElement('a');
        anchor.href = watchUrl;
        anchor.style.display = 'none';
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        navSuccess = true;
      } catch (err) {
        console.warn('[Dynamic Island Bridge] anchor click error:', err);
      }

      // 3. Trigger playback
      try {
        const player = getMoviePlayer();
        if (player && typeof player.playVideo === 'function') {
          player.playVideo();
        }
      } catch {}

      sendToIsolated('LOAD_INITIATED', {
        commandId,
        videoId,
        loadSuccess: navSuccess,
      });
      return;
    }

    if (action === 'PLAY') {
      const player = getMoviePlayer();
      if (player && typeof player.playVideo === 'function') {
        player.playVideo();
      }
      sendToIsolated('PLAY_REQUESTED', { commandId });
      return;
    }

    if (action === 'PAUSE') {
      const player = getMoviePlayer();
      if (player && typeof player.pauseVideo === 'function') {
        player.pauseVideo();
      }
      sendToIsolated('PAUSE_REQUESTED', { commandId });
      return;
    }

    if (action === 'SET_VOLUME') {
      const player = getMoviePlayer();
      if (player && typeof player.setVolume === 'function') {
        const pct = Math.max(0, Math.min(100, Math.round(Number(event.data.volume) * 100)));
        player.setVolume(pct);
      }
      sendToIsolated('VOLUME_SET', { commandId });
      return;
    }

    if (action === 'DUCK') {
      const player = getMoviePlayer();
      if (player && typeof player.setVolume === 'function') {
        const pct = Math.max(0, Math.min(100, Math.round(Number(event.data.level) * 100)));
        player.setVolume(pct);
      }
      sendToIsolated('DUCK_APPLIED', { commandId });
      return;
    }

    if (action === 'RESTORE_VOLUME') {
      const player = getMoviePlayer();
      if (player && typeof player.setVolume === 'function') {
        const pct = Math.max(0, Math.min(100, Math.round(Number(event.data.volume) * 100)));
        player.setVolume(pct);
      }
      sendToIsolated('VOLUME_RESTORED', { commandId });
      return;
    }
  });

  // Announce bridge ready
  sendToIsolated('BRIDGE_READY', { videoData: getPlayerVideoData() });
})();
