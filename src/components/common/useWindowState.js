import { useState, useEffect, useRef } from 'react';

/**
 * useWindowState
 * Shared hook for tracking and controlling window maximize/restore state.
 * 
 * Features:
 * - Syncs with Electron window events ('window:maximize-change', 'window:is-maximized')
 * - Emits a temporary `isTransitioning` flag (240ms) to synchronize smooth CSS layout animations
 * - Provides a safe `toggleMaximize` action for titlebars, double-clicks, and custom buttons
 */
export function useWindowState() {
  const [isMaximized, setIsMaximized] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const transitionTimerRef = useRef(null);

  useEffect(() => {
    // Initial sync
    if (window.island?.isWindowMaximized) {
      window.island.isWindowMaximized().then((maximized) => {
        setIsMaximized(Boolean(maximized));
      }).catch(() => {});
    }

    if (!window.island?.on) return undefined;

    // Listen to maximize change events from main process
    const unsubscribe = window.island.on('window:maximize-change', (data) => {
      if (typeof data?.isMaximized === 'boolean') {
        setIsMaximized(data.isMaximized);
        setIsTransitioning(true);

        if (transitionTimerRef.current) {
          clearTimeout(transitionTimerRef.current);
        }
        transitionTimerRef.current = setTimeout(() => {
          setIsTransitioning(false);
          transitionTimerRef.current = null;
        }, 240);
      }
    });

    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
      if (transitionTimerRef.current) clearTimeout(transitionTimerRef.current);
    };
  }, []);

  const toggleMaximize = () => {
    window.island?.windowControl?.('maximize');
  };

  return {
    isMaximized,
    isTransitioning,
    toggleMaximize,
  };
}

