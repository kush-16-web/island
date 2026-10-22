import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { EASE_OUT, SPRING } from '../lib/motion';
import { getAssistantName } from '../lib/assistant';
import LauncherPanel from './LauncherPanel';
import ClockPanel from './ClockPanel';
import InboxPanel from './InboxPanel';
import NowPlaying from './NowPlaying';
import PetStudioPanel from './PetStudioPanel';
import SettingsPanel from './SettingsPanel';
import VoicePanel from './VoicePanel';
import { Icon } from './icons';

const ALL_TABS = ['launcher', 'playing', 'clock', 'pet', 'inbox', 'settings', 'voice'];

const tabIndex = (id) => {
  const idx = ALL_TABS.indexOf(id);
  return idx >= 0 ? idx : 0;
};

const panelVariants = {
  enter: (dir) => ({ opacity: 0, x: 28 * dir, filter: 'blur(4px)' }),
  center: { opacity: 1, x: 0, filter: 'blur(0px)' },
  exit: (dir) => ({ opacity: 0, x: -28 * dir, filter: 'blur(4px)' }),
};

export default function Hub({
  tab,
  setTab,
  onClose,
  s,
  actions,
  now,
  setTyping,
  accentColor,
  onLyricsViewChange,
  videoStream,
  videoStreamActive,
  youtubeId,
  voice,
}) {
  const [assistantName, setAssistantNameState] = useState(getAssistantName);

  useEffect(() => {
    const handleAssistantChange = (e) => {
      if (e.detail?.name) setAssistantNameState(e.detail.name);
    };
    window.addEventListener('island:assistant-changed', handleAssistantChange);
    return () => window.removeEventListener('island:assistant-changed', handleAssistantChange);
  }, []);

  const previous = useRef(tabIndex(tab));
  const dir = tabIndex(tab) >= previous.current ? 1 : -1;
  useEffect(() => {
    previous.current = tabIndex(tab);
  }, [tab]);

  const unread = s.inbox?.filter((n) => !n.read).length || 0;
  const hasActiveTimers = s.schedule?.some((i) => i.kind === 'timer');

  useEffect(() => {
    if (tab !== 'inbox' || unread === 0) return undefined;
    const id = setTimeout(actions.markRead, 700);
    return () => clearTimeout(id);
  }, [tab, unread, actions]);

  // Contextual segmented navigation bar
  const visibleTabs = [
    { id: 'launcher', label: 'Home', Glyph: Icon.Home },
    { id: 'playing', label: s.media?.active ? 'Playing' : 'Music', Glyph: Icon.Music },
    { id: 'pet', label: 'Pet', Glyph: Icon.Paw },
  ];

  if (hasActiveTimers || tab === 'clock') {
    visibleTabs.push({ id: 'clock', label: 'Clock', Glyph: Icon.Timer });
  }
  if (unread > 0 || tab === 'inbox') {
    visibleTabs.push({ id: 'inbox', label: 'Inbox', Glyph: Icon.Inbox });
  }

  return (
    <div className="hub" style={{ '--accent': accentColor || 'var(--c-info)' }}>
      <div className="hub__head">
        <div className="hub__nav">
          <div className="seg" role="tablist" aria-label="Island sections">
            {visibleTabs.map(({ id, label, Glyph }) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                className={`seg__btn${tab === id ? ' is-active' : ''}`}
                onClick={() => {
                  if (tab === id) onClose?.();
                  else setTab(id);
                }}
                title={tab === id ? `Click to collapse ${label}` : label}
              >
                {tab === id && <motion.span layoutId="seg-pill" className="seg__pill" transition={SPRING} />}
                <span className="seg__label">
                  <Glyph width={15} height={15} />
                  {label}
                  {id === 'inbox' && unread > 0 && <span className="badge">{unread > 9 ? '9+' : unread}</span>}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="hub__actions">
          <button
            type="button"
            className={`hub-action-btn${tab === 'settings' ? ' is-active' : ''}`}
            onClick={() => {
              if (tab === 'settings') setTab(s.media?.active ? 'playing' : 'launcher');
              else setTab('settings');
            }}
            title="Settings"
            aria-label="Settings"
          >
            <Icon.Settings width={15} height={15} />
          </button>

          {voice && (
            <button
              type="button"
              className={`hub-voice-btn${voice.status !== 'idle' ? ' is-active' : ''}${tab === 'voice' ? ' is-selected' : ''}`}
              onClick={() => {
                if (voice.status === 'idle' || voice.status === 'error') {
                  voice.startSession();
                  setTab('voice');
                } else if (tab === 'voice') {
                  setTab(s.media?.active ? 'playing' : 'launcher');
                } else {
                  setTab('voice');
                }
              }}
              title={voice.status !== 'idle' ? `${assistantName} active (Click to view)` : `Talk to ${assistantName} (Ctrl+Shift+Space)`}
              aria-label="Voice Companion"
            >
              <Icon.Mic width={14} height={14} />
              {voice.status !== 'idle' && (
                <span className={`hub-voice-pulse is-${voice.status}`} />
              )}
            </button>
          )}
        </div>
      </div>

      <div className="hub__body">
        <AnimatePresence initial={false} custom={dir}>
          <motion.div
            key={tab}
            className="panel"
            custom={dir}
            variants={panelVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.26, ease: EASE_OUT }}
          >
            {tab === 'launcher' && (
              <LauncherPanel
                s={s}
                now={now}
                actions={actions}
                setTab={setTab}
                voice={voice}
                accentColor={accentColor}
              />
            )}
            {tab === 'playing' && (
              <NowPlaying
                media={s.media}
                now={now}
                platform={s.platform}
                onControl={actions.mediaControl}
                accentColor={accentColor}
                onLyricsViewChange={onLyricsViewChange}
                videoStream={videoStream}
                videoStreamActive={videoStreamActive}
                youtubeId={youtubeId}
              />
            )}
            {tab === 'clock' && <ClockPanel schedule={s.schedule} now={now} setTyping={setTyping} />}
            {tab === 'pet' && <PetStudioPanel setTyping={setTyping} />}
            {tab === 'inbox' && <InboxPanel inbox={s.inbox} now={now} port={s.port} onClear={actions.clearInbox} onRemove={actions.removeNote} />}
            {tab === 'settings' && <SettingsPanel accentColor={accentColor} />}
            {tab === 'voice' && voice && (
              <VoicePanel
                voice={voice}
                onClose={() => {
                  setTab(s.media?.active ? 'playing' : 'launcher');
                  onClose?.();
                }}
                onOpenSettings={() => setTab('settings')}
                accentColor={accentColor}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
