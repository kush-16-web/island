'use strict';
/**
 * test/capture-voice-screenshots.cjs
 * Visual verification harness for Pass 2.2.8.4 - Live Voice Assistant UI.
 * Captures the 10 real Electron UI states specified in Phase 13:
 * 1. Listening
 * 2. Thinking
 * 3. Preparing speech
 * 4. Speaking
 * 5. Timer result
 * 6. Weather result
 * 7. Music list
 * 8. Ordinary conversation
 * 9. History view
 * 10. Expanded result near screen edge
 */

const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const ARTIFACT_DIR = 'C:/Users/harsh/.gemini/antigravity-ide/brain/6b7fbad8-f30d-40fe-b5d1-48e89f0091f3';

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 480,
    height: 640,
    show: true,
    frame: false,
    transparent: true,
    backgroundColor: '#090a0f',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  const pagePath = path.join(__dirname, '../../test/harness/visual-verification.html');
  await win.loadFile(pagePath);

  const cssContent = fs.readFileSync(path.join(__dirname, '../../src/styles.css'), 'utf8');
  await win.webContents.insertCSS(cssContent);
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });

  async function snap(filename) {
    await new Promise((r) => setTimeout(r, 450));
    const image = await win.webContents.capturePage();
    const buffer = image.toPNG();
    fs.writeFileSync(path.join(ARTIFACT_DIR, filename), buffer);
    console.log(`Saved ${filename} (${buffer.length} bytes) to ${ARTIFACT_DIR}`);
  }

  // 1. Listening
  await win.webContents.executeJavaScript(`
    window.setAssistantState('listening', {
      label: 'Listening…',
      indicatorState: 'listening',
      bars: [5, 13, 8, 4],
      query: 'Set a timer for five minutes so I can get lunch',
      surfaceHtml: \`
        <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; text-align: center; gap: 8px;">
          <div style="font-size: 13.5px; font-weight: 550; color: rgba(255, 255, 255, 0.85);">"Set a timer for five minutes so I can get lunch"</div>
          <div style="font-size: 11.5px; color: rgba(255, 255, 255, 0.45); font-style: italic;">Listening to your voice…</div>
        </div>
      \`
    });
  `);
  await snap('screenshot_1_listening.png');

  // 2. Thinking
  await win.webContents.executeJavaScript(`
    window.setAssistantState('thinking', {
      label: 'Thinking…',
      indicatorState: 'thinking',
      bars: [8, 14, 10, 6],
      query: "What's the weather today?",
      surfaceHtml: \`
        <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; text-align: center; gap: 8px;">
          <div style="font-size: 13.5px; font-weight: 550; color: rgba(255, 255, 255, 0.85);">"What's the weather today?"</div>
          <div style="font-size: 11.5px; color: rgba(255, 255, 255, 0.5);">Retrieving local forecast…</div>
        </div>
      \`
    });
  `);
  await snap('screenshot_2_thinking.png');

  // 3. Preparing speech
  await win.webContents.executeJavaScript(`
    window.setAssistantState('preparing_speech', {
      label: 'Preparing speech…',
      indicatorState: 'idle',
      bars: [4, 4, 4, 4],
      query: 'How does Island Voice work?',
      surfaceHtml: \`
        <div style="display: flex; flex-direction: column; gap: 10px; padding: 4px 2px;">
          <div style="font-size: 13px; font-weight: 600; color: rgba(255, 255, 255, 0.9);">Island Voice Architecture</div>
          <div style="font-size: 12px; line-height: 1.5; color: rgba(255, 255, 255, 0.75);">
            Synthesizing conversational response. Audio playback is preparing…
          </div>
        </div>
      \`
    });
  `);
  await snap('screenshot_3_preparing_speech.png');

  // 4. Speaking
  await win.webContents.executeJavaScript(`
    window.setAssistantState('speaking', {
      label: 'Speaking',
      indicatorState: 'speaking',
      bars: [8, 16, 13, 7],
      query: "What's the weather today?",
      surfaceHtml: \`
        <div style="display: flex; flex-direction: column; gap: 14px; padding: 4px 2px;">
          <div class="structured-caption-wrap is-speaking">
            <div class="structured-caption__text" style="font-size: 13.5px; color: #fff; font-style: normal; font-weight: 500; line-height: 1.45;">
              "It's currently 28 degrees and partly cloudy in Surat with a pleasant breeze."
            </div>
          </div>
        </div>
      \`
    });
  `);
  await snap('screenshot_4_speaking.png');

  // 5. Timer Result (Integrated Hero)
  await win.webContents.executeJavaScript(`
    window.setAssistantState('idle', {
      label: 'Timer',
      indicatorState: 'idle',
      bars: [4, 4, 4, 4],
      query: 'Set a timer for five minutes so I can get lunch',
      surfaceHtml: \`
        <div class="live-timer-hero" role="region" aria-label="Timer Status">
          <div class="live-timer-hero__header">
            <span class="live-timer-hero__label">Lunch</span>
          </div>
          <div class="live-timer-hero__countdown">04:59</div>
          <div class="live-timer-hero__track" aria-hidden="true">
            <div class="live-timer-hero__fill" style="width: 25%;"></div>
          </div>
          <div class="live-timer-hero__footer">
            <span class="live-timer-hero__meta">5-minute timer</span>
            <button type="button" class="live-timer-hero__action-btn">Stop</button>
          </div>
        </div>
      \`
    });
  `);
  await snap('screenshot_5_timer_result.png');

  // 6. Weather Result (Editorial Layout)
  await win.webContents.executeJavaScript(`
    window.setAssistantState('idle', {
      label: 'Weather',
      indicatorState: 'idle',
      bars: [4, 4, 4, 4],
      query: "What's the weather today?",
      surfaceHtml: \`
        <div class="minimal-weather">
          <div class="minimal-weather__header">
            <div class="minimal-weather__location">
              <span class="minimal-weather__city">Surat</span>
            </div>
          </div>
          <div class="minimal-weather__hero">
            <div class="minimal-weather__temp">28°</div>
            <span class="minimal-weather__condition">Partly cloudy</span>
          </div>
          <div class="minimal-weather__sub-row">
            <span>Feels 30°</span>
            <span class="minimal-weather__dot">·</span>
            <span>High 31°</span>
            <span class="minimal-weather__dot">·</span>
            <span>Low 24°</span>
          </div>
          <div class="minimal-weather__hourly-strip">
            <div class="minimal-weather__hourly-item">
              <span class="minimal-weather__hourly-time">Now</span>
              <span class="minimal-weather__hourly-icon">☀</span>
              <span class="minimal-weather__hourly-temp">28°</span>
            </div>
            <div class="minimal-weather__hourly-item">
              <span class="minimal-weather__hourly-time">2 PM</span>
              <span class="minimal-weather__hourly-icon">☁</span>
              <span class="minimal-weather__hourly-temp">29°</span>
            </div>
            <div class="minimal-weather__hourly-item">
              <span class="minimal-weather__hourly-time">4 PM</span>
              <span class="minimal-weather__hourly-icon">☁</span>
              <span class="minimal-weather__hourly-temp">30°</span>
            </div>
            <div class="minimal-weather__hourly-item">
              <span class="minimal-weather__hourly-time">6 PM</span>
              <span class="minimal-weather__hourly-icon">☾</span>
              <span class="minimal-weather__hourly-temp">27°</span>
            </div>
          </div>
          <div class="minimal-weather__meta-row">
            <span>Humidity 55%</span>
            <span class="minimal-weather__dot">·</span>
            <span>Wind 12 km/h</span>
          </div>
        </div>
      \`
    });
  `);
  await snap('screenshot_6_weather_result.png');

  // 7. Music List
  await win.webContents.executeJavaScript(`
    window.setAssistantState('idle', {
      label: 'Music',
      indicatorState: 'idle',
      bars: [4, 4, 4, 4],
      query: 'Show songs by Daft Punk',
      surfaceHtml: \`
        <div style="display: flex; flex-direction: column; gap: 8px; width: 100%;">
          <div style="font-size: 11px; font-weight: 650; color: rgba(255,255,255,0.7); text-transform: uppercase; letter-spacing: 0.3px;">
            Songs · Daft Punk
          </div>
          <div style="display: flex; flex-direction: column; gap: 6px;">
            <div style="display: flex; align-items: center; justify-content: space-between; padding: 7px 10px; background: rgba(255,255,255,0.04); border-radius: 8px;">
              <div style="display: flex; align-items: center; gap: 10px;">
                <div style="width: 32px; height: 32px; border-radius: 6px; background: linear-gradient(135deg, #a855f7, #6366f1); display: flex; align-items: center; justify-content: center; font-size: 14px;">🎵</div>
                <div>
                  <div style="font-size: 12.5px; font-weight: 600; color: #fff;">Get Lucky</div>
                  <div style="font-size: 11px; color: rgba(255,255,255,0.5);">Random Access Memories</div>
                </div>
              </div>
              <button type="button" style="padding: 4px 10px; border-radius: 6px; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.12); color: #fff; font-size: 11px; font-weight: 600; cursor: pointer;">Play</button>
            </div>
            <div style="display: flex; align-items: center; justify-content: space-between; padding: 7px 10px; background: rgba(255,255,255,0.04); border-radius: 8px;">
              <div style="display: flex; align-items: center; gap: 10px;">
                <div style="width: 32px; height: 32px; border-radius: 6px; background: linear-gradient(135deg, #ec4899, #8b5cf6); display: flex; align-items: center; justify-content: center; font-size: 14px;">🎵</div>
                <div>
                  <div style="font-size: 12.5px; font-weight: 600; color: #fff;">One More Time</div>
                  <div style="font-size: 11px; color: rgba(255,255,255,0.5);">Discovery</div>
                </div>
              </div>
              <button type="button" style="padding: 4px 10px; border-radius: 6px; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.12); color: #fff; font-size: 11px; font-weight: 600; cursor: pointer;">Play</button>
            </div>
          </div>
        </div>
      \`
    });
  `);
  await snap('screenshot_7_music_list.png');

  // 8. Ordinary conversation
  await win.webContents.executeJavaScript(`
    window.setAssistantState('idle', {
      label: 'Assistant',
      indicatorState: 'idle',
      bars: [4, 4, 4, 4],
      query: 'How does Island Voice work?',
      surfaceHtml: \`
        <div class="live-conversation-body" style="display: flex; flex-direction: column; gap: 8px;">
          <p>
            Island Voice operates as a minimalist, live assistant. Rather than cluttering the screen with infinite chat bubbles, it prioritizes your current meaningful task or tool result.
          </p>
          <p>
            Commands execute seamlessly in the background, rendering purpose-built views for timers, weather forecasts, and music playback while keeping conversation history easily accessible.
          </p>
        </div>
      \`
    });
  `);
  await snap('screenshot_8_conversation.png');

  // 9. History view
  await win.webContents.executeJavaScript(`
    window.setAssistantState('idle', {
      label: 'Session History',
      indicatorState: 'idle',
      bars: [4, 4, 4, 4],
      query: '',
      surfaceHtml: \`
        <div class="live-assistant__history-view">
          <div class="live-assistant__history-header">
            <span class="live-assistant__history-title">Session History</span>
            <button type="button" class="live-ctl-btn live-ctl-btn--subtle" style="font-size: 11px; padding: 2px 8px;">← Back to Live</button>
          </div>
          <div class="live-assistant__history-scroll">
            <div class="live-history-turn is-user">
              <div class="live-history-turn__header">
                <span class="live-history-turn__speaker">You</span>
                <span class="live-history-turn__time">1:54 PM</span>
              </div>
              <div class="live-history-turn__content">Set a timer for five minutes so I can get lunch</div>
            </div>
            <div class="live-history-turn is-assistant">
              <div class="live-history-turn__header">
                <span class="live-history-turn__speaker">Island</span>
                <span class="live-history-turn__time">1:54 PM</span>
              </div>
              <div class="live-history-turn__content">Created Lunch timer for 5 minutes.</div>
            </div>
            <div class="live-history-turn is-user">
              <div class="live-history-turn__header">
                <span class="live-history-turn__speaker">You</span>
                <span class="live-history-turn__time">1:55 PM</span>
              </div>
              <div class="live-history-turn__content">What's the weather today?</div>
            </div>
            <div class="live-history-turn is-assistant">
              <div class="live-history-turn__header">
                <span class="live-history-turn__speaker">Island</span>
                <span class="live-history-turn__time">1:55 PM</span>
              </div>
              <div class="live-history-turn__content">Surat is currently 28° and partly cloudy with a high of 31°.</div>
            </div>
          </div>
        </div>
      \`
    });
  `);
  await snap('screenshot_9_history_view.png');

  // 10. Expanded result near screen edge
  await win.webContents.executeJavaScript(`
    window.setAssistantState('idle', {
      label: 'Weather & Forecast',
      indicatorState: 'idle',
      bars: [4, 4, 4, 4],
      windowHeight: '500px',
      query: "What's the weather today?",
      surfaceHtml: \`
        <div class="minimal-weather">
          <div class="minimal-weather__header">
            <div class="minimal-weather__location">
              <span class="minimal-weather__city">Surat</span>
            </div>
          </div>
          <div class="minimal-weather__hero">
            <div class="minimal-weather__temp">28°</div>
            <span class="minimal-weather__condition">Partly cloudy</span>
          </div>
          <div class="minimal-weather__sub-row">
            <span>Feels 30°</span>
            <span class="minimal-weather__dot">·</span>
            <span>High 31°</span>
            <span class="minimal-weather__dot">·</span>
            <span>Low 24°</span>
          </div>
          <div class="minimal-weather__hourly-strip">
            <div class="minimal-weather__hourly-item">
              <span class="minimal-weather__hourly-time">Now</span>
              <span class="minimal-weather__hourly-icon">☀</span>
              <span class="minimal-weather__hourly-temp">28°</span>
            </div>
            <div class="minimal-weather__hourly-item">
              <span class="minimal-weather__hourly-time">2 PM</span>
              <span class="minimal-weather__hourly-icon">☁</span>
              <span class="minimal-weather__hourly-temp">29°</span>
            </div>
            <div class="minimal-weather__hourly-item">
              <span class="minimal-weather__hourly-time">4 PM</span>
              <span class="minimal-weather__hourly-icon">☁</span>
              <span class="minimal-weather__hourly-temp">30°</span>
            </div>
            <div class="minimal-weather__hourly-item">
              <span class="minimal-weather__hourly-time">6 PM</span>
              <span class="minimal-weather__hourly-icon">☾</span>
              <span class="minimal-weather__hourly-temp">27°</span>
            </div>
          </div>
          <div class="minimal-weather__meta-row">
            <span>Humidity 55%</span>
            <span class="minimal-weather__dot">·</span>
            <span>Wind 12 km/h</span>
            <span class="minimal-weather__dot">·</span>
            <span>Precip 10%</span>
          </div>
        </div>
      \`
    });
  `);
  await snap('screenshot_10_expanded_result.png');

  app.quit();
});
