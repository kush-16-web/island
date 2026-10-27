import React, { useEffect, useState, useRef } from 'react';
import { Icon } from '../icons';

const TARGET_VOICES = [
  { name: 'Microsoft Heera', query: 'Heera', lang: 'English (India)', type: 'SAPI / OneCore' },
  { name: 'Microsoft Ravi', query: 'Ravi', lang: 'English (India)', type: 'SAPI / OneCore' },
  { name: 'Microsoft Neerja (Natural)', query: 'Neerja', lang: 'English (India)', type: 'Narrator Natural' },
  { name: 'Microsoft Prabhat (Natural)', query: 'Prabhat', lang: 'Hindi (India)', type: 'Narrator Natural' },
  { name: 'Microsoft Kalpana', query: 'Kalpana', lang: 'Hindi (India)', type: 'SAPI / OneCore' },
  { name: 'Microsoft Hemant', query: 'Hemant', lang: 'Hindi (India)', type: 'SAPI / OneCore' },
];

const PRESET_PHRASES = [
  { label: 'English Greeting', text: 'Hello! I am your intelligent companion living inside Island.' },
  { label: 'Hindi / Hinglish', text: 'Namaste! Main aapka Island companion hoon, kaho kya haal chaal hai?' },
  { label: 'Short Response', text: 'All systems are running smoothly on your desktop.' },
];

