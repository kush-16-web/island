import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useRef, useState } from 'react';
import { EASE_OUT } from '../lib/motion';
import LauncherPanel from './LauncherPanel';
import ClockPanel from './ClockPanel';
import InboxPanel from './InboxPanel';
import NowPlaying from './NowPlaying';
import PetStudioPanel from './PetStudioPanel';
import SettingsPanel from './SettingsPanel';
import VoicePanel from './VoicePanel';
import CompanionEyes from './CompanionEyes';
import { Icon } from './icons';

const ALL_TABS = ['launcher', 'playing', 'clock', 'pet', 'inbox', 'settings', 'voice'];

const tabIndex = (id) => {
  const idx = ALL_TABS.indexOf(id);
  return idx >= 0 ? idx : 0;
};

const panelVariants = {
  enter: (dir) => ({ opacity: 0, x: 24 * dir, filter: 'blur(3px)' }),
  center: { opacity: 1, x: 0, filter: 'blur(0px)' },
  exit: (dir) => ({ opacity: 0, x: -24 * dir, filter: 'blur(3px)' }),
};

const TAB_TITLES = {
  launcher: 'Utilities',
  clock: 'Timers & Alarms',
  pet: 'Desktop Pet',
  inbox: 'Notifications',
  settings: 'Settings',
  voice: 'Voice',
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
  volume,
  muted,
  volumeSupported = true,
  volumeUnavailableReason = '',
  onVolumeChange,
  onToggleMute,
  isDynamicMode = true,
  companionMood = 'idle',
  companionAnimations = true,
}) {
  const previous = useRef(tabIndex(tab));
  const dir = tabIndex(tab) >= previous.current ? 1 : -1;
  useEffect(() => {
    previous.current = tabIndex(tab);
  }, [tab]);

  const unread = s.inbox?.filter((n) => !n.read).length || 0;

  useEffect(() => {
    if (tab !== 'inbox' || unread === 0) return undefined;
    const id = setTimeout(actions.markRead, 700);
    return () => clearTimeout(id);
  }, [tab, unread, actions]);

  const [lyricsViewMode, setLyricsViewMode] = useState(false);
  const handleLyricsViewChange = useCallback((mode) => {
    setLyricsViewMode(mode);
    onLyricsViewChange?.(mode);
  }, [onLyricsViewChange]);
  const isLyricsActive = tab === 'playing' && (lyricsViewMode === 'lyrics' || lyricsViewMode === true);
  const isExpandedMusic = tab === 'playing';

  // When switching away from Playing tab, reset lyrics view mode
  useEffect(() => {
    if (tab !== 'playing' && lyricsViewMode) {
      setLyricsViewMode(false);
      onLyricsViewChange?.(false);
    }
  }, [tab, lyricsViewMode, onLyricsViewChange]);

  // Clean up when Hub unmounts to ensure parent container restores compact geometry
  useEffect(() => {
    return () => {
      onLyricsViewChange?.(false);
    };
  }, [onLyricsViewChange]);

  const handleOpenUtilities = useCallback(() => {
    setTab('launcher');
  }, [setTab]);

  const handleReturnFromUtilities = useCallback(() => {
    if (tab === 'launcher') {
      if (s.media?.active) setTab('playing');
      else onClose?.();
      return;
    }
    setTab('launcher');
  }, [tab, s.media?.active, setTab, onClose]);

  return (
    <div className={`hub${isLyricsActive ? ' hub--lyrics-active' : ''}${isExpandedMusic ? ' hub--music-focus' : ''}`} style={{ '--accent': accentColor || 'var(--c-info)' }}>
      {/* Minimal contextual header ONLY for non-Music views (Utilities, Timers, Pet, etc.) */}
      {!isExpandedMusic && !isLyricsActive && (
        <div className="hub__head hub__head--minimal">
          <div className="hub__nav">
            {(tab !== 'launcher' || s.media?.active) && (
              <button
                type="button"
                className="hub-back-btn"
                onClick={handleReturnFromUtilities}
                title={tab === 'launcher' && s.media?.active ? 'Back to Music' : 'Back to Utilities'}
                aria-label={tab === 'launcher' && s.media?.active ? 'Back to Music' : 'Back to Utilities'}
              >
                <Icon.Chevron width={13} height={13} style={{ transform: 'rotate(90deg)' }} />
                <span>{tab === 'launcher' && s.media?.active ? 'Music' : 'Utilities'}</span>
              </button>
            )}
            <span className="hub__minimal-title">{TAB_TITLES[tab] || 'Island'}</span>
          </div>

          <div className="hub__actions">
            <button
              type="button"
              className="expanded-music__eyes-btn"
              onClick={handleReturnFromUtilities}
              title={s.media?.active ? 'Return to Music' : 'Close Utilities'}
              aria-label={s.media?.active ? 'Return to Music' : 'Close Utilities'}
            >
              <CompanionEyes size="sm" mood={companionMood} animationsEnabled={companionAnimations} />
            </button>
          </div>
        </div>
      )}

      <div className={`hub__body${isLyricsActive ? ' hub__body--lyrics-active' : ''}`}>
        <AnimatePresence initial={false} custom={dir}>
          <motion.div
            key={tab}
            className="panel"
            custom={dir}
            variants={panelVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.24, ease: EASE_OUT }}
          >
            {tab === 'launcher' && (
              <LauncherPanel
                s={s}
                now={now}
                actions={actions}
                setTab={setTab}
                voice={voice}
                accentColor={accentColor}
                companionMood={companionMood}
                companionAnimations={companionAnimations}
                volume={volume}
                onVolumeChange={onVolumeChange}
              />
            )}
            {tab === 'playing' && (
              <NowPlaying
                media={s.media}
                now={now}
                platform={s.platform}
                onControl={actions.mediaControl}
                accentColor={accentColor}
                isDynamicMode={isDynamicMode}
                onLyricsViewChange={handleLyricsViewChange}
                videoStream={videoStream}
                videoStreamActive={videoStreamActive}
                youtubeId={youtubeId}
                volume={volume}
                muted={muted}
                volumeSupported={volumeSupported}
                volumeUnavailableReason={volumeUnavailableReason}
                onVolumeChange={onVolumeChange}
                onToggleMute={onToggleMute}
                onOpenUtilities={handleOpenUtilities}
                companionMood={companionMood}
                companionAnimations={companionAnimations}
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
