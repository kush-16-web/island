import React, { useEffect, useState, useRef } from 'react';
import { Icon } from './icons';

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

export default function WindowsVoicePreview({ onClose }) {
  const [voices, setVoices] = useState([]);
  const [selectedVoiceURI, setSelectedVoiceURI] = useState('');
  const [previewText, setPreviewText] = useState(PRESET_PHRASES[0].text);
  const [rate, setRate] = useState(1.0);
  const [pitch, setPitch] = useState(1.0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [filterQuery, setFilterQuery] = useState('');

  // Enumerate voices
  useEffect(() => {
    const updateVoices = () => {
      if (typeof window === 'undefined' || !window.speechSynthesis) return;
      const list = window.speechSynthesis.getVoices() || [];
      setVoices(list);
      if (list.length > 0 && !selectedVoiceURI) {
        // Default to an Indian English or local voice if present, else first
        const indianVoice = list.find((v) => v.lang.includes('IN') || v.name.includes('India') || v.name.includes('Heera') || v.name.includes('Ravi'));
        setSelectedVoiceURI(indianVoice ? indianVoice.voiceURI : list[0].voiceURI);
      }
    };

    updateVoices();
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.onvoiceschanged = updateVoices;
    }

    return () => {
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const activeUtteranceRef = useRef(null);

  const handleSpeak = () => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    window.speechSynthesis.resume();

    if (!previewText.trim()) return;

    // Small delay avoids Chromium race condition where cancel() kills immediately subsequent speak()
    setTimeout(() => {
      if (typeof window === 'undefined' || !window.speechSynthesis) return;

      const utterance = new SpeechSynthesisUtterance(previewText);
      activeUtteranceRef.current = utterance; // Prevent GC in Chromium
      const chosen = voices.find((v) => v.voiceURI === selectedVoiceURI);
      if (chosen) {
        utterance.voice = chosen;
      }
      utterance.rate = rate;
      utterance.pitch = pitch;

      utterance.onstart = () => setIsPlaying(true);
      utterance.onend = () => {
        setIsPlaying(false);
        activeUtteranceRef.current = null;
      };
      utterance.onerror = (e) => {
        console.warn('[Windows TTS Error]', e);
        setIsPlaying(false);
        activeUtteranceRef.current = null;
      };

      window.speechSynthesis.speak(utterance);
    }, 60);
  };

  const handleStop = () => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    setIsPlaying(false);
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
                setSelectedVoiceURI(e.target.value);
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
        </div>
      </div>
    </div>
  );
}
