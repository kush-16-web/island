import React, { useEffect, useState } from 'react';
import { Icon } from '../icons';

/**
 * Format remaining milliseconds into compact clock display (e.g. "0:59", "4:32", "1:15:00")
 */
function formatClockRemaining(ms) {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;

  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
}

function formatDurationMeta(ms) {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}-second timer`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}-minute timer`;
  const h = Math.round(m / 60);
  return `${h}-hour timer`;
}

export default function SchedulerCard({ data }) {
  const [liveItems, setLiveItems] = useState(null);
  const [removedIds, setRemovedIds] = useState(() => new Set());
  const [now, setNow] = useState(() => Date.now());

  // Subscribe to real authoritative scheduler state from Electron bridge
  useEffect(() => {
    if (typeof window === 'undefined' || !window.island?.on) return undefined;

    const off = window.island.on('scheduler:state', (items) => {
      if (Array.isArray(items)) {
        setLiveItems(items);
      }
    });

    // Tick only for clock display reading directly from fireAt, not a second independent clock
    const timer = setInterval(() => setNow(Date.now()), 1000);

    return () => {
      if (typeof off === 'function') off();
      clearInterval(timer);
    };
  }, []);

  if (!data) return null;

  const item = data.item;
  const activeTimers = data.activeTimers || (item?.kind === 'timer' ? [item] : []);
  const activeAlarms = data.activeAlarms || (item?.kind === 'alarm' ? [item] : []);

  const handleCancelItem = async (id) => {
    if (!id) return;
    setRemovedIds((prev) => new Set([...prev, id]));
    if (typeof window !== 'undefined' && window.island?.scheduler?.remove) {
      try {
        await window.island.scheduler.remove(id);
      } catch (err) {
        console.warn('[SchedulerCard] Cancel error:', err);
      }
    }
  };

  // Case 1: Single Timer or Alarm
  if (item) {
    const isTimer = item.kind === 'timer';
    // Match against live authoritative scheduler list if available
    const liveMatch = liveItems ? liveItems.find((entry) => entry.id === item.id) : null;
    const currentItem = liveMatch || item;
    const isRemoved = removedIds.has(item.id) || (liveItems && !liveMatch);

    const label = currentItem.label || (isTimer ? 'Timer' : 'Alarm');
    const durationMs = currentItem.durationMs || 60000;
    const fireAt = currentItem.fireAt || (now + durationMs);
    const remainingMs = Math.max(0, fireAt - now);
    const progress = Math.max(0, Math.min(1, 1 - remainingMs / durationMs));
    const isRunning = !isRemoved && (isTimer ? remainingMs > 0 : currentItem.enabled);

    const timeDisplay = isTimer
      ? isRemoved
        ? 'Cancelled'
        : remainingMs === 0
        ? 'Finished'
        : formatClockRemaining(remainingMs)
      : currentItem.time || 'Scheduled';

    const statusText = isRemoved ? 'Cancelled' : isRunning ? 'Running' : 'Done';
    const statusClass = isRemoved ? 'cancelled' : isRunning ? 'active' : 'done';

    return (
      <div className="live-timer-hero" role="region" aria-label={isTimer ? 'Timer Status' : 'Alarm Status'}>
        <div className="live-timer-hero__header">
          <span className="live-timer-hero__label" title={label}>{label}</span>
          {(isRemoved || !isRunning) && (
            <span className={`live-timer-hero__state-hint is-${statusClass}`}>{statusText}</span>
          )}
        </div>

        <div className="live-timer-hero__countdown">{timeDisplay}</div>

        {isTimer && (
          <div className="live-timer-hero__track" aria-hidden="true">
            <div
              className="live-timer-hero__fill"
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          </div>
        )}

        <div className="live-timer-hero__footer">
          <span className="live-timer-hero__meta">
            {isTimer ? formatDurationMeta(durationMs) : 'Alarm'}
          </span>
          {!isRemoved && isRunning && (
            <button
              type="button"
              className="live-timer-hero__action-btn"
              onClick={() => handleCancelItem(item.id)}
              aria-label={isTimer ? 'Stop timer' : 'Cancel alarm'}
              title={isTimer ? 'Stop timer' : 'Cancel alarm'}
            >
              <span>{isTimer ? 'Stop' : 'Cancel'}</span>
            </button>
          )}
        </div>
      </div>
    );
  }

  // Case 2: Listing active timers or alarms (from QUERY_STATUS)
  if (activeTimers.length > 0 || activeAlarms.length > 0) {
    return (
      <div className="compact-timer-card compact-timer-card--list" role="region" aria-label="Active Alarms and Timers">
        <div className="compact-timer-card__header-bar">
          <Icon.Timer width={14} height={14} className="compact-timer-card__icon" />
          <span className="compact-timer-card__list-title">Active Timers & Alarms</span>
        </div>

        <div className="compact-timer-card__items-group">
          {activeTimers.map((t, idx) => {
            const liveMatch = liveItems ? liveItems.find((e) => e.id === t.id) : null;
            const currentT = liveMatch || t;
            const isRemoved = removedIds.has(t.id) || (liveItems && !liveMatch);
            const durationMs = currentT.durationMs || 60000;
            const fireAt = currentT.fireAt || (now + durationMs);
            const remainingMs = Math.max(0, fireAt - now);
            const progress = Math.max(0, Math.min(1, 1 - remainingMs / durationMs));
            const isRunning = !isRemoved && remainingMs > 0;

            return (
              <div key={t.id || `timer-${idx}`} className={`compact-timer-row ${isRemoved ? 'is-cancelled' : ''}`}>
                <div className="compact-timer-row__content">
                  <div className="compact-timer-row__label-group">
                    <span className="compact-timer-row__label">{currentT.label || 'Timer'}</span>
                    <span className="compact-timer-row__time">
                      {isRemoved ? 'Cancelled' : formatClockRemaining(remainingMs)}
                    </span>
                  </div>
                  {!isRemoved && isRunning && (
                    <div className="compact-timer-row__track">
                      <div className="compact-timer-row__fill" style={{ width: `${Math.round(progress * 100)}%` }} />
                    </div>
                  )}
                </div>

                {!isRemoved && isRunning && (
                  <button
                    type="button"
                    className="compact-timer-row__cancel-btn"
                    onClick={() => handleCancelItem(t.id)}
                    aria-label="Cancel timer"
                    title="Cancel timer"
                  >
                    <Icon.Close width={11} height={11} />
                  </button>
                )}
              </div>
            );
          })}

          {activeAlarms.map((a, idx) => {
            const isRemoved = removedIds.has(a.id);
            return (
              <div key={a.id || `alarm-${idx}`} className={`compact-timer-row ${isRemoved ? 'is-cancelled' : ''}`}>
                <div className="compact-timer-row__content">
                  <div className="compact-timer-row__label-group">
                    <span className="compact-timer-row__label">{a.label || 'Alarm'}</span>
                    <span className="compact-timer-row__time">{isRemoved ? 'Cancelled' : a.time}</span>
                  </div>
                </div>

                {!isRemoved && (
                  <button
                    type="button"
                    className="compact-timer-row__cancel-btn"
                    onClick={() => handleCancelItem(a.id)}
                    aria-label="Cancel alarm"
                    title="Cancel alarm"
                  >
                    <Icon.Close width={11} height={11} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // Fallback empty / confirmation text
  return (
    <div className="compact-timer-card compact-timer-card--empty">
      <Icon.Clock width={14} height={14} className="compact-timer-card__icon" />
      <span className="compact-timer-card__empty-text">
        {data.spokenConfirmation || data.displayText || 'No active alarms or timers.'}
      </span>
    </div>
  );
}
