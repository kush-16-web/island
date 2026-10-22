// Dynamic Island Companion - Manifest V3 Background Service Worker
// Manages local HTTP bridge communication, tab routing, and lifecycle resilience

const ISLAND_ENDPOINT = 'http://127.0.0.1:47823';
const POLL_INTERVAL_MS = 2000;
const ERROR_BACKOFF_MS = 6000;
const TAB_EXPIRY_MS = 15000;

// Tab registry: tabId -> { tabId, url, title, currentTrack, status, lastSeen }
const ytMusicTabs = new Map();
let primaryTabId = null;

let isPolling = false;
let pollTimer = null;
let lastServerAvailable = true;
let consecutiveErrors = 0;

console.log('[Dynamic Island SW] Background service worker initialized');

// Clean up stale tabs
function cleanStaleTabs() {
  const now = Date.now();
  for (const [tabId, tab] of ytMusicTabs.entries()) {
    if (now - tab.lastSeen > TAB_EXPIRY_MS) {
      ytMusicTabs.delete(tabId);
      if (primaryTabId === tabId) {
        primaryTabId = null;
      }
    }
  }
  // Re-elect primary tab if needed
  if (!primaryTabId && ytMusicTabs.size > 0) {
    // Prefer playing tab, otherwise first available
    for (const [tabId, tab] of ytMusicTabs.entries()) {
      if (tab.status === 'playing') {
        primaryTabId = tabId;
        break;
      }
    }
    if (!primaryTabId) {
      primaryTabId = ytMusicTabs.keys().next().value;
    }
  }
}

function getPrimaryTab() {
  cleanStaleTabs();
  if (primaryTabId && ytMusicTabs.has(primaryTabId)) {
    return ytMusicTabs.get(primaryTabId);
  }
  return null;
}

// Low-level fetch wrapper with error handling
async function postToIsland(endpoint, payload) {
  try {
    const res = await fetch(`${ISLAND_ENDPOINT}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Island-Client': 'companion-sw',
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    lastServerAvailable = true;
    consecutiveErrors = 0;
    return data;
  } catch (err) {
    consecutiveErrors++;
    if (consecutiveErrors > 3 && lastServerAvailable) {
      lastServerAvailable = false;
      console.warn('[Dynamic Island SW] Island server unreachable:', err.message);
    }
    return null;
  }
}

async function fetchFromIsland(endpoint) {
  try {
    const res = await fetch(`${ISLAND_ENDPOINT}${endpoint}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-Island-Client': 'companion-sw',
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    lastServerAvailable = true;
    consecutiveErrors = 0;
    return data;
  } catch (err) {
    consecutiveErrors++;
    if (consecutiveErrors > 3 && lastServerAvailable) {
      lastServerAvailable = false;
    }
    return null;
  }
}

// Send heartbeat to Island server
async function sendHeartbeat() {
  const primaryTab = getPrimaryTab();
  const tabsCount = ytMusicTabs.size;

  const pingPayload = {
    isYtMusic: Boolean(primaryTab),
    tabsCount,
    source: 'service_worker',
    version: '1.2.0',
    primaryTabId: primaryTab ? primaryTab.tabId : null,
    url: primaryTab ? primaryTab.url : null,
    currentTrack: primaryTab ? primaryTab.currentTrack : null,
    status: primaryTab ? primaryTab.status : 'no_player',
  };

  return await postToIsland('/companion/ping', pingPayload);
}

let currentInFlightCommand = null;

// Pull next command and dispatch to primary YouTube Music tab
async function pullAndDispatchCommand() {
  const primaryTab = getPrimaryTab();
  if (!primaryTab) return;

  const res = await fetchFromIsland('/companion/command');
  if (res && res.ok && res.command) {
    const command = res.command;
    console.log('[Dynamic Island SW] Received command from Island:', command.action, command.id);
    currentInFlightCommand = {
      command,
      tabId: primaryTab.tabId,
      startTime: Date.now(),
    };

    try {
      chrome.tabs.sendMessage(
        primaryTab.tabId,
        {
          type: 'ISLAND_COMMAND',
          command,
        },
        async (ack) => {
          if (chrome.runtime.lastError) {
            console.warn('[Dynamic Island SW] Tab message port closed (tab may be navigating):', chrome.runtime.lastError.message);
            // Tab might be navigating to watch URL; give it grace period to initialize before failing
            setTimeout(async () => {
              if (currentInFlightCommand && currentInFlightCommand.command.id === command.id) {
                console.warn('[Dynamic Island SW] Command not confirmed after navigation timeout');
                await postToIsland('/companion/ack', {
                  commandId: command.id,
                  status: 'failed',
                  error: 'Tab navigation completed but player did not start',
                });
                currentInFlightCommand = null;
              }
            }, 9000);
            return;
          }
          if (ack) {
            console.log('[Dynamic Island SW] Forwarding ack to Island:', ack.status);
            currentInFlightCommand = null;
            await postToIsland('/companion/ack', ack);
          }
        }
      );
    } catch (err) {
      console.warn('[Dynamic Island SW] Error dispatching command:', err);
      currentInFlightCommand = null;
      await postToIsland('/companion/ack', {
        commandId: command.id,
        status: 'failed',
        error: err.message,
      });
    }
  }
}

// Main polling loop
async function pollLoop() {
  if (isPolling) return;
  isPolling = true;

  try {
    cleanStaleTabs();
    if (ytMusicTabs.size > 0) {
      await sendHeartbeat();
      await pullAndDispatchCommand();
    }
  } catch (err) {
    console.warn('[Dynamic Island SW] pollLoop error:', err);
  } finally {
    isPolling = false;
    const delay = consecutiveErrors > 3 ? ERROR_BACKOFF_MS : POLL_INTERVAL_MS;
    if (pollTimer) clearTimeout(pollTimer);
    pollTimer = setTimeout(pollLoop, delay);
  }
}

// Start polling
pollLoop();

// Chrome alarm backup for MV3 dormancy keepalive
chrome.alarms.create('island_keepalive', { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'island_keepalive') {
    pollLoop();
  }
});

