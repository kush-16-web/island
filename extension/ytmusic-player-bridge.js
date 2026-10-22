// Dynamic Island Companion - YouTube Music Player Bridge (MAIN World)
// Runs in page context with direct access to #movie_player and YouTube's internal APIs
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
      const player = getMoviePlayer();
      let loadSuccess = false;

      if (player) {
        try {
          if (typeof player.loadVideoById === 'function') {
            player.loadVideoById(videoId);
            loadSuccess = true;
          } else if (typeof player.cueVideoById === 'function') {
            player.cueVideoById(videoId);
            loadSuccess = true;
          }

          if (typeof player.playVideo === 'function') {
            player.playVideo();
          }
        } catch (err) {
          console.warn('[Dynamic Island Bridge] loadVideoById error:', err);
        }
      }

      sendToIsolated('LOAD_INITIATED', {
        commandId,
        videoId,
        loadSuccess,
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
  });

  // Announce bridge ready
  sendToIsolated('BRIDGE_READY', { videoData: getPlayerVideoData() });
})();
