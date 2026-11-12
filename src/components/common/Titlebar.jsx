import { useEffect, useState } from 'react';
import islandIconUrl from '../../assets/island-icon-32.png';
import './titlebar.css';

/**
 * Custom Frameless Titlebar — Quiet Glass Direction (Phase 1A.2).
 * 
 * Slim, integrated custom titlebar:
 * - 34px height, seamless blend with window graphite material
 * - Clear draggable app region (-webkit-app-region: drag)
 * - Standard Windows window controls (-webkit-app-region: no-drag)
 * - Maximize / Restore state sync via IPC
 * - Restrained Island identity (subtle dot or pill indicator)
 */
export default function Titlebar({
  title = 'Island',
  subtitle = '',
  accentColor = 'var(--qg-accent, #e2e8f0)',
  isDynamic = false,
  showMinimize = true,
  showMaximize = true,
  showClose = true,
  onClose,
  leftAction = null,
  isMaximized: propIsMaximized,
  onToggleMaximize,
}) {
  const [internalIsMaximized, setInternalIsMaximized] = useState(false);
  const isMaximized = propIsMaximized !== undefined ? propIsMaximized : internalIsMaximized;

  useEffect(() => {
    if (propIsMaximized !== undefined) return undefined;

    if (window.island?.isWindowMaximized) {
      window.island.isWindowMaximized().then(setInternalIsMaximized).catch(() => {});
    }

    if (!window.island?.on) return undefined;

    return window.island.on('window:maximize-change', (data) => {
      if (typeof data?.isMaximized === 'boolean') {
        setInternalIsMaximized(data.isMaximized);
      }
    });
  }, [propIsMaximized]);

  const handleMinimize = (e) => {
    e.stopPropagation();
    window.island?.windowControl?.('minimize');
  };

  const handleMaximize = (e) => {
    e.stopPropagation();
    if (onToggleMaximize) {
      onToggleMaximize();
    } else {
      window.island?.windowControl?.('maximize');
    }
  };

  const handleClose = (e) => {
    e.stopPropagation();
    if (onClose) onClose();
    else window.island?.windowControl?.('close');
  };

  return (
    <header className={`qg-titlebar${isMaximized ? ' is-maximized' : ''}`} style={{ '--titlebar-accent': accentColor }}>
      {leftAction && (
        <div className="qg-titlebar__left-action">
          {leftAction}
        </div>
      )}
      {/* Draggable Title Region: Double-click toggles maximize/restore */}
      <div
        className="qg-titlebar__drag"
        onDoubleClick={showMaximize ? handleMaximize : undefined}
      >
        <div className="qg-titlebar__identity">
          <img
            src={islandIconUrl}
            className={`qg-titlebar__brand-icon${isDynamic ? ' is-dynamic' : ''}`}
            alt=""
            width={16}
            height={16}
          />
          <span className="qg-titlebar__title">{title}</span>
          {subtitle && <span className="qg-titlebar__tag">{subtitle}</span>}
        </div>
      </div>

      {/* Non-Draggable Window Controls */}
      <div className="qg-titlebar__controls">
        {showMinimize && (
          <button
            type="button"
            className="qg-titlebar__btn qg-titlebar__btn--minimize"
            onClick={handleMinimize}
            aria-label="Minimize"
            title="Minimize"
            tabIndex={-1}
          >
            <svg width="10" height="1" viewBox="0 0 10 1" fill="currentColor">
              <rect width="10" height="1" />
            </svg>
          </button>
        )}

        {showMaximize && (
          <button
            type="button"
            className="qg-titlebar__btn qg-titlebar__btn--maximize"
            onClick={handleMaximize}
            aria-label={isMaximized ? 'Restore' : 'Maximize'}
            title={isMaximized ? 'Restore' : 'Maximize'}
            tabIndex={-1}
          >
            {isMaximized ? (
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1">
                <rect x="2.5" y="0.5" width="7" height="7" rx="0.5" />
                <path d="M0.5 2.5v7h7v-7z" fill="var(--qg-bg-solid, #0d0f14)" />
                <rect x="0.5" y="2.5" width="7" height="7" rx="0.5" />
              </svg>
            ) : (
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1">
                <rect x="0.5" y="0.5" width="9" height="9" rx="0.5" />
              </svg>
            )}
          </button>
        )}

        {showClose && (
          <button
            type="button"
            className="qg-titlebar__btn qg-titlebar__btn--close"
            onClick={handleClose}
            aria-label="Close"
            title="Close"
            tabIndex={-1}
          >
            <svg width="10" height="10" viewBox="0 0 10 10" stroke="currentColor" strokeWidth="1.2">
              <line x1="1" y1="1" x2="9" y2="9" />
              <line x1="9" y1="1" x2="1" y2="9" />
            </svg>
          </button>
        )}
      </div>
    </header>
  );
}
