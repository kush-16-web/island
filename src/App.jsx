import { useEffect, useState } from 'react';
import Island from './components/Island';
import DesktopPetWindow from './pets/DesktopPetWindow';
import { island, isMock } from './lib/bridge';

// The overlay window is click-through. It only captures the mouse while the pointer is over an
// element marked data-hit (the island and the pet), so it never blocks the apps underneath.
function useClickThrough() {
  useEffect(() => {
    let ignoring = null;
    let last = null;
    const apply = (want) => {
      if (want !== ignoring) {
        ignoring = want;
        island.setIgnoreMouse(want);
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
    // Safety net: if the element under a still pointer disappears, release the mouse.
    const timer = setInterval(() => {
      if (last) apply(!over(document.elementFromPoint(last.x, last.y)));
    }, 250);

    apply(true);
    document.addEventListener('mousemove', onMove, { passive: true });
    document.documentElement.addEventListener('mouseleave', onLeave);
    return () => {
      clearInterval(timer);
      document.removeEventListener('mousemove', onMove);
      document.documentElement.removeEventListener('mouseleave', onLeave);
    };
  }, []);
}

function DevBar() {
  const dev = island.dev;
  return (
    <div className="devbar">
      <span>Browser preview</span>
      <button type="button" onClick={() => dev.notify({ title: 'Build finished', body: '42 tests passed in 3.1s', app: 'Terminal', kind: 'success' })}>Notify</button>
      <button type="button" onClick={() => dev.notify({ title: 'Deploy failed', body: 'Exit code 1 on step 4', app: 'GitHub', kind: 'error' })}>Error</button>
      <button type="button" onClick={dev.toggleMusic}>Music</button>
      <button type="button" onClick={() => island.scheduler.addTimer({ durationMs: 90000, label: 'Tea' })}>Timer</button>
      <button type="button" onClick={() => island.scheduler.addTimer({ durationMs: 5000, label: 'Quick' })}>5s timer</button>
      <button type="button" onClick={() => dev.ring('alarm')}>Ring alarm</button>
    </div>
  );
}

export default function App() {
  const [isPetWin] = useState(() => window.location.hash === '#pet');

  useClickThrough();

  useEffect(() => {
    if (isMock && !isPetWin) document.body.classList.add('mock');
  }, [isPetWin]);

  if (isPetWin) {
    return <DesktopPetWindow />;
  }

  return (
    <>
      <Island />
      {isMock && <DevBar />}
    </>
  );
}
