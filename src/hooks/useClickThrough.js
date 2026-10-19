import { useEffect } from 'react';
import { island } from '../lib/bridge';

/**
 * useClickThrough:
 * Keeps transparent Electron overlay windows non-blocking.
 * The window forwards mouse clicks to underlying applications
 * unless the cursor is directly over an element marked with [data-hit].
 */
export function useClickThrough() {
  useEffect(() => {
    let ignoring = null;
    let last = null;

    const apply = (want) => {
      if (want !== ignoring) {
        ignoring = want;
        island?.setIgnoreMouse?.(want);
      }
    };

    const over = (el) => el instanceof Element && Boolean(el.closest('[data-hit]'));

    const onMove = (e) => {
      last = { x: e.clientX, y: e.clientY };
      apply(!over(e.target));
    };

    const onLeave = () => {
      last = null;
      apply(true);
    };

    // Safety net: if the hit element disappears or pointer is still, release mouse to OS
    const timer = setInterval(() => {
      if (last) {
        const el = document.elementFromPoint(last.x, last.y);
        apply(!over(el));
      }
    }, 250);

    // Initial state: always ignore mouse so OS clicks are never captured by empty window
    apply(true);

    document.addEventListener('mousemove', onMove, { passive: true });
    document.documentElement.addEventListener('mouseleave', onLeave);

    return () => {
      clearInterval(timer);
      document.removeEventListener('mousemove', onMove);
      document.documentElement.removeEventListener('mouseleave', onLeave);
      apply(true); // Always release mouse capture on unmount
    };
  }, []);
}
