import React, { useEffect, useState } from 'react';
import Island from './components/Island';
import DesktopPetWindow from './pets/DesktopPetWindow';
import { island, isMock } from './lib/bridge';
import { useClickThrough } from './hooks/useClickThrough';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Island render error caught by boundary:', error, errorInfo);
    // Ensure transparent window NEVER captures clicks when an error occurs
    island?.setIgnoreMouse?.(true);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ pointerEvents: 'none', background: 'transparent' }} />
      );
    }
    return this.props.children;
  }
}

function DevBar() {
  const dev = island.dev;
  return (
    <div className="devbar" data-hit>
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

  useEffect(() => {
    if (isMock && !isPetWin) document.body.classList.add('mock');
  }, [isPetWin]);

  if (isPetWin) {
    return (
      <ErrorBoundary>
        <DesktopPetWindow />
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <IslandApp />
    </ErrorBoundary>
  );
}

function IslandApp() {
  useClickThrough();
  return (
    <>
      <Island />
      {isMock && <DevBar />}
    </>
  );
}
