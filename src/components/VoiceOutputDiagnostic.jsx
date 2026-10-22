import React, { useState, useRef, useEffect } from 'react';
import { Icon } from './icons';
import { playNativeWavBase64, stopActivePlayback, getPlaybackAudioContext } from '../lib/native-audio-player';

export default function VoiceOutputDiagnostic() {
  const [isRunning, setIsRunning] = useState(false);
  const [report, setReport] = useState(null);
  const [logMessages, setLogMessages] = useState([]);
  const activeUtteranceRef = useRef(null);

  useEffect(() => {
    return () => {
      stopActivePlayback();
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        try { window.speechSynthesis.cancel(); } catch {}
      }
      if (window.island?.windowsTts?.cancel) {
        try { window.island.windowsTts.cancel(); } catch {}
      }
    };
  }, []);

  const addLog = (msg) => {
    const time = new Date().toLocaleTimeString();
    setLogMessages((prev) => [...prev, `[${time}] ${msg}`]);
  };

  const runDiagnostic = async () => {
    setIsRunning(true);
    setLogMessages([]);
    const phrase = 'Island voice output test.';
    addLog(`Initiating isolated audio output test with text: "${phrase}"`);

    const diag = {
      timestamp: new Date().toISOString(),
      testPhrase: phrase,
      selectedEngine: localStorage.getItem('island_voice_engine') || 'gemini',
      webSpeech: {
        supported: typeof window !== 'undefined' && Boolean(window.speechSynthesis),
        initialVoiceCount: 0,
        asyncVoiceCount: 0,
        voicesChangedFired: false,
        speakCalled: false,
        onstartFired: false,
        onendFired: false,
        onerrorFired: false,
        engineState: null,
      },
      windowsNative: {
        available: Boolean(window.island?.windowsTts),
        voicesCount: 0,
        selectedVoice: null,
        synthesisOk: false,
        durationMs: null,
        audioBytes: 0,
      },
      webAudio: {
        contextState: null,
        playbackStarted: false,
        playbackEnded: false,
        hardwareAudible: false,
      },
      finalVerdict: 'Running...',
    };

    try {
      // 1. Audit Web Speech API (window.speechSynthesis)
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        const initialVoices = window.speechSynthesis.getVoices?.() || [];
        diag.webSpeech.initialVoiceCount = initialVoices.length;
        addLog(`Web Speech initial getVoices(): ${initialVoices.length} voice(s)`);

        // Check if voices load asynchronously
        if (initialVoices.length === 0) {
          addLog('Voices count is 0; waiting up to 300ms for onvoiceschanged...');
          await new Promise((resolve) => {
            let done = false;
            const timer = setTimeout(() => {
              if (!done) {
                done = true;
                addLog('voiceschanged timeout reached.');
                resolve();
              }
            }, 300);

            window.speechSynthesis.onvoiceschanged = () => {
              if (!done) {
                done = true;
                clearTimeout(timer);
                diag.webSpeech.voicesChangedFired = true;
                const v = window.speechSynthesis.getVoices() || [];
                diag.webSpeech.asyncVoiceCount = v.length;
                addLog(`voiceschanged fired! Voice count: ${v.length}`);
                resolve();
              }
            };
          });
        }

        diag.webSpeech.engineState = {
          speaking: window.speechSynthesis.speaking,
          pending: window.speechSynthesis.pending,
          paused: window.speechSynthesis.paused,
        };
      } else {
        addLog('window.speechSynthesis is NOT present in this environment.');
      }

      // 2. Audit Native Windows SAPI Speech Synthesizer
      if (window.island?.windowsTts) {
        addLog('Querying native Windows SAPI voice service (electron/windows-tts)...');
        const vRes = await window.island.windowsTts.getVoices();
        if (vRes?.ok && vRes.voices?.length > 0) {
          diag.windowsNative.voicesCount = vRes.voices.length;
          diag.windowsNative.selectedVoice =
            localStorage.getItem('island_windows_voice_uri') || vRes.voices[0].voiceURI;
          addLog(`Native Windows SAPI: found ${vRes.voices.length} voice(s) (Active: ${diag.windowsNative.selectedVoice})`);
        } else {
          addLog(`Native Windows SAPI voice enumeration returned: ${vRes?.error || '0 voices'}`);
        }
      }

      // 3. Perform Actual Audio Synthesis & Speaker Playback
      // If native Windows SAPI is available in Electron, use it to send real PCM WAV to WebAudio
      if (window.island?.windowsTts?.synthesizeSpeech) {
        addLog('Synthesizing speech via native Windows SAPI...');
        const t0 = Date.now();
        const synthRes = await window.island.windowsTts.synthesizeSpeech({
          text: phrase,
          voice: diag.windowsNative.selectedVoice,
        });
        const elapsed = Date.now() - t0;
        diag.windowsNative.durationMs = elapsed;

        if (synthRes?.ok && synthRes.audioBase64) {
          diag.windowsNative.synthesisOk = true;
          diag.windowsNative.audioBytes = synthRes.audioBase64.length;
          addLog(`Native SAPI generated ${Math.round(synthRes.audioBase64.length * 0.75)} bytes of PCM WAV in ${elapsed}ms`);

          // Play through shared WebAudio player to the user's default Windows speaker
          addLog('Initializing WebAudio output via shared native-audio-player...');
          const ctx = getPlaybackAudioContext();
          diag.webAudio.contextState = ctx?.state;
          addLog(`AudioContext state: ${ctx?.state}, sampleRate: ${ctx?.sampleRate}Hz`);

          const playRes = await playNativeWavBase64(synthRes.audioBase64, {
            onStart: () => {
              diag.webAudio.playbackStarted = true;
              diag.webAudio.hardwareAudible = true;
              addLog('WebAudio hardware playback started...');
            },
            onEnded: () => {
              diag.webAudio.playbackEnded = true;
              addLog('WebAudio playback ended: Audio played through Windows speakers!');
            },
            onError: (err) => {
              addLog(`Playback error: ${err.message}`);
            },
          });

          if (playRes.ok) {
            diag.finalVerdict = 'SUCCESS: Real audible speech generated via Native SAPI and delivered through Windows speakers.';
          } else {
            diag.finalVerdict = `FAILED: Playback error (${playRes.error})`;
          }
        } else {
          diag.windowsNative.synthesisOk = false;
          addLog(`Native synthesis failed: ${synthRes?.error || 'Unknown error'}`);
          diag.finalVerdict = `FAILED: Native synthesis error (${synthRes?.error})`;
        }
      } else if (typeof window !== 'undefined' && window.speechSynthesis) {
        // Fallback testing Web Speech in pure browser environments
        const voices = window.speechSynthesis.getVoices() || [];
        if (voices.length === 0) {
          addLog('Web Speech has 0 voices. Chromium in Electron does not provide speech synthesis without Google API keys.');
          diag.finalVerdict = 'FAILED: Web Speech API has 0 voices in this Electron environment. Native SAPI must be used.';
        } else {
          addLog('Testing Web Speech speak() with available browser voice...');
          const utterance = new SpeechSynthesisUtterance(phrase);
          activeUtteranceRef.current = utterance;
          const enVoice = voices.find((v) => v.lang.startsWith('en')) || voices[0];
          utterance.voice = enVoice;

          await new Promise((speechResolve) => {
            utterance.onstart = () => {
              diag.webSpeech.onstartFired = true;
              addLog('utterance.onstart fired.');
            };
            utterance.onend = () => {
              diag.webSpeech.onendFired = true;
              addLog('utterance.onend fired.');
              activeUtteranceRef.current = null;
              speechResolve();
            };
            utterance.onerror = (e) => {
              diag.webSpeech.onerrorFired = true;
              addLog(`utterance.onerror: ${e?.error || 'Failed'}`);
              activeUtteranceRef.current = null;
              speechResolve();
            };

            diag.webSpeech.speakCalled = true;
            window.speechSynthesis.speak(utterance);
          });

          diag.finalVerdict = 'Web Speech utterance executed.';
        }
      }
    } catch (err) {
      addLog(`Diagnostic exception: ${err.message}`);
      diag.finalVerdict = `EXCEPTION: ${err.message}`;
    } finally {
      setReport(diag);
      setIsRunning(false);
    }
  };

  return (
    <div style={{ marginTop: 12, padding: 12, borderRadius: 10, background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div>
          <span style={{ fontSize: 12, fontWeight: 600, color: '#f3f4f6', display: 'block' }}>
            Diagnostic: Test Voice Output
          </span>
          <span style={{ fontSize: 10, color: 'rgba(255, 255, 255, 0.6)' }}>
            Speaks "Island voice output test." directly to speakers, bypassing AI, STT, and media logic.
          </span>
        </div>

        <button
          type="button"
          className="settings-chip is-active"
          onClick={runDiagnostic}
          disabled={isRunning}
          style={{ height: 28, fontSize: 11, padding: '0 12px', display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <Icon.Play width={12} height={12} />
          <span>{isRunning ? 'Testing...' : 'Test Voice Output'}</span>
        </button>
      </div>

      {report && (
        <div style={{ marginTop: 10, padding: 10, borderRadius: 8, background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.06)', fontSize: 11, fontFamily: 'monospace' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, color: report.webAudio.hardwareAudible ? '#10b981' : '#f59e0b', fontWeight: 600 }}>
            <span>●</span>
            <span>{report.finalVerdict}</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6, color: 'rgba(255,255,255,0.8)' }}>
            <div>Web Speech Present: <strong>{String(report.webSpeech.supported)}</strong></div>
            <div>Web Speech Voices: <strong>{report.webSpeech.initialVoiceCount}</strong></div>
            <div>Native SAPI Available: <strong>{String(report.windowsNative.available)}</strong></div>
            <div>Native SAPI Voices: <strong>{report.windowsNative.voicesCount}</strong></div>
            <div>AudioContext State: <strong>{report.webAudio.contextState || 'N/A'}</strong></div>
            <div>Speaker Playback: <strong>{report.webAudio.playbackEnded ? 'Completed' : (report.webAudio.playbackStarted ? 'Started' : 'Idle')}</strong></div>
          </div>

          {logMessages.length > 0 && (
            <div style={{ marginTop: 8, maxHeight: 110, overflowY: 'auto', background: 'rgba(0,0,0,0.3)', padding: 6, borderRadius: 6, color: 'rgba(255,255,255,0.65)', fontSize: 10, lineHeight: 1.4 }}>
              {logMessages.map((msg, i) => (
                <div key={i}>{msg}</div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
