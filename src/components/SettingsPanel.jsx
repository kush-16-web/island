import React, { useEffect, useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { SPRING } from '../lib/motion';
import { Switch } from './bits';
import { Icon } from './icons';
import WindowsVoicePreview from './WindowsVoicePreview';
import { getAssistantName, setAssistantName } from '../lib/assistant';

/**
 * SettingsPanel: Apple-inspired desktop preferences for Dynamic Island.
 * Features Framer Motion gliding pill, Lucide animated icons, dynamic album-tinted accents,
 * and clean typography without cluttered AI badge boxes.
 */
export default function SettingsPanel({ accentColor }) {
  const [currentPreset, setCurrentPreset] = useState('center');
  const [currentEdge, setCurrentEdge] = useState('top');
  const [dockMode, setDockMode] = useState('smart');
  const [snapThreshold, setSnapThreshold] = useState(85);
  const [autohideIsland, setAutohideIsland] = useState(true);
  const [autohidePet, setAutohidePet] = useState(true);
  const [userName, setUserName] = useState(() => {
    try {
      return localStorage.getItem('island_user_name') || 'Friend';
    } catch {
      return 'Friend';
    }
  });
  const [assistantName, setAssistantNameInput] = useState(() => getAssistantName());
  const [lyricsOffset, setLyricsOffset] = useState(() => {
    try {
      const saved = localStorage.getItem('island_lyrics_offset');
      return saved !== null ? Number(saved) : 0;
    } catch {
      return 0;
    }
  });
  const [showVoiceDiscovery, setShowVoiceDiscovery] = useState(false);
  const [vadSilenceMs, setVadSilenceMs] = useState(() => {
    try {
      return Number(localStorage.getItem('island_vad_silence_ms')) || 1400;
    } catch {
      return 1400;
    }
  });

  // AI Assistant Voice Engine & Kokoro local configuration
  const [voiceEngine, setVoiceEngine] = useState(() => {
    return localStorage.getItem('island_voice_engine') || 'gemini';
  });
  const [kokoroVoice, setKokoroVoice] = useState(() => {
    return localStorage.getItem('island_kokoro_voice') || 'af_heart';
  });
  const [allowCloudFallback, setAllowCloudFallback] = useState(() => {
    return localStorage.getItem('island_voice_cloud_fallback') === 'true';
  });
  const [kokoroStatus, setKokoroStatus] = useState({ installed: false, isLoaded: false });
  const [isInstallingKokoro, setIsInstallingKokoro] = useState(false);
  const [kokoroMsg, setKokoroMsg] = useState(null);
  const [kokoroError, setKokoroError] = useState(null);
  const [isTestingVoice, setIsTestingVoice] = useState(false);
  const previewAudioRef = useRef(null);

  // Multi-Provider AI Assistant configuration
  const [chatProvider, setChatProvider] = useState(() => {
    return localStorage.getItem('island_chat_provider') || 'gemini';
  });
  const [groqChatModel, setGroqChatModel] = useState(() => {
    return localStorage.getItem('island_groq_chat_model') || 'llama-3.1-8b-instant';
  });
  const [sttProvider, setSttProvider] = useState(() => {
    return localStorage.getItem('island_stt_provider') || 'gemini';
  });
  const [groqWhisperModel, setGroqWhisperModel] = useState(() => {
    return localStorage.getItem('island_groq_whisper_model') || 'whisper-large-v3-turbo';
  });
  const [groqStatus, setGroqStatus] = useState({ hasKey: false, keyMasked: null });
  const [groqKeyInput, setGroqKeyInput] = useState('');
  const [groqKeyMsg, setGroqKeyMsg] = useState(null);
  const [groqKeyError, setGroqKeyError] = useState(null);
  const [isSavingGroqKey, setIsSavingGroqKey] = useState(false);

  useEffect(() => {
    window.island?.getWindowDock?.().then((res) => {
      if (res?.preset) setCurrentPreset(res.preset);
      if (res?.edge) setCurrentEdge(res.edge);
    });
    window.island?.getDockMode?.().then((res) => {
      if (res) setDockMode(res);
    });
    window.island?.getSnapThreshold?.().then((res) => {
      if (typeof res === 'number') setSnapThreshold(res);
    });
    window.island?.getAutohide?.().then((res) => {
      if (typeof res === 'boolean') setAutohideIsland(res);
    });
    window.island?.getAutohidePet?.().then((res) => {
      if (typeof res === 'boolean') setAutohidePet(res);
    });

    if (window.island?.kokoro?.getStatus) {
      window.island.kokoro.getStatus().then((st) => {
        if (st) setKokoroStatus(st);
      }).catch(() => {});
    }

    if (window.island?.groq?.getStatus) {
      window.island.groq.getStatus().then((st) => {
        if (st) setGroqStatus(st);
      }).catch(() => {});
    }

    if (window.island?.on) {
      return window.island.on('window:dock-changed', (snapped) => {
        if (snapped?.preset) setCurrentPreset(snapped.preset);
        if (snapped?.edge) setCurrentEdge(snapped.edge);
      });
    }
  }, []);

  // Cleanup preview audio on unmount
  useEffect(() => {
    return () => {
      if (previewAudioRef.current) {
        previewAudioRef.current.pause();
        previewAudioRef.current = null;
      }
    };
  }, []);

  const handleAssistantNameChange = (val) => {
    const clean = val.slice(0, 24);
    setAssistantNameInput(clean);
    setAssistantName(clean);
  };

  const handleSetChatProvider = (p) => {
    setChatProvider(p);
    localStorage.setItem('island_chat_provider', p);
    localStorage.setItem('island_voice_provider', p);
    window.dispatchEvent(new CustomEvent('island:ai-provider-changed', { detail: { chatProvider: p } }));
  };

  const handleSetGroqChatModel = (m) => {
    setGroqChatModel(m);
    localStorage.setItem('island_groq_chat_model', m);
  };

  const handleSetSttProvider = (p) => {
    setSttProvider(p);
    localStorage.setItem('island_stt_provider', p);
    window.dispatchEvent(new CustomEvent('island:ai-provider-changed', { detail: { sttProvider: p } }));
  };

  const handleSetGroqWhisperModel = (m) => {
    setGroqWhisperModel(m);
    localStorage.setItem('island_groq_whisper_model', m);
  };

  const handleSaveGroqKey = async () => {
    if (!groqKeyInput.trim()) return;
    setIsSavingGroqKey(true);
    setGroqKeyMsg(null);
    setGroqKeyError(null);
    try {
      const res = await window.island?.groq?.setKey({ key: groqKeyInput.trim() });
      if (res?.ok) {
        setGroqKeyMsg('Groq API Key saved securely. Groq Chat & Whisper activated.');
        setGroqKeyInput('');
        const st = await window.island?.groq?.getStatus();
        if (st) setGroqStatus(st);
        handleSetChatProvider('groq');
        handleSetSttProvider('groq-whisper');
      } else {
        setGroqKeyError(res?.error || 'Failed to save key.');
      }
    } catch (e) {
      setGroqKeyError(e?.message || 'Error saving key');
    } finally {
      setIsSavingGroqKey(false);
    }
  };

  const handleClearGroqKey = async () => {
    setGroqKeyMsg(null);
    setGroqKeyError(null);
    try {
      const res = await window.island?.groq?.clearKey();
      if (res?.ok) {
        setGroqKeyMsg('Groq API Key removed.');
        const st = await window.island?.groq?.getStatus();
        if (st) setGroqStatus(st);
      }
    } catch (e) {
      setGroqKeyError(e?.message || 'Error clearing key');
    }
  };

  const handleSetVoiceEngine = (engine) => {
    setVoiceEngine(engine);
    localStorage.setItem('island_voice_engine', engine);
    setKokoroMsg(null);
    setKokoroError(null);
  };

  const handleSetKokoroVoice = (voice) => {
    setKokoroVoice(voice);
    localStorage.setItem('island_kokoro_voice', voice);
  };

  const handleToggleCloudFallback = (allowed) => {
    setAllowCloudFallback(allowed);
    localStorage.setItem('island_voice_cloud_fallback', allowed ? 'true' : 'false');
  };

  const handleInstallKokoro = async () => {
    if (!window.island?.kokoro?.installModel) return;
    setIsInstallingKokoro(true);
    setKokoroMsg('Downloading lightweight CPU model (q8 ~85MB)...');
    setKokoroError(null);
    try {
      const res = await window.island.kokoro.installModel();
      if (res?.ok) {
        setKokoroMsg('Kokoro model installed successfully.');
        const st = await window.island.kokoro.getStatus();
        if (st) setKokoroStatus(st);
      } else {
        setKokoroError(res?.error || 'Installation failed.');
        setKokoroMsg(null);
      }
    } catch (e) {
      setKokoroError(e.message || 'Error installing Kokoro model.');
      setKokoroMsg(null);
    } finally {
      setIsInstallingKokoro(false);
    }
  };

  const handleFreeKokoroRam = async () => {
    if (!window.island?.kokoro?.dispose) return;
    await window.island.kokoro.dispose();
    const st = await window.island.kokoro.getStatus();
    if (st) setKokoroStatus(st);
    setKokoroMsg('Kokoro model unloaded from RAM.');
  };

  const handleTestKokoroVoice = async () => {
    if (isTestingVoice) {
      if (previewAudioRef.current) {
        previewAudioRef.current.pause();
        previewAudioRef.current = null;
      }
      setIsTestingVoice(false);
      return;
    }

    if (!kokoroStatus.installed) {
      setKokoroError('Please install model weights first to preview Kokoro.');
      return;
    }

    setIsTestingVoice(true);
    setKokoroError(null);
    setKokoroMsg('Synthesizing voice preview...');

    try {
      const res = await window.island?.kokoro?.synthesize({
        text: 'Hello! I am your local voice companion living right inside Island.',
        voice: kokoroVoice,
        speed: 1.0,
      });

      if (!res?.ok || !res?.audioBase64) {
        setKokoroError(res?.error || 'Synthesis preview failed.');
        setKokoroMsg(null);
        setIsTestingVoice(false);
        return;
      }

      setKokoroMsg(null);
      const byteChars = atob(res.audioBase64);
      const byteNums = new Array(byteChars.length);
      for (let i = 0; i < byteChars.length; i++) {
        byteNums[i] = byteChars.charCodeAt(i);
      }
      const blob = new Blob([new Uint8Array(byteNums)], { type: 'audio/wav' });
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      previewAudioRef.current = audio;

      audio.onended = () => {
        setIsTestingVoice(false);
        URL.revokeObjectURL(url);
      };
      audio.onerror = () => {
        setIsTestingVoice(false);
        URL.revokeObjectURL(url);
      };

      await audio.play();
    } catch (err) {
      setKokoroError(err.message || 'Error playing preview.');
      setIsTestingVoice(false);
    }
  };

  const handleSetDockMode = (mode) => {
    setDockMode(mode);
    window.island?.setDockMode?.(mode);
  };

  const handleSetSnapThreshold = (val) => {
    setSnapThreshold(val);
    window.island?.setSnapThreshold?.(val);
  };

  const handleSetLyricsOffset = (offset) => {
    setLyricsOffset(offset);
    localStorage.setItem('island_lyrics_offset', String(offset));
    window.dispatchEvent(new CustomEvent('island:lyrics-offset-changed'));
  };

  const handleSetEdge = (edge) => {
    setCurrentEdge(edge);
    const defaultPreset = edge === 'top' || edge === 'bottom' ? 'center' : 'middle';
    setCurrentPreset(defaultPreset);
    window.island?.setWindowPreset?.({ preset: defaultPreset, edge });
  };

  const handleSetPreset = (preset) => {
    setCurrentPreset(preset);
    window.island?.setWindowPreset?.({ preset, edge: currentEdge });
  };

  const handleToggleAutohideIsland = (next) => {
    setAutohideIsland(next);
    window.island?.setAutohide?.(next);
  };

  const handleToggleAutohidePet = (next) => {
    setAutohidePet(next);
    window.island?.setAutohidePet?.(next);
  };

  const handleResetPos = () => {
    setCurrentEdge('top');
    setCurrentPreset('center');
    window.island?.resetWindowPos?.();
  };

  const isHorizontalEdge = currentEdge === 'top' || currentEdge === 'bottom';

  const MODES = [
    { id: 'smart', label: 'Smart Snapping', Glyph: Icon.Magnet, title: 'Edge magnetic snapping with free-space middle zone' },
    { id: 'free', label: 'Free Floating', Glyph: Icon.Move, title: 'Drop the Island anywhere with 100% full-screen freedom' },
    { id: 'always', label: 'Always Docked', Glyph: Icon.Layers, title: 'Lock Island firmly to a designated screen bezel' },
  ];

  return (
    <div className="settings-panel scroll" style={{ '--panel-accent': accentColor || 'var(--c-info)' }}>
      {/* Mode Segmented Controller with Framer Motion Gliding Pill */}
      <div className="settings-segmented">
        {MODES.map(({ id, label, Glyph, title }) => (
          <button
            key={id}
            type="button"
            className={`settings-segmented__item ${dockMode === id ? 'is-active' : ''}`}
            onClick={() => handleSetDockMode(id)}
            title={title}
          >
            {dockMode === id && (
              <motion.span
                layoutId="settings-dock-pill"
                className="settings-segmented__pill"
                transition={SPRING}
              />
            )}
            <span className="settings-segmented__label">
              <Glyph width={14} height={14} />
              <span>{label}</span>
            </span>
          </button>
        ))}
      </div>

      {/* Mode 1: Smart Snapping (Magnetic snap sensitivity & current dynamic anchor) */}
      {dockMode === 'smart' && (
        <div className="settings-group">
          <div className="settings-row">
            <div className="settings-row__text">
              <span className="settings-row__title">Magnetic Snap Range</span>
              <span className="settings-row__sub">Pulls to screen edges when close; floats freely in center area</span>
            </div>
            <div className="settings-chips">
              {[
                { label: 'Gentle (50px)', val: 50 },
                { label: 'Standard (85px)', val: 85 },
                { label: 'Strong (130px)', val: 130 },
              ].map((item) => (
                <button
                  key={item.val}
                  type="button"
                  className={`settings-chip ${snapThreshold === item.val ? 'is-active' : ''}`}
                  onClick={() => handleSetSnapThreshold(item.val)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div className="settings-divider" />

          <div className="settings-row">
            <div className="settings-row__text">
              <span className="settings-row__title">Current Dock Status</span>
              <span className="settings-row__sub">
                {currentEdge === 'free'
                  ? 'Floating in center open area'
                  : `Magnetically docked to ${currentEdge.toUpperCase()} (${currentPreset.toUpperCase()})`}
              </span>
            </div>
            <button
              type="button"
              className="settings-btn-inline"
              onClick={() => {
                handleSetEdge('top');
                handleSetPreset('center');
              }}
              title="Snap to Top Center"
            >
              <Icon.RotateCcw width={12} height={12} />
              <span>Snap to Top</span>
            </button>
          </div>
        </div>
      )}

      {/* Mode 2: Free Floating (100% unrestricted canvas) */}
      {dockMode === 'free' && (
        <div className="settings-group">
          <div className="settings-radar-card">
            <div className="settings-radar-preview" aria-hidden="true">
              <div className="settings-radar-screen">
                <div className="settings-radar-island" />
              </div>
            </div>
            <div className="settings-radar-info">
              <div className="settings-radar-header">
                <span className="settings-radar-title">Full-Screen Free Floating</span>
                <span className="settings-badge-live">Active</span>
              </div>
              <p className="settings-radar-desc">
                Drag and drop the Island anywhere from the top bezel to the taskbar. Zero edge locks or boundary blocks.
              </p>
              <div className="settings-radar-actions">
                <button
                  type="button"
                  className="settings-btn-action"
                  onClick={handleResetPos}
                  title="Snap back to Top Center"
                >
                  <Icon.RotateCcw width={12} height={12} />
                  <span>Center Display</span>
                </button>
                <button
                  type="button"
                  className="settings-btn-action settings-btn-action--secondary"
                  onClick={() => {
                    handleSetDockMode('always');
                    handleSetEdge('top');
                    handleSetPreset('center');
                  }}
                  title="Switch to Fixed Top Dock"
                >
                  <Icon.Monitor width={12} height={12} />
                  <span>Dock Top</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Mode 3: Always Docked (Manual fixed edge & alignment lock) */}
      {dockMode === 'always' && (
        <div className="settings-group">
          {/* Edge Selection */}
          <div className="settings-row">
            <div className="settings-row__text">
              <span className="settings-row__title">Dock Screen Edge</span>
              <span className="settings-row__sub">Lock Island firmly to a designated screen bezel</span>
            </div>
            <div className="settings-chips">
              {['top', 'bottom', 'left', 'right'].map((edge) => (
                <button
                  key={edge}
                  type="button"
                  className={`settings-chip ${currentEdge === edge ? 'is-active' : ''}`}
                  onClick={() => handleSetEdge(edge)}
                >
                  {edge.charAt(0).toUpperCase() + edge.slice(1)}
                </button>
              ))}
            </div>
          </div>

          <div className="settings-divider" />

          {/* Alignment Selection */}
          <div className="settings-row">
            <div className="settings-row__text">
              <span className="settings-row__title">Edge Alignment</span>
              <span className="settings-row__sub">Position along selected edge</span>
            </div>
            <div className="settings-chips">
              {isHorizontalEdge ? (
                <>
                  <button
                    type="button"
                    className={`settings-chip ${currentPreset === 'left' ? 'is-active' : ''}`}
                    onClick={() => handleSetPreset('left')}
                  >
                    Left
                  </button>
                  <button
                    type="button"
                    className={`settings-chip ${currentPreset === 'center' ? 'is-active' : ''}`}
                    onClick={() => handleSetPreset('center')}
                  >
                    Center
                  </button>
                  <button
                    type="button"
                    className={`settings-chip ${currentPreset === 'right' ? 'is-active' : ''}`}
                    onClick={() => handleSetPreset('right')}
                  >
                    Right
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className={`settings-chip ${currentPreset === 'top' ? 'is-active' : ''}`}
                    onClick={() => handleSetPreset('top')}
                  >
                    Top
                  </button>
                  <button
                    type="button"
                    className={`settings-chip ${currentPreset === 'middle' ? 'is-active' : ''}`}
                    onClick={() => handleSetPreset('middle')}
                  >
                    Middle
                  </button>
                  <button
                    type="button"
                    className={`settings-chip ${currentPreset === 'bottom' ? 'is-active' : ''}`}
                    onClick={() => handleSetPreset('bottom')}
                  >
                    Bottom
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Display & Behavior Group */}
      <div className="settings-group">
        <div className="settings-row settings-row--switch">
          <div className="settings-row__text">
            <span className="settings-row__title">Hide Island in Fullscreen</span>
            <span className="settings-row__sub">YouTube, games, and full-screen windows</span>
          </div>
          <Switch checked={autohideIsland} onChange={handleToggleAutohideIsland} label="Toggle island fullscreen autohide" />
        </div>

        <div className="settings-divider" />

        <div className="settings-row settings-row--switch">
          <div className="settings-row__text">
            <span className="settings-row__title">Hide Pet in Fullscreen</span>
            <span className="settings-row__sub">Companion pet autohides during games and videos</span>
          </div>
          <Switch checked={autohidePet} onChange={handleToggleAutohidePet} label="Toggle pet fullscreen autohide" />
        </div>
      </div>

      {/* Lyrics Synchronization Group */}
      <div className="settings-group">
        <div className="settings-row settings-row--wrap">
          <div className="settings-row__text">
            <span className="settings-row__title">Lyrics Synchronization</span>
            <span className="settings-row__sub">Scroll lead-time to match singer vocal delivery</span>
          </div>
          <div className="settings-chips">
            {[
              { label: 'Faster (-400ms)', val: 150 },
              { label: 'Natural (-250ms)', val: 0 },
              { label: 'Exact (0ms)', val: -250 },
              { label: 'Late (+150ms)', val: -400 },
            ].map((item) => (
              <button
                key={item.label}
                type="button"
                className={`settings-chip ${lyricsOffset === item.val ? 'is-active' : ''}`}
                onClick={() => handleSetLyricsOffset(item.val)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Voice Assistant Identity */}
      <div className="settings-group">
        <div className="settings-row">
          <div className="settings-row__text">
            <span className="settings-row__title">Your Name</span>
            <span className="settings-row__sub">What Island & your companion pet calls you in voice conversations</span>
          </div>
          <div className="settings-input-box">
            <input
              type="text"
              className="settings-text-input"
              value={userName}
              onChange={(e) => {
                const val = e.target.value.slice(0, 20);
                setUserName(val);
                localStorage.setItem('island_user_name', val);
                window.dispatchEvent(new CustomEvent('island:pet-settings-changed'));
              }}
              placeholder="Friend"
            />
          </div>
        </div>
      </div>

      {/* AI Assistant Identity & Settings */}
      <div className="settings-group">
        <div className="settings-row">
          <div className="settings-row__text">
            <span className="settings-row__title">AI Assistant Name</span>
            <span className="settings-row__sub">Configurable companion name used in greetings, notifications, and voice conversations</span>
          </div>
          <div className="settings-input-box">
            <input
              type="text"
              className="settings-text-input"
              value={assistantName}
              onChange={(e) => handleAssistantNameChange(e.target.value)}
              placeholder="Nova"
              maxLength={24}
            />
          </div>
        </div>

        {/* Speech Pause Detection Tuning */}
        <div className="settings-row settings-row--wrap">
          <div className="settings-row__text">
            <span className="settings-row__title">Speech Pause Detection</span>
            <span className="settings-row__sub">Silence delay before {assistantName} processes your turn (prevents premature cut-offs)</span>
          </div>
          <div className="settings-chips">
            {[
              { label: '850ms (Rapid)', val: 850 },
              { label: '1400ms (Recommended)', val: 1400 },
              { label: '2000ms (Relaxed)', val: 2000 },
            ].map((item) => (
              <button
                key={item.label}
                type="button"
                className={`settings-chip ${vadSilenceMs === item.val ? 'is-active' : ''}`}
                onClick={() => {
                  setVadSilenceMs(item.val);
                  localStorage.setItem('island_vad_silence_ms', String(item.val));
                  window.dispatchEvent(new CustomEvent('island:vad-timing-changed', { detail: item.val }));
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {/* Conversational AI Provider */}
        <div className="settings-row settings-row--wrap">
          <div className="settings-row__text">
            <span className="settings-row__title">Conversational AI</span>
            <span className="settings-row__sub">
              {chatProvider === 'groq'
                ? `Groq Llama 3.3 (Fast 70B inference with native music/favorites tool calling)`
                : `Google Gemini (Cloud multimodal conversational model)`}
            </span>
          </div>
          <div className="settings-chips">
            {[
              { id: 'gemini', label: 'Gemini (Cloud)' },
              { id: 'groq', label: 'Groq (Llama 3.3)' },
            ].map((p) => (
              <button
                key={p.id}
                type="button"
                className={`settings-chip ${chatProvider === p.id ? 'is-active' : ''}`}
                onClick={() => handleSetChatProvider(p.id)}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Groq Chat Model Selection */}
        {chatProvider === 'groq' && (
          <div className="settings-row settings-row--wrap" style={{ paddingLeft: 12 }}>
            <div className="settings-row__text">
              <span className="settings-row__title">Groq Chat Model</span>
              <span className="settings-row__sub">Select conversational reasoning & tool model</span>
            </div>
            <div className="settings-chips">
              {[
                { id: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B (Recommended • Active)' },
                { id: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B (Tiered Access)' },
              ].map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className={`settings-chip ${groqChatModel === m.id ? 'is-active' : ''}`}
                  onClick={() => handleSetGroqChatModel(m.id)}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Speech Recognition (STT) Provider */}
        <div className="settings-row settings-row--wrap">
          <div className="settings-row__text">
            <span className="settings-row__title">Speech Recognition (STT)</span>
            <span className="settings-row__sub">
              {sttProvider === 'groq-whisper'
                ? 'Groq Whisper STT. Independent transcription, zero Gemini quota usage, preserves spoken language.'
                : 'Gemini Multimodal direct voice recognition.'}
            </span>
          </div>
          <div className="settings-chips">
            {[
              { id: 'gemini', label: 'Gemini Multimodal' },
              { id: 'groq-whisper', label: 'Groq Whisper' },
            ].map((stt) => (
              <button
                key={stt.id}
                type="button"
                className={`settings-chip ${sttProvider === stt.id ? 'is-active' : ''}`}
                onClick={() => handleSetSttProvider(stt.id)}
              >
                {stt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Groq Whisper Model Selection */}
        {sttProvider === 'groq-whisper' && (
          <div className="settings-row settings-row--wrap" style={{ paddingLeft: 12 }}>
            <div className="settings-row__text">
              <span className="settings-row__title">Whisper Model</span>
              <span className="settings-row__sub">Transcription engine running on Groq LPU</span>
            </div>
            <div className="settings-chips">
              {[
                { id: 'whisper-large-v3-turbo', label: 'Large v3 Turbo (Recommended)' },
                { id: 'whisper-large-v3', label: 'Large v3 (Accurate)' },
              ].map((wm) => (
                <button
                  key={wm.id}
                  type="button"
                  className={`settings-chip ${groqWhisperModel === wm.id ? 'is-active' : ''}`}
                  onClick={() => handleSetGroqWhisperModel(wm.id)}
                >
                  {wm.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Groq API Key Setup */}
        {(chatProvider === 'groq' || sttProvider === 'groq-whisper') && (
          <div style={{ marginTop: 8, padding: '10px 14px', borderRadius: 10, background: 'rgba(255, 255, 255, 0.04)', border: '1px solid rgba(255, 255, 255, 0.08)', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span className="settings-row__title" style={{ fontSize: 12 }}>Groq API Key</span>
                <span className="settings-row__sub">
                  {groqStatus.hasKey
                    ? `Configured (${groqStatus.keyMasked || '••••'})`
                    : 'Not configured • Required for Groq Chat & Whisper'}
                </span>
              </div>
              {groqStatus.hasKey && (
                <button
                  type="button"
                  className="settings-chip"
                  onClick={handleClearGroqKey}
                  style={{ color: '#ef4444' }}
                >
                  Clear Key
                </button>
              )}
            </div>

            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                type="password"
                className="settings-text-input"
                value={groqKeyInput}
                onChange={(e) => setGroqKeyInput(e.target.value)}
                placeholder={groqStatus.hasKey ? 'Enter new key to replace' : 'Paste Groq key (gsk_...)'}
                style={{ flex: 1, height: 32, fontSize: 11 }}
              />
              <button
                type="button"
                className="settings-chip is-active"
                onClick={handleSaveGroqKey}
                disabled={isSavingGroqKey || !groqKeyInput.trim()}
                style={{ height: 32 }}
              >
                {isSavingGroqKey ? 'Saving...' : 'Save Key'}
              </button>
            </div>

            {groqKeyMsg && (
              <span className="settings-row__sub" style={{ color: 'var(--panel-accent)', fontSize: 11 }}>
                {groqKeyMsg}
              </span>
            )}
            {groqKeyError && (
              <span className="settings-row__sub" style={{ color: '#ef4444', fontSize: 11 }}>
                {groqKeyError}
              </span>
            )}
            <span className="settings-row__sub" style={{ fontSize: 10, opacity: 0.6 }}>
              Key is encrypted using Windows Data Protection API (safeStorage) and never logged or exposed.
            </span>
          </div>
        )}

        {/* Voice Engine Selector */}
        <div className="settings-row settings-row--wrap">
          <div className="settings-row__text">
            <span className="settings-row__title">Speech Synthesis (TTS)</span>
            <span className="settings-row__sub">
              {voiceEngine === 'gemini'
                ? 'Cloud Gemini TTS (Despina voice). Conversational delivery with quota limits.'
                : voiceEngine === 'kokoro'
                ? 'Private local ONNX speech synthesis running completely offline on CPU.'
                : 'Native Windows system speech synthesizer with zero network dependency.'}
            </span>
          </div>
          <div className="settings-chips">
            {[
              { id: 'gemini', label: 'Gemini (Despina)' },
              { id: 'kokoro', label: 'Kokoro (Local CPU)' },
              { id: 'windows', label: 'Windows Voice' },
            ].map((eng) => (
              <button
                key={eng.id}
                type="button"
                className={`settings-chip ${voiceEngine === eng.id ? 'is-active' : ''}`}
                onClick={() => handleSetVoiceEngine(eng.id)}
              >
                {eng.label}
              </button>
            ))}
          </div>
        </div>

        {/* Kokoro Local Settings when selected */}
        {voiceEngine === 'kokoro' && (
          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Status & Model Installation */}
            <div className="settings-row">
              <div className="settings-row__text">
                <span className="settings-row__title">Model Weights (ONNX q8)</span>
                <span className="settings-row__sub">
                  {kokoroStatus.installed
                    ? (kokoroStatus.isLoaded ? 'Loaded in RAM • Ready' : 'Installed locally (~85MB) • Ready')
                    : 'Not downloaded. Click to install lightweight CPU model weights.'}
                </span>
                {kokoroMsg && (
                  <span className="settings-row__sub" style={{ color: 'var(--panel-accent)', marginTop: 4, display: 'block' }}>
                    {kokoroMsg}
                  </span>
                )}
                {kokoroError && (
                  <span className="settings-row__sub" style={{ color: '#ef4444', marginTop: 4, display: 'block' }}>
                    {kokoroError}
                  </span>
                )}
              </div>
              <div className="settings-chips">
                {!kokoroStatus.installed ? (
                  <button
                    type="button"
                    className="settings-chip is-active"
                    onClick={handleInstallKokoro}
                    disabled={isInstallingKokoro}
                  >
                    {isInstallingKokoro ? 'Installing...' : 'Install Weights'}
                  </button>
                ) : (
                  <>
                    {kokoroStatus.isLoaded && (
                      <button
                        type="button"
                        className="settings-chip"
                        onClick={handleFreeKokoroRam}
                        title="Unload model from RAM"
                      >
                        Free RAM
                      </button>
                    )}
                    <button
                      type="button"
                      className="settings-chip is-active"
                      onClick={handleTestKokoroVoice}
                    >
                      {isTestingVoice ? 'Stop Test' : 'Test Voice'}
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Voice Persona */}
            <div className="settings-row settings-row--wrap">
              <div className="settings-row__text">
                <span className="settings-row__title">Local Voice Persona</span>
                <span className="settings-row__sub">Select offline voice timbre for {assistantName}</span>
              </div>
              <div className="settings-chips">
                {[
                  { id: 'af_heart', label: 'Heart' },
                  { id: 'af_bella', label: 'Bella' },
                  { id: 'af_nicole', label: 'Nicole' },
                  { id: 'af_sarah', label: 'Sarah' },
                  { id: 'af_sky', label: 'Sky' },
                ].map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    className={`settings-chip ${kokoroVoice === v.id ? 'is-active' : ''}`}
                    onClick={() => handleSetKokoroVoice(v.id)}
                  >
                    {v.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Cloud fallback toggle (default OFF) */}
            <div className="settings-row">
              <div className="settings-row__text">
                <span className="settings-row__title">Allow Cloud Fallback</span>
                <span className="settings-row__sub">
                  Only use Gemini TTS if Kokoro fails. When disabled, zero cloud audio is used.
                </span>
              </div>
              <Switch
                checked={allowCloudFallback}
                onChange={handleToggleCloudFallback}
                label="Toggle cloud fallback"
              />
            </div>
          </div>
        )}

        {/* Windows Voice Sub-settings */}
        {voiceEngine === 'windows' && (
          <div style={{ marginTop: 12 }}>
            <div className="settings-row">
              <div className="settings-row__text">
                <span className="settings-row__title">Windows Speech Preview</span>
                <span className="settings-row__sub">Audit and test local offline Windows voices</span>
              </div>
              <button
                type="button"
                className="settings-chip is-active"
                onClick={() => setShowVoiceDiscovery((prev) => !prev)}
              >
                {showVoiceDiscovery ? 'Hide Explorer' : 'Explore Voices'}
              </button>
            </div>
            {showVoiceDiscovery && (
              <div style={{ marginTop: 12 }}>
                <WindowsVoicePreview onClose={() => setShowVoiceDiscovery(false)} />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Shortcuts & Footer */}
      <div className="settings-footer">
        <div className="settings-footer__hint">
          <Icon.Sparkles width={13} height={13} />
          <span>Press <code>Esc</code> or click outside anytime to collapse.</span>
        </div>
        {dockMode !== 'free' && (
          <button type="button" className="settings-footer__reset" onClick={handleResetPos}>
            <Icon.RotateCcw width={12} height={12} />
            <span>Reset Dock</span>
          </button>
        )}
      </div>
    </div>
  );
}
