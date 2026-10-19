import React, { useEffect, useState } from 'react';

/**
 * SettingsPanel: Manages Island positioning presets, dragging behavior,
 * and application preferences inside the expanded Dynamic Island.
 */
export default function SettingsPanel() {
  const [currentPreset, setCurrentPreset] = useState('center');

  useEffect(() => {
    window.island?.getWindowPos?.().then((res) => {
      if (res?.preset) setCurrentPreset(res.preset);
    });

    if (window.island?.on) {
      return window.island.on('window:pos-changed', ({ preset }) => {
        if (preset) setCurrentPreset(preset);
      });
    }
  }, []);

  const handleSetPreset = (preset) => {
    setCurrentPreset(preset);
    window.island?.setWindowPreset?.(preset);
  };

  const handleResetPos = () => {
    setCurrentPreset('center');
    window.island?.resetWindowPos?.();
  };

  return (
    <div className="settings-panel scroll">
      {/* Position Presets */}
      <div className="setting-row">
        <div className="setting-label">
          <span>Island Screen Position</span>
          <span className="setting-sub">Snap the Dynamic Island to monitor presets</span>
        </div>
        <div className="chips">
          <button
            type="button"
            className={`chip ${currentPreset === 'left' ? 'is-active' : ''}`}
            onClick={() => handleSetPreset('left')}
          >
            Left
          </button>
          <button
            type="button"
            className={`chip ${currentPreset === 'center' ? 'is-active' : ''}`}
            onClick={() => handleSetPreset('center')}
          >
            Center
          </button>
          <button
            type="button"
            className={`chip ${currentPreset === 'right' ? 'is-active' : ''}`}
            onClick={() => handleSetPreset('right')}
          >
            Right
          </button>
        </div>
      </div>

      {/* Manual Dragging Guide */}
      <div className="setting-card">
        <div className="setting-card__title">✨ Dragging Your Island</div>
        <div className="setting-card__desc">
          Click and drag the collapsed Dynamic Island horizontally to place it anywhere along the top of your screen.
          Your custom position is saved automatically and remembered across restarts.
        </div>
      </div>

      {/* Click Outside Dismissal Guide */}
      <div className="setting-card">
        <div className="setting-card__title">🎯 Click-Outside Dismissal</div>
        <div className="setting-card__desc">
          When expanded, this island stays open while you use it. Clicking outside anywhere on your desktop, browser,
          taskbar, or pressing <code>Esc</code> collapses it immediately without blocking your click.
        </div>
      </div>

      {/* Reset Position */}
      <div className="setting-actions">
        <button type="button" className="btn btn--soft" onClick={handleResetPos}>
          Reset to Center
        </button>
      </div>
    </div>
  );
}
