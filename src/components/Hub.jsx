import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef } from 'react';
import { EASE_OUT, SPRING } from '../lib/motion';
import ClockPanel from './ClockPanel';
import InboxPanel from './InboxPanel';
import NowPlaying from './NowPlaying';
import { Icon } from './icons';

const TABS = [
  { id: 'playing', label: 'Playing', Glyph: Icon.Music },
  { id: 'clock', label: 'Clock', Glyph: Icon.Timer },
  { id: 'inbox', label: 'Inbox', Glyph: Icon.Inbox },
];

const tabIndex = (id) => TABS.findIndex((t) => t.id === id);

const panelVariants = {
  enter: (dir) => ({ opacity: 0, x: 28 * dir, filter: 'blur(4px)' }),
  center: { opacity: 1, x: 0, filter: 'blur(0px)' },
  exit: (dir) => ({ opacity: 0, x: -28 * dir, filter: 'blur(4px)' }),
};

export default function Hub({ tab, setTab, onClose, s, actions, now, setTyping }) {
  const previous = useRef(tabIndex(tab));
  const dir = tabIndex(tab) >= previous.current ? 1 : -1;
  useEffect(() => {
    previous.current = tabIndex(tab);
  }, [tab]);

  const unread = s.inbox.filter((n) => !n.read).length;

  useEffect(() => {
    if (tab !== 'inbox' || unread === 0) return undefined;
    const id = setTimeout(actions.markRead, 700);
    return () => clearTimeout(id);
  }, [tab, unread, actions]);

  return (
    <div className="hub">
      <div className="hub__head">
        <div className="seg" role="tablist" aria-label="Island sections">
          {TABS.map(({ id, label, Glyph }) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} className={`seg__btn${tab === id ? ' is-active' : ''}`} onClick={() => setTab(id)}>
              {tab === id && <motion.span layoutId="seg-pill" className="seg__pill" transition={SPRING} />}
              <span className="seg__label">
                <Glyph width={15} height={15} />
                {label}
                {id === 'inbox' && unread > 0 && <span className="badge">{unread > 9 ? '9+' : unread}</span>}
              </span>
            </button>
          ))}
        </div>
        <button type="button" className="icon-btn" aria-label="Collapse island" onClick={onClose}>
          <Icon.Chevron width={18} height={18} />
        </button>
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
            {tab === 'playing' && <NowPlaying media={s.media} now={now} platform={s.platform} onControl={actions.mediaControl} />}
            {tab === 'clock' && <ClockPanel schedule={s.schedule} now={now} setTyping={setTyping} />}
            {tab === 'inbox' && <InboxPanel inbox={s.inbox} now={now} port={s.port} onClear={actions.clearInbox} onRemove={actions.removeNote} />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
