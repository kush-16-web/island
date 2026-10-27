import React, { useEffect, useState, useRef } from 'react';
import { Icon } from '../icons';

const PRESET_PHRASES = [
  { label: 'Music Action Confirmation', text: 'Playing São Paulo by The Weeknd from your favorites.' },
  { label: 'Companion Greeting', text: 'Hello! I am your local voice companion living right inside Island.' },
  { label: 'Quick Response', text: 'Paused playback. Let me know when you want to continue.' },
];

export default function KokoroPreview({ onClose }) {
  const [status, setStatus] = useState({
    installed: false,
    isLoaded: false,
    isLoading: false,
    currentVoice: 'af_heart',
    availableFemaleVoices: [],
    metrics: {},
  });
  const [selectedVoice, setSelectedVoice] = useState('af_heart');
  const [inputText, setInputText] = useState(PRESET_PHRASES[0].text);
  const [speed, setSpeed] = useState(1.0);
  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);

  const audioRef = useRef(null);

  // Poll status on mount
  useEffect(() => {
    let alive = true;
    if (window.island?.kokoro?.getStatus) {
      window.island.kokoro.getStatus().then((st) => {
        if (!alive) return;
        setStatus(st);
        if (st.availableFemaleVoices?.length > 0 && !selectedVoice) {
          setSelectedVoice(st.availableFemaleVoices[0].id);
        }
      }).catch((err) => {
        if (alive) setErrorMsg(`Could not check Kokoro status: ${err.message}`);
      });
    }

    return () => {
      alive = false;
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
    };
  }, []);

  const handleInstall = async () => {
    if (!window.island?.kokoro?.installModel) return;
    setInstalling(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await window.island.kokoro.installModel();
      if (!res.ok) {
        setErrorMsg(res.error || 'Failed to install Kokoro model.');
      } else {
        setSuccessMsg('Kokoro ONNX model installed and cached successfully!');
        const st = await window.island.kokoro.getStatus();
        setStatus(st);
      }
    } catch (err) {
      setErrorMsg(`Installation error: ${err.message}`);
    } finally {
      setInstalling(false);
    }
  };

  const handleSynthesize = async () => {
    if (!window.island?.kokoro?.synthesize) return;
    if (!inputText.trim()) return;

    setIsSynthesizing(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await window.island.kokoro.synthesize({
        text: inputText.trim(),
        voice: selectedVoice,
        speed,
      });

      if (!res.ok) {
        setErrorMsg(res.error || 'Kokoro synthesis failed.');
      } else {
        // Update benchmark metrics
        setStatus((prev) => ({
          ...prev,
          isLoaded: true,
          metrics: { ...res.metrics },
        }));

        // Convert base64 audio to Blob URL and play
        const byteCharacters = atob(res.audioBase64);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: 'audio/wav' });

        if (audioUrl) URL.revokeObjectURL(audioUrl);
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);

        if (audioRef.current) {
          audioRef.current.src = url;
          audioRef.current.play().catch(() => {});
        }
      }
    } catch (err) {
      setErrorMsg(`Synthesis failure: ${err.message}`);
    } finally {
      setIsSynthesizing(false);
    }
  };

  const handleCancel = async () => {
    if (window.island?.kokoro?.cancel) {
      await window.island.kokoro.cancel();
      setIsSynthesizing(false);
    }
    if (audioRef.current) {
      audioRef.current.pause();
    }
  };

  const handleDispose = async () => {
    if (window.island?.kokoro?.dispose) {
      await window.island.kokoro.dispose();
      const st = await window.island.kokoro.getStatus();
      setStatus(st);
      setSuccessMsg('Kokoro model resources released from memory.');
    }
  };

  const femaleVoices = status.availableFemaleVoices || [
    { id: 'af_heart', name: 'Heart (Warm & Expressive)', lang: 'en-us' },
    { id: 'af_bella', name: 'Bella (Clear & Cheerful)', lang: 'en-us' },
    { id: 'af_nicole', name: 'Nicole (Calm & Natural)', lang: 'en-us' },
    { id: 'af_sarah', name: 'Sarah (Crisp & Friendly)', lang: 'en-us' },
    { id: 'af_sky', name: 'Sky (Gentle & Smooth)', lang: 'en-us' },
  ];

  return (
    <div className="voice-preview-modal" role="dialog" aria-label="Kokoro Local TTS Prototype">
      <div className="voice-preview-card" style={{ maxWidth: '580px' }}>
        {/* Header */}
        <div className="voice-preview-header">
          <div className="voice-preview-title-group">
            <span className="voice-preview-badge" style={{ background: '#ec4899', color: '#fff' }}>
              Local Prototype
            </span>
            <h3 className="voice-preview-title">Kokoro Local TTS (CPU ONNX)</h3>
          </div>
          {onClose && (
            <button
              type="button"
              className="voice-preview-close"
              onClick={() => {
                handleCancel();
                onClose();
              }}
              aria-label="Close Kokoro Prototype"
            >
              <Icon.Close width={16} height={16} />
            </button>
          )}
        </div>

        {/* Installation & Status Banner */}
        <div className="kokoro-status-banner" style={{ margin: '14px 16px 8px 16px', padding: '12px 14px', borderRadius: '10px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  background: status.installed ? '#22c55e' : '#f59e0b',
                }}
              />
              <span style={{ fontSize: '13px', fontWeight: 600 }}>
                {status.installed ? (status.isLoaded ? 'Model Loaded in RAM' : 'Model Installed & Ready') : 'Model Weights Not Installed'}
              </span>
            </div>
            {status.installed && (
              <button
                type="button"
                className="icon-btn"
                onClick={handleDispose}
                title="Free memory (Unload model from RAM)"
                style={{ fontSize: '11px', padding: '4px 8px', borderRadius: '6px', background: 'rgba(255,255,255,0.1)' }}
              >
                Free RAM
              </button>
            )}
          </div>

          {!status.installed && (
            <div>
              <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.7)', margin: '0 0 10px 0', lineHeight: 1.4 }}>
                Kokoro requires a lightweight quantized CPU model (q8 ~85MB). In accordance with privacy rules, no model weights are downloaded automatically. Click below to download and cache locally.
              </p>
              <button
                type="button"
                className="btn-primary"
                onClick={handleInstall}
                disabled={installing}
                style={{ fontSize: '12px', padding: '6px 14px', borderRadius: '8px', background: '#ec4899', color: '#fff', border: 'none', cursor: 'pointer' }}
              >
                {installing ? 'Downloading Kokoro (q8)...' : 'Install Kokoro Model Weights'}
              </button>
            </div>
          )}
        </div>

        {/* Alerts */}
        {errorMsg && (
          <div style={{ margin: '8px 16px', padding: '10px 12px', borderRadius: '8px', background: 'rgba(239, 68, 68, 0.2)', border: '1px solid rgba(239, 68, 68, 0.4)', color: '#fca5a5', fontSize: '12px' }}>
            <strong>Error:</strong> {errorMsg}
          </div>
        )}
        {successMsg && (
          <div style={{ margin: '8px 16px', padding: '10px 12px', borderRadius: '8px', background: 'rgba(34, 197, 94, 0.2)', border: '1px solid rgba(34, 197, 94, 0.4)', color: '#86efac', fontSize: '12px' }}>
            {successMsg}
          </div>
        )}

        {/* Voice Selector */}
        <div style={{ padding: '0 16px', marginTop: '10px' }}>
          <label style={{ fontSize: '12px', fontWeight: 500, color: 'rgba(255,255,255,0.7)', display: 'block', marginBottom: '6px' }}>
            Female Voice Model
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: '8px' }}>
            {femaleVoices.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => setSelectedVoice(v.id)}
                style={{
                  padding: '8px 10px',
                  borderRadius: '8px',
                  border: selectedVoice === v.id ? '1px solid #ec4899' : '1px solid rgba(255,255,255,0.1)',
                  background: selectedVoice === v.id ? 'rgba(236, 72, 153, 0.2)' : 'rgba(255,255,255,0.03)',
                  color: selectedVoice === v.id ? '#fff' : 'rgba(255,255,255,0.7)',
                  fontSize: '11px',
                  fontWeight: selectedVoice === v.id ? 600 : 400,
                  cursor: 'pointer',
                  textAlign: 'center',
                }}
              >
                {v.id.replace('af_', '')}
              </button>
            ))}
          </div>
        </div>

        {/* Preset & Input Text */}
        <div style={{ padding: '0 16px', marginTop: '12px' }}>
          <div style={{ display: 'flex', gap: '6px', marginBottom: '8px', overflowX: 'auto', paddingBottom: '4px' }}>
            {PRESET_PHRASES.map((p, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setInputText(p.text)}
                style={{
                  fontSize: '11px',
                  padding: '4px 8px',
                  borderRadius: '6px',
                  border: '1px solid rgba(255,255,255,0.1)',
                  background: 'rgba(255,255,255,0.05)',
                  color: 'rgba(255,255,255,0.8)',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                {p.label}
              </button>
            ))}
          </div>

          <textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            rows={2}
            style={{
              width: '100%',
              borderRadius: '8px',
              padding: '8px 10px',
              fontSize: '12px',
              background: 'rgba(0,0,0,0.3)',
              color: '#fff',
              border: '1px solid rgba(255,255,255,0.15)',
              resize: 'none',
              boxSizing: 'border-box',
            }}
            placeholder="Type text for Kokoro to synthesize..."
          />
        </div>

        {/* Speed Slider */}
        <div style={{ padding: '0 16px', marginTop: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.6)' }}>Speed: {speed.toFixed(1)}x</span>
          <input
            type="range"
            min="0.7"
            max="1.5"
            step="0.1"
            value={speed}
            onChange={(e) => setSpeed(parseFloat(e.target.value))}
            style={{ width: '120px' }}
          />
        </div>

        {/* Benchmark Metrics Grid */}
        <div style={{ margin: '14px 16px', padding: '10px 12px', borderRadius: '8px', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
            Benchmark Metrics (CPU)
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '6px', textAlign: 'center' }}>
            <div style={{ padding: '6px 4px', background: 'rgba(255,255,255,0.03)', borderRadius: '6px' }}>
              <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)' }}>Cold Start</div>
              <div style={{ fontSize: '12px', fontWeight: 600, color: '#38bdf8' }}>
                {status.metrics.coldStartMs ? `${status.metrics.coldStartMs}ms` : '—'}
              </div>
            </div>
            <div style={{ padding: '6px 4px', background: 'rgba(255,255,255,0.03)', borderRadius: '6px' }}>
              <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)' }}>Warm Start</div>
              <div style={{ fontSize: '12px', fontWeight: 600, color: '#38bdf8' }}>
                {status.metrics.warmStartMs ? `${status.metrics.warmStartMs}ms` : '—'}
              </div>
            </div>
            <div style={{ padding: '6px 4px', background: 'rgba(255,255,255,0.03)', borderRadius: '6px' }}>
              <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)' }}>Synthesis</div>
              <div style={{ fontSize: '12px', fontWeight: 600, color: '#a855f7' }}>
                {status.metrics.synthesisMs ? `${status.metrics.synthesisMs}ms` : '—'}
              </div>
            </div>
            <div style={{ padding: '6px 4px', background: 'rgba(255,255,255,0.03)', borderRadius: '6px' }}>
              <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)' }}>Memory Diff</div>
              <div style={{ fontSize: '12px', fontWeight: 600, color: '#10b981' }}>
                {status.metrics.memoryUsedMb ? `${status.metrics.memoryUsedMb}MB` : '—'}
              </div>
            </div>
            <div style={{ padding: '6px 4px', background: 'rgba(255,255,255,0.03)', borderRadius: '6px' }}>
              <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)' }}>Audio Length</div>
              <div style={{ fontSize: '12px', fontWeight: 600, color: '#f59e0b' }}>
                {status.metrics.audioDurationSec ? `${status.metrics.audioDurationSec}s` : '—'}
              </div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div style={{ padding: '0 16px 16px 16px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px' }}>
          <button
            type="button"
            className="icon-btn"
            onClick={handleCancel}
            disabled={!isSynthesizing}
            style={{ fontSize: '12px', padding: '6px 14px', borderRadius: '8px', background: 'rgba(255,255,255,0.08)', color: '#fff', border: 'none', cursor: 'pointer' }}
          >
            Stop / Cancel
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={handleSynthesize}
            disabled={isSynthesizing || installing || !status.installed}
            style={{
              fontSize: '12px',
              padding: '6px 16px',
              borderRadius: '8px',
              background: '#ec4899',
              color: '#fff',
              border: 'none',
              cursor: status.installed ? 'pointer' : 'not-allowed',
              opacity: status.installed ? 1 : 0.5,
              fontWeight: 600,
            }}
          >
            {isSynthesizing ? 'Synthesizing (CPU)...' : 'Synthesize & Play'}
          </button>
        </div>

        {/* Hidden Audio Player */}
        <audio ref={audioRef} style={{ display: 'none' }} />
      </div>
    </div>
  );
}