function base64ToArrayBuffer(base64) {
  const binaryString = window.atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

export default function WindowsVoicePreview({ onClose }) {
  const [voices, setVoices] = useState([]);
  const [selectedVoiceURI, setSelectedVoiceURI] = useState(() => localStorage.getItem('island_windows_voice_uri') || '');
  const [previewText, setPreviewText] = useState(PRESET_PHRASES[0].text);
  const [rate, setRate] = useState(1.0);
  const [pitch, setPitch] = useState(1.0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [filterQuery, setFilterQuery] = useState('');
  const [previewStatus, setPreviewStatus] = useState(null);

  const activeUtteranceRef = useRef(null);
  const audioContextRef = useRef(null);
  const sourceNodeRef = useRef(null);

  // Enumerate voices: prioritize native Windows SAPI service, fallback to Web Speech
  useEffect(() => {
    let isMounted = true;

    const loadVoices = async () => {
      let loaded = [];
      if (window.island?.windowsTts?.getVoices) {
        try {
          const res = await window.island.windowsTts.getVoices();
          if (res?.ok && res.voices?.length > 0) {
            loaded = res.voices;
          }
        } catch {}
      }

      if (loaded.length === 0 && typeof window !== 'undefined' && window.speechSynthesis) {
        loaded = window.speechSynthesis.getVoices() || [];
        if (loaded.length === 0) {
          await new Promise((r) => setTimeout(r, 200));
          loaded = window.speechSynthesis.getVoices() || [];
        }
      }

      if (isMounted && loaded.length > 0) {
        setVoices(loaded);
        const saved = localStorage.getItem('island_windows_voice_uri');
        if (saved && loaded.some((v) => v.voiceURI === saved)) {
          setSelectedVoiceURI(saved);
        } else {
          const defaultVoice = loaded.find((v) => v.default) || loaded[0];
          setSelectedVoiceURI(defaultVoice.voiceURI);
          localStorage.setItem('island_windows_voice_uri', defaultVoice.voiceURI);
        }
      }
    };

    loadVoices();

    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }

    return () => {
      isMounted = false;
      if (sourceNodeRef.current) {
        try { sourceNodeRef.current.stop(); } catch {}
        sourceNodeRef.current = null;
      }
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        try { audioContextRef.current.close(); } catch {}
      }
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
      if (window.island?.windowsTts?.cancel) {
        window.island.windowsTts.cancel();
      }
    };
  }, []);

  const handleSpeak = async () => {
    if (!previewText.trim()) return;

    handleStop();
    setIsPlaying(true);
    setPreviewStatus('Synthesizing speech...');

    // 1. Try Native Windows SAPI TTS Service
    if (window.island?.windowsTts?.synthesizeSpeech) {
      try {
        const res = await window.island.windowsTts.synthesizeSpeech({
          text: previewText,
          voice: selectedVoiceURI,
          rate: Math.round((rate - 1.0) * 5), // Map 0.5-2.0 to SAPI -10 to +10
        });

        if (res?.ok && res.audioBase64) {
          setPreviewStatus(`Playing via Windows SAPI (${res.durationMs}ms)...`);
          let ctx = audioContextRef.current;
          if (!ctx || ctx.state === 'closed') {
            ctx = new (window.AudioContext || window.webkitAudioContext)();
            audioContextRef.current = ctx;
          }
          if (ctx.state === 'suspended') {
            await ctx.resume();
          }

          const arrayBuf = base64ToArrayBuffer(res.audioBase64);
          const audioBuffer = await ctx.decodeAudioData(arrayBuf);
          const source = ctx.createBufferSource();
          source.buffer = audioBuffer;
          source.connect(ctx.destination);
          sourceNodeRef.current = source;

          source.onended = () => {
            setIsPlaying(false);
            setPreviewStatus('Playback finished');
            sourceNodeRef.current = null;
          };

          source.start(0);
          return;
        } else {
          setPreviewStatus(`Native synthesis error: ${res?.error || 'Unknown error'}`);
        }
      } catch (err) {
        setPreviewStatus(`Native synthesis failed: ${err.message}`);
      }
    }

    // 2. Fallback to Web Speech API
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      const avail = window.speechSynthesis.getVoices() || [];
      if (avail.length === 0) {
        setIsPlaying(false);
        setPreviewStatus('No speech voices available in Web Speech API');
        return;
      }

      window.speechSynthesis.cancel();
      window.speechSynthesis.resume();

      setTimeout(() => {
        const utterance = new SpeechSynthesisUtterance(previewText);
        activeUtteranceRef.current = utterance;
        const chosen = avail.find((v) => v.voiceURI === selectedVoiceURI);
        if (chosen) utterance.voice = chosen;
        utterance.rate = rate;
        utterance.pitch = pitch;

        utterance.onstart = () => {
          setIsPlaying(true);
          setPreviewStatus('Speaking via Web Speech...');
        };
        utterance.onend = () => {
          setIsPlaying(false);
          setPreviewStatus('Playback finished');
          activeUtteranceRef.current = null;
        };
        utterance.onerror = (e) => {
          setIsPlaying(false);
          setPreviewStatus(`Speech error: ${e?.error || 'Utterance failed'}`);
          activeUtteranceRef.current = null;
        };

        window.speechSynthesis.speak(utterance);
      }, 50);
    } else {
      setIsPlaying(false);
      setPreviewStatus('Speech synthesis is not supported in this environment');
    }
  };

  const handleStop = () => {
    if (sourceNodeRef.current) {
      try { sourceNodeRef.current.stop(); } catch {}
      sourceNodeRef.current = null;
    }
    if (window.island?.windowsTts?.cancel) {
      window.island.windowsTts.cancel();
    }
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    setIsPlaying(false);
    setPreviewStatus(null);
  };

  const filteredVoices = voices.filter((v) => {
    if (!filterQuery) return true;
    const q = filterQuery.toLowerCase();
    return v.name.toLowerCase().includes(q) || v.lang.toLowerCase().includes(q);
  });

  return (
    <div className="voice-preview-modal" role="dialog" aria-label="Windows Voice Discovery and Preview">
      <div className="voice-preview-card">
        {/* Header */}
        <div className="voice-preview-header">
          <div className="voice-preview-title-group">
            <span className="voice-preview-badge">Local Engine</span>
            <h3 className="voice-preview-title">Windows Voice Discovery</h3>
          </div>
          {onClose && (
            <button
              type="button"
              className="voice-preview-close"
              onClick={() => {
                handleStop();
                onClose();
              }}
              aria-label="Close voice preview"
            >
              <Icon.Close width={14} height={14} />
            </button>
          )}
        </div>

        {/* Discovery Summary Checklist */}
        <div className="voice-preview-target-box">
          <div className="voice-preview-subheading">Requested Voice Availability Audit:</div>
          <div className="voice-target-grid">
            {TARGET_VOICES.map((t) => {
              const matched = voices.find((v) => v.name.toLowerCase().includes(t.query.toLowerCase()));
              const isNarratorNatural = t.type.includes('Natural');
              return (
                <div key={t.name} className={`voice-target-chip ${matched ? 'is-available' : 'is-unavailable'}`}>
                  <div className="voice-target-info">
                    <span className="voice-target-name">{t.name}</span>
                    <span className="voice-target-meta">{t.lang} • {t.type}</span>
                  </div>
                  <span className={`voice-target-status ${matched ? 'status-ok' : 'status-missing'}`}>
                    {matched ? (
                      '✓ Available (Local)'
                    ) : isNarratorNatural ? (
                      '✗ Not Exposed to Web/Electron'
                    ) : (
                      '✗ Not Installed'
                    )}
                  </span>
                </div>
              );
            })}
          </div>
          <p className="voice-target-note">
            <strong>Note on Narrator Natural Voices:</strong> Windows 11 Narrator "Natural" voices (such as Neerja Natural) use a proprietary cloud/MediaFoundation subsystem that Microsoft does not expose to Chromium/Electron <code>speechSynthesis</code>. Local SAPI & OneCore voices (Heera, Ravi, David, Zira, Mark) are fully accessible.
          </p>
        </div>

        {/* Controls: Voice Selection */}
        <div className="voice-preview-section">
          <div className="voice-preview-field">
            <div className="voice-preview-label-row">
              <label htmlFor="voice-select" className="voice-preview-label">
                Select Installed Voice ({voices.length} found)
              </label>
              <input
                type="text"
                className="voice-search-input"
                placeholder="Filter voices..."
                value={filterQuery}
                onChange={(e) => setFilterQuery(e.target.value)}
              />
            </div>
            <select
              id="voice-select"
              className="voice-preview-select"
              value={selectedVoiceURI}
              onChange={(e) => {
                const val = e.target.value;
                setSelectedVoiceURI(val);
                localStorage.setItem('island_windows_voice_uri', val);
                if (isPlaying) handleStop();
              }}
            >
              {filteredVoices.map((v) => (
                <option key={v.voiceURI} value={v.voiceURI}>
                  {v.name} [{v.lang}] {v.localService ? '(Local)' : '(Network)'} {v.default ? '★' : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Test Phrase Picker */}
          <div className="voice-preview-field">
            <label className="voice-preview-label">Sample Phrase</label>
            <div className="voice-phrase-chips">
              {PRESET_PHRASES.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  className={`voice-phrase-chip ${previewText === p.text ? 'is-active' : ''}`}
                  onClick={() => setPreviewText(p.text)}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <textarea
              className="voice-preview-textarea"
              rows={2}
              value={previewText}
              onChange={(e) => setPreviewText(e.target.value)}
              placeholder="Enter custom speech text to test..."
            />
          </div>

          {/* Sliders: Rate & Pitch */}
          <div className="voice-preview-sliders">
            <div className="voice-slider-item">
              <div className="voice-slider-header">
                <span>Rate ({rate.toFixed(1)}x)</span>
                <button type="button" className="voice-slider-reset" onClick={() => setRate(1.0)}>Reset</button>
              </div>
              <input
                type="range"
                min="0.5"
                max="2.0"
                step="0.1"
                value={rate}
                onChange={(e) => setRate(parseFloat(e.target.value))}
              />
            </div>

            <div className="voice-slider-item">
              <div className="voice-slider-header">
                <span>Pitch ({pitch.toFixed(1)})</span>
                <button type="button" className="voice-slider-reset" onClick={() => setPitch(1.0)}>Reset</button>
              </div>
              <input
                type="range"
                min="0.5"
                max="1.5"
                step="0.1"
                value={pitch}
                onChange={(e) => setPitch(parseFloat(e.target.value))}
              />
            </div>
          </div>

          {/* Action Buttons */}
          <div className="voice-preview-actions">
            <button
              type="button"
              className={`voice-preview-play-btn ${isPlaying ? 'is-speaking' : ''}`}
              onClick={handleSpeak}
              disabled={voices.length === 0}
            >
              <Icon.Play width={14} height={14} />
              <span>{isPlaying ? 'Speaking...' : 'Preview Voice'}</span>
            </button>

            <button
              type="button"
              className="voice-preview-stop-btn"
              onClick={handleStop}
              disabled={!isPlaying}
            >
              <Icon.Pause width={14} height={14} />
              <span>Stop</span>
            </button>
          </div>

          {previewStatus && (
            <div style={{ marginTop: 8, fontSize: 11, color: 'var(--panel-accent)', textAlign: 'center' }}>
              {previewStatus}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
