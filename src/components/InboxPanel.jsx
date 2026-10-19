import { AnimatePresence, motion } from 'framer-motion';
import { timeAgo } from '../lib/format';
import { Avatar, Empty } from './bits';
import { Icon } from './icons';

export default function InboxPanel({ inbox, now, port, onClear, onRemove }) {
  if (!inbox.length) {
    return (
      <Empty
        icon={Icon.Inbox}
        title="You're all caught up"
        hint={
          <>
            Tools can send notifications to <code>127.0.0.1:{port}</code>. Try <code>npm run notify -- "Hello"</code>.
          </>
        }
      />
    );
  }

  return (
    <div className="inbox">
      <div className="inbox__head">
        <span>{inbox.length === 1 ? '1 notification' : `${inbox.length} notifications`}</span>
        <button type="button" className="link-btn" onClick={onClear}>
          Clear all
        </button>
      </div>
      <ul className="inbox__list scroll">
        <AnimatePresence initial={false}>
          {inbox.map((n) => (
            <motion.li
              key={n.id}
              className={`note${n.read ? '' : ' is-unread'}`}
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: 24 }}
              transition={{ duration: 0.2 }}
            >
              <Avatar app={n.app} kind={n.kind} size={36} />
              <div className="note__text">
                <div className="note__title">{n.title}</div>
                {n.body && <div className="note__body">{n.body}</div>}
                <div className="note__meta">
                  {n.app} · {timeAgo(n.ts, now)}
                </div>
              </div>
              <button type="button" className="icon-btn icon-btn--sm note__x" aria-label="Dismiss notification" onClick={() => onRemove(n.id)}>
                <Icon.Close width={14} height={14} />
              </button>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    </div>
  );
}