// Tab focus & lifecycle tracking
chrome.tabs.onActivated.addListener((activeInfo) => {
  if (ytMusicTabs.has(activeInfo.tabId)) {
    primaryTabId = activeInfo.tabId;
    pollLoop();
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  if (ytMusicTabs.has(tabId)) {
    ytMusicTabs.delete(tabId);
    if (primaryTabId === tabId) {
      primaryTabId = null;
      cleanStaleTabs();
    }
  }
});

// Runtime message listener from content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.type) return;

  const tabId = sender.tab ? sender.tab.id : null;

  // 1. YouTube Music content script heartbeat
  if (message.type === 'ISLAND_HEARTBEAT') {
    if (tabId) {
      const tabData = {
        tabId,
        url: message.url || (sender.tab ? sender.tab.url : ''),
        title: message.title || (sender.tab ? sender.tab.title : ''),
        currentTrack: message.currentTrack || null,
        status: message.status || 'unknown',
        lastSeen: Date.now(),
      };
      ytMusicTabs.set(tabId, tabData);

      // If this tab is actively playing, promote to primary
      if (tabData.status === 'playing' || !primaryTabId) {
        primaryTabId = tabId;
      }
    }
    sendResponse({ ok: true, isPrimary: primaryTabId === tabId });
    // Trigger immediate command check on heartbeat
    pollLoop();
    return true;
  }

  // 2. Real-time playback state update (play/pause/track change)
  if (message.type === 'ISLAND_STATE_UPDATE') {
    if (tabId && ytMusicTabs.has(tabId)) {
      const existing = ytMusicTabs.get(tabId);
      existing.status = message.payload?.status || existing.status;
      if (message.payload?.currentTrack) existing.currentTrack = message.payload.currentTrack;
      existing.lastSeen = Date.now();
      if (existing.status === 'playing') primaryTabId = tabId;
    }

    if (
      currentInFlightCommand &&
      currentInFlightCommand.command.videoId &&
      message.payload?.videoId === currentInFlightCommand.command.videoId &&
      (message.payload?.status === 'playing' || message.payload?.event === 'playing')
    ) {
      console.log('[Dynamic Island SW] State update confirmed in-flight command:', currentInFlightCommand.command.id);
      const cmdId = currentInFlightCommand.command.id;
      const vid = currentInFlightCommand.command.videoId;
      currentInFlightCommand = null;
      postToIsland('/companion/ack', {
        commandId: cmdId,
        status: 'confirmed_playing',
        videoId: vid,
        title: message.payload?.title || '',
        artist: message.payload?.artist || '',
      });
    }

    postToIsland('/companion/state', message.payload).then((res) => {
      sendResponse(res || { ok: false });
    });
    return true;
  }

  // 3. Command acknowledgment from content script
  if (message.type === 'ISLAND_COMMAND_ACK') {
    postToIsland('/companion/ack', message.ack).then((res) => {
      sendResponse(res || { ok: false });
    });
    return true;
  }

  // 4. Video state from YouTube ambient lighting (content.js)
  if (message.type === 'ISLAND_VIDEO_STATE') {
    postToIsland('/video-state', message.payload).then((res) => {
      sendResponse(res || { ok: false });
    });
    return true;
  }
});
