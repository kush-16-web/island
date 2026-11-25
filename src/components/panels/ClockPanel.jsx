import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { WheelPicker, WheelPickerWrapper } from '@ncdai/react-wheel-picker';
import '@ncdai/react-wheel-picker/style.css';
import { island } from '../../lib/bridge';
import { DAY_LABELS, DAY_NAMES, describeDays, formatAlarmTime, formatRemaining, pad, untilText, uses12h } from '../../lib/format';
import { MOTION, getMotionTransition } from '../../lib/motion';
import { Switch } from '../bits';
import { Icon } from '../icons';
import CompanionEyes from '../CompanionEyes';

function playWheelTick() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    if (!window.__islandAudioCtx) {
      window.__islandAudioCtx = new AudioCtx();
    }
    const ctx = window.__islandAudioCtx;
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(1400, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(320, ctx.currentTime + 0.005);
    gain.gain.setValueAtTime(0.04, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.005);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.006);
  } catch (e) {}
}

const ALARM_SOUND_OPTIONS = [
  'Soft chime',
  'Digital clock',
  'Gentle bell',
  'Classic alarm',
];

function WheelPickerColumn({ value, min, max, onChange, padZeros = true }) {
  const range = max - min + 1;
  const wrap = (val) => (((val - min) % range) + range) % range + min;
  const formatVal = (v) => (padZeros ? pad(v) : String(v));
  const ITEM_HEIGHT = 22;

  const [dragOffset, setDragOffset] = useState(0);
  const isDragging = useRef(false);
  const startY = useRef(null);
  const startVal = useRef(value);
  const lastStep = useRef(0);
  const wheelTimeout = useRef(null);

  const handlePointerDown = (e) => {
    isDragging.current = true;
    startY.current = e.clientY;
    startVal.current = value;
    lastStep.current = 0;
    setDragOffset(0);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}
  };

  const handlePointerMove = (e) => {
    if (!isDragging.current || startY.current === null) return;
    const totalDy = e.clientY - startY.current;
    const step = Math.round(totalDy / ITEM_HEIGHT);
    const remainder = totalDy - step * ITEM_HEIGHT;

    if (step !== lastStep.current) {
      playWheelTick();
      lastStep.current = step;
      onChange(wrap(startVal.current - step));
    }
    setDragOffset(remainder);
  };

  const handlePointerUp = (e) => {
    isDragging.current = false;
    startY.current = null;
    lastStep.current = 0;
    setDragOffset(0);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}
  };

  const handleWheel = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const dir = e.deltaY > 0 ? 1 : -1;
    setDragOffset(dir > 0 ? -6 : 6);
    onChange(wrap(value + dir));
    playWheelTick();
    clearTimeout(wheelTimeout.current);
    wheelTimeout.current = setTimeout(() => {
      setDragOffset(0);
    }, 140);
  };

  const vMinus2 = wrap(value - 2);
  const vMinus1 = wrap(value - 1);
  const vCenter = value;
  const vPlus1 = wrap(value + 1);
  const vPlus2 = wrap(value + 2);

  return (
    <div
      className="ios-wheel-col"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onWheel={handleWheel}
      tabIndex={0}
      role="spinbutton"
      aria-valuenow={value}
      aria-valuemin={min}
      aria-valuemax={max}
    >
      {/* Stationary Center Lens (Remains rock-solid while numbers glide through) */}
      <div className="ios-wheel-stationary-lens" aria-hidden="true" />

      <div
        className="ios-wheel-items-track"
        style={{
          transform: `translate3d(0, ${dragOffset}px, 0)`,
          transition: isDragging.current ? 'none' : 'transform 0.16s cubic-bezier(0.2, 0.8, 0.2, 1)',
        }}
      >
        <div className="ios-wheel-item ios-wheel-item--faint">{formatVal(vMinus2)}</div>
        <div className="ios-wheel-item ios-wheel-item--sub">{formatVal(vMinus1)}</div>
        <div className="ios-wheel-item ios-wheel-item--center">{formatVal(vCenter)}</div>
        <div className="ios-wheel-item ios-wheel-item--sub">{formatVal(vPlus1)}</div>
        <div className="ios-wheel-item ios-wheel-item--faint">{formatVal(vPlus2)}</div>
      </div>
    </div>
  );
}

const PRESET_TIMERS = [
  { label: '1m', minutes: 1 },
  { label: '5m', minutes: 5 },
  { label: '10m', minutes: 10 },
  { label: '25m', minutes: 25 },
];

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => {
  const str = pad(i);
  return { value: str, label: str };
});

const MIN_SEC_OPTIONS = Array.from({ length: 60 }, (_, i) => {
  const str = pad(i);
  return { value: str, label: str };
});

/**
 * RollingDigit: Single animated digit that rolls smoothly on value change
 */
function RollingDigit({ char }) {
  const prefersReducedMotion = useReducedMotion();
  if (char === ':' || char === ' ') {
    return <span className="rolling-digit-sep">{char}</span>;
  }

  if (prefersReducedMotion) {
    return <span className="rolling-digit-val">{char}</span>;
  }

  return (
    <div className="rolling-digit-box">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={char}
          className="rolling-digit-val"
          initial={{ y: -14, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 14, opacity: 0 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        >
          {char}
        </motion.span>
      </AnimatePresence>
    </div>
  );
}

/**
 * RollingTimeDisplay: Monospaced animated remaining time counter
 */
function RollingTimeDisplay({ timeStr }) {
  return (
    <div className="rolling-time-display" aria-label={`Remaining time: ${timeStr}`}>
      {timeStr.split('').map((char, i) => (
        <RollingDigit key={i} char={char} />
      ))}
    </div>
  );
}

export function DigitSpinner({ value, min = 0, max = 59, onChange, label }) {
  const dragStartY = useRef(null);
  const dragStartVal = useRef(value);

  const handleWheel = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.deltaY < 0) {
      onChange(value + 1 > max ? min : value + 1);
    } else {
      onChange(value - 1 < min ? max : value - 1);
    }
  };

  const handlePointerDown = (e) => {
    dragStartY.current = e.clientY;
    dragStartVal.current = value;
    if (e.currentTarget.setPointerCapture) {
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {}
    }
  };

  const handlePointerMove = (e) => {
    if (dragStartY.current === null) return;
    const dy = dragStartY.current - e.clientY;
    const step = Math.trunc(dy / 12);
    if (step !== 0) {
      let next = dragStartVal.current + step;
      const range = max - min + 1;
      next = (((next - min) % range) + range) % range + min;
      onChange(next);
    }
  };

  const handlePointerUp = (e) => {
    dragStartY.current = null;
    if (e.currentTarget.releasePointerCapture) {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {}
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      onChange(value + 1 > max ? min : value + 1);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      onChange(value - 1 < min ? max : value - 1);
    }
  };

  return (
    <div
      className="digit-spin"
      onWheel={handleWheel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="spinbutton"
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={min}
      aria-valuemax={max}
    >
      <button
        type="button"
        className="digit-spin__btn"
        onClick={() => onChange(value + 1 > max ? min : value + 1)}
        tabIndex={-1}
        aria-label={`Increase ${label}`}
      >
        <Icon.Chevron width={11} height={11} style={{ transform: 'rotate(180deg)' }} />
      </button>

      <span className="digit-spin__num">{String(value).padStart(2, '0')}</span>

      <button
        type="button"
        className="digit-spin__btn"
        onClick={() => onChange(value - 1 < min ? max : value - 1)}
        tabIndex={-1}
        aria-label={`Decrease ${label}`}
      >
        <Icon.Chevron width={11} height={11} />
      </button>
    </div>
  );
}

export default function ClockPanel({ schedule = [], now = Date.now(), onBack, initialMode = 'alarms' }) {
  const [subMode, setSubMode] = useState(initialMode); // 'countdown' | 'alarms'
  const prefersReducedMotion = useReducedMotion();
  const contentTransition = getMotionTransition(MOTION.content, prefersReducedMotion);

  // Timer Picker State
  const [hours, setHours] = useState(0);
  const [minutes, setMinutes] = useState(5);
  const [seconds, setSeconds] = useState(0);
  const [pausedTimerState, setPausedTimerState] = useState(null); // { remainingMs, label }

  // Alarm Editor State
  const [isAddingAlarm, setIsAddingAlarm] = useState(false);
  const [alarmHour, setAlarmHour] = useState(() => (new Date().getHours() + 1) % 24);
  const [alarmMinute, setAlarmMinute] = useState(0);
  const [alarmDays, setAlarmDays] = useState([]);
  const [alarmLabel, setAlarmLabel] = useState('');
  const [alarmSound, setAlarmSound] = useState('Soft chime');
  const [isSoundDropdownOpen, setIsSoundDropdownOpen] = useState(false);
  const [feedbackError, setFeedbackError] = useState('');

  // Synchronize height state with Island
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('island:utility-change', {
          detail: { activeUtility: isAddingAlarm ? 'new_alarm' : 'clock' },
        })
      );
    }
  }, [isAddingAlarm]);

  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('island:utility-change', {
            detail: { activeUtility: null },
          })
        );
      }
    };
  }, []);

  // Find active running timer from schedule
  const activeTimers = schedule
    .filter((i) => i.kind === 'timer')
    .sort((a, b) => a.fireAt - b.fireAt);
  const runningTimer = activeTimers[0] || null;

  // Clear paused state if a real timer has started
  useEffect(() => {
    if (runningTimer && pausedTimerState) {
      setPausedTimerState(null);
    }
  }, [runningTimer, pausedTimerState]);

  // Start timer action
  const handleStartTimer = () => {
    const totalMs = (hours * 3600 + minutes * 60 + seconds) * 1000;
    if (totalMs < 1000) return;
    setFeedbackError('');
    island.scheduler.addTimer({ durationMs: totalMs, label: 'Timer' }).catch((err) => {
      setFeedbackError(err.message || 'Could not start timer');
    });
  };

  const handleApplyPreset = (mins) => {
    setHours(0);
    setMinutes(mins);
    setSeconds(0);
  };

  const handlePauseTimer = () => {
    if (!runningTimer) return;
    const remainingMs = Math.max(0, runningTimer.fireAt - Date.now());
    setPausedTimerState({ remainingMs, label: runningTimer.label || 'Timer' });
    island.scheduler.remove(runningTimer.id);
  };

  const handleResumeTimer = () => {
    if (!pausedTimerState) return;
    const ms = Math.max(1000, pausedTimerState.remainingMs);
    island.scheduler.addTimer({ durationMs: ms, label: pausedTimerState.label || 'Timer' });
    setPausedTimerState(null);
  };

  const handleCancelTimer = () => {
    if (runningTimer) {
      island.scheduler.remove(runningTimer.id);
    }
    setPausedTimerState(null);
  };

  // Alarms actions
  const alarmsList = schedule.filter((i) => i.kind === 'alarm');

  const handleSaveAlarm = async () => {
    try {
      const timeStr = `${pad(alarmHour)}:${pad(alarmMinute)}`;
      await island.scheduler.addAlarm({
        time: timeStr,
        days: alarmDays,
        label: alarmLabel.trim() || 'Alarm',
      });
      setIsAddingAlarm(false);
      setAlarmLabel('');
      setFeedbackError('');
    } catch (err) {
      setFeedbackError(err.message || 'Could not save alarm');
    }
  };

  const toggleAlarmDay = (d) => {
    setAlarmDays((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d].sort()));
  };

  const showAlarmHour = uses12h ? alarmHour % 12 || 12 : pad(alarmHour);
  const alarmPeriod = alarmHour < 12 ? 'AM' : 'PM';

  const remainingFormatted = useMemo(() => {
    if (pausedTimerState) {
      return formatRemaining(pausedTimerState.remainingMs);
    }
    if (runningTimer) {
      return formatRemaining(Math.max(0, runningTimer.fireAt - now));
    }
    return '00:00';
  }, [pausedTimerState, runningTimer, now]);

  return (
    <div className="clock-experience">
      {/* Top Segmented Mode Selector [ Countdown | Alarms ] - only displayed in countdown mode */}
      {subMode === 'countdown' && (
        <div className="clock-segmented-row">
          <div className="clock-segmented">
            <button
              type="button"
              className={`clock-segmented__btn${subMode === 'countdown' ? ' is-active' : ''}`}
              onClick={() => {
                setSubMode('countdown');
                setIsAddingAlarm(false);
              }}
            >
              Countdown
            </button>
            <button
              type="button"
              className={`clock-segmented__btn${subMode === 'alarms' ? ' is-active' : ''}`}
              onClick={() => setSubMode('alarms')}
            >
              Alarms
            </button>
          </div>
        </div>
      )}

      {feedbackError && <div className="clock-feedback-error">{feedbackError}</div>}

      {/* Surface Subviews Animated Container */}
      <div className="clock-content-wrap">
        <AnimatePresence mode="wait" initial={false}>
          {subMode === 'countdown' ? (
            <motion.div
              key="countdown-view"
              className="countdown-view"
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              transition={contentTransition}
            >
              {runningTimer || pausedTimerState ? (
                /* RUNNING / PAUSED COUNTDOWN VIEW WITH ROLLING DIGITS */
                <div className="countdown-running">
                  <div className="countdown-running__display">
                    <RollingTimeDisplay timeStr={remainingFormatted} />
                    <span className="countdown-running__status">
                      {pausedTimerState ? 'Paused' : 'Counting down'}
                    </span>
                  </div>

                  {/* Action Buttons */}
                  <div className="countdown-running__actions">
                    {pausedTimerState ? (
                      <button
                        type="button"
                        className="clock-btn clock-btn--primary"
                        onClick={handleResumeTimer}
                      >
                        <Icon.Play width={13} height={13} />
                        <span>Resume</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="clock-btn clock-btn--secondary"
                        onClick={handlePauseTimer}
                      >
                        <Icon.Pause width={13} height={13} />
                        <span>Pause</span>
                      </button>
                    )}

                    <button
                      type="button"
                      className="clock-btn clock-btn--cancel"
                      onClick={handleCancelTimer}
                    >
                      <span>Cancel</span>
                    </button>
                  </div>
                </div>
              ) : (
                /* PROPER IOS-LIKE WHEEL PICKER VIEW */
                <div className="countdown-picker">
                  <div className="timer-wheel-container">
                    <WheelPickerWrapper className="timer-wheel-wrapper">
                      <div className="timer-wheel-col">
                        <WheelPicker
                          value={pad(hours)}
                          onValueChange={(val) => setHours(Number(val))}
                          options={HOUR_OPTIONS}
                          infinite
                          optionItemHeight={30}
                          visibleCount={16}
                        />
                        <span className="timer-wheel-label">hours</span>
                      </div>

                      <span className="timer-colon-sep">:</span>

                      <div className="timer-wheel-col">
                        <WheelPicker
                          value={pad(minutes)}
                          onValueChange={(val) => setMinutes(Number(val))}
                          options={MIN_SEC_OPTIONS}
                          infinite
                          optionItemHeight={30}
                          visibleCount={16}
                        />
                        <span className="timer-wheel-label">min</span>
                      </div>

                      <span className="timer-colon-sep">:</span>

                      <div className="timer-wheel-col">
                        <WheelPicker
                          value={pad(seconds)}
                          onValueChange={(val) => setSeconds(Number(val))}
                          options={MIN_SEC_OPTIONS}
                          infinite
                          optionItemHeight={30}
                          visibleCount={16}
                        />
                        <span className="timer-wheel-label">sec</span>
                      </div>
                    </WheelPickerWrapper>
                  </div>

                  {/* Compact Presets */}
                  <div className="countdown-presets">
                    {PRESET_TIMERS.map(({ label, minutes: m }) => (
                      <button
                        key={label}
                        type="button"
                        className={`countdown-chip${minutes === m && hours === 0 && seconds === 0 ? ' is-selected' : ''}`}
                        onClick={() => handleApplyPreset(m)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  {/* Start Button */}
                  <button
                    type="button"
                    className="clock-btn clock-btn--primary clock-btn--start"
                    onClick={handleStartTimer}
                    disabled={hours === 0 && minutes === 0 && seconds === 0}
                  >
                    <span>Start Timer</span>
                  </button>
                </div>
              )}
            </motion.div>
          ) : (
            <motion.div
              key="alarms-view"
              className="alarms-view ios-alarms-panel"
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 8 }}
              transition={contentTransition}
            >
              {/* Header with Back, Eyes, and + or ✓ (Images 1 & 2) */}
              <div className="ios-alarm-header">
                <button
                  type="button"
                  className="ios-alarm-header-btn"
                  onClick={() => {
                    if (isAddingAlarm) setIsAddingAlarm(false);
                    else onBack?.();
                  }}
                  title={isAddingAlarm ? 'Back to Alarms' : 'Back to Utilities'}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 4 }}>
                    <path d="m15 18-6-6 6-6" />
                  </svg>
                  <span>{isAddingAlarm ? 'New alarm' : 'Alarms'}</span>
                </button>

                <button
                  type="button"
                  className="ios-alarm-header-eyes utilities-eyes-btn"
                  onClick={() => {
                    if (isAddingAlarm) setIsAddingAlarm(false);
                    else onBack?.();
                  }}
                  title="Back to Utilities"
                  aria-label="Back to Utilities"
                  style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}
                >
                  <CompanionEyes size="sm" mood="idle" />
                </button>

                <div className="ios-alarm-header-right">
                  {isAddingAlarm ? (
                    <button
                      type="button"
                      className="ios-alarm-save-check"
                      onClick={handleSaveAlarm}
                      title="Save alarm"
                      aria-label="Save alarm"
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="ios-alarm-add-plus"
                      onClick={() => setIsAddingAlarm(true)}
                      title="Add alarm"
                      aria-label="Add alarm"
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="12" y1="5" x2="12" y2="19" />
                        <line x1="5" y1="12" x2="19" y2="12" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>

              <AnimatePresence mode="wait" initial={false}>
                {isAddingAlarm ? (
                  /* DEDICATED ADD ALARM EDITOR (Images 2 & 4) */
                  <motion.div
                    key="alarm-editor"
                    className="ios-alarm-editor"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                  >
                    {/* Wheel Picker Row */}
                    <div className="ios-wheel-container">
                      <WheelPickerColumn
                        value={showAlarmHour}
                        min={uses12h ? 1 : 0}
                        max={uses12h ? 12 : 23}
                        onChange={(h) => {
                          if (uses12h) {
                            const isPm = alarmHour >= 12;
                            const h24 = (h % 12) + (isPm ? 12 : 0);
                            setAlarmHour(h24);
                          } else {
                            setAlarmHour(h);
                          }
                        }}
                        padZeros
                      />

                      <span className="ios-wheel-colon">:</span>

                      <WheelPickerColumn
                        value={alarmMinute}
                        min={0}
                        max={59}
                        onChange={setAlarmMinute}
                        padZeros
                      />

                      {uses12h && (
                        <div className="ios-ampm-col">
                          <button
                            type="button"
                            className={`ios-ampm-btn${alarmPeriod === 'AM' ? ' is-active' : ''}`}
                            onClick={() => {
                              if (alarmHour >= 12) {
                                setAlarmHour((h) => h - 12);
                                playWheelTick();
                              }
                            }}
                          >
                            AM
                          </button>
                          <button
                            type="button"
                            className={`ios-ampm-btn${alarmPeriod === 'PM' ? ' is-active' : ''}`}
                            onClick={() => {
                              if (alarmHour < 12) {
                                setAlarmHour((h) => h + 12);
                                playWheelTick();
                              }
                            }}
                          >
                            PM
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Repeat Days Row */}
                    <div className="ios-repeat-group">
                      <span className="ios-repeat-label">Repeat</span>
                      <div className="ios-repeat-days">
                        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
                          <button
                            key={i}
                            type="button"
                            className={`ios-repeat-day-pill${alarmDays.includes(i) ? ' is-active' : ''}`}
                            onClick={() => {
                              toggleAlarmDay(i);
                              playWheelTick();
                            }}
                            aria-pressed={alarmDays.includes(i)}
                          >
                            {d}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Side-by-Side Label & Sound Rows (Compact & Non-Cropped) */}
                    <div className="ios-alarm-fields ios-alarm-fields--side-by-side">
                      <div className="ios-alarm-field-card">
                        <span className="ios-alarm-field-label">Label</span>
                        <input
                          type="text"
                          className="ios-alarm-field-input"
                          placeholder="Alarm label"
                          value={alarmLabel}
                          onChange={(e) => setAlarmLabel(e.target.value)}
                        />
                      </div>

                      <div className="ios-alarm-field-card" style={{ position: 'relative' }}>
                        <span className="ios-alarm-field-label">Sound</span>
                        <button
                          type="button"
                          className="ios-alarm-sound-selector"
                          onClick={() => setIsSoundDropdownOpen(!isSoundDropdownOpen)}
                        >
                          <span className="ios-alarm-sound-name">{alarmSound}</span>
                          <svg width="10" height="6" viewBox="0 0 10 6" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: isSoundDropdownOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s ease' }}>
                            <path d="m1 1 4 4 4-4" />
                          </svg>
                        </button>

                        {/* Sound Dropdown Menu */}
                        {isSoundDropdownOpen && (
                          <div className="ios-alarm-sound-dropdown ios-glass-card">
                            {ALARM_SOUND_OPTIONS.map((snd) => (
                              <button
                                key={snd}
                                type="button"
                                className={`ios-alarm-sound-option${snd === alarmSound ? ' is-selected' : ''}`}
                                onClick={() => {
                                  setAlarmSound(snd);
                                  setIsSoundDropdownOpen(false);
                                  playWheelTick();
                                }}
                              >
                                {snd === alarmSound ? <span className="ios-sound-check">✓</span> : <span className="ios-sound-check-placeholder" />}
                                <span>{snd}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Bottom Save Button */}
                    <button
                      type="button"
                      className="ios-alarm-save-pill"
                      onClick={handleSaveAlarm}
                    >
                      Save alarm
                    </button>
                  </motion.div>
                ) : (
                  /* ALARMS LIST (Image 1) */
                  <motion.div
                    key="alarm-list"
                    className="ios-alarms-screen"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                  >
                    <div className="ios-alarms-subheading">
                      <Icon.AlarmClock width={13} height={13} />
                      <span>Upcoming alarms</span>
                    </div>

                    <div className="ios-alarms-list">
                      {alarmsList.length === 0 ? (
                        <div className="ios-alarms-empty">
                          <p>No upcoming alarms</p>
                        </div>
                      ) : (
                        alarmsList.map((item, idx) => (
                          <div key={item.id} className="ios-alarm-row-wrap">
                            {idx > 0 && <div className="ios-alarm-divider" />}
                            <div className={`ios-alarm-item${item.enabled ? '' : ' is-off'}`}>
                              <div className="ios-alarm-item__info">
                                <span className="ios-alarm-item__time">{formatAlarmTime(item.time)}</span>
                                <span className="ios-alarm-item__sub">
                                  {item.label || 'Wake up'} · {describeDays(item.days)}
                                </span>
                              </div>
                              <div className="ios-alarm-item__actions">
                                <Switch
                                  checked={item.enabled}
                                  label={`Toggle alarm at ${formatAlarmTime(item.time)}`}
                                  onChange={(on) => island.scheduler.setEnabled(item.id, on)}
                                />
                                <button
                                  type="button"
                                  className="ios-alarm-delete-btn"
                                  onClick={() => island.scheduler.remove(item.id)}
                                  title="Delete alarm"
                                  aria-label="Delete alarm"
                                >
                                  ×
                                </button>
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>

                    {alarmsList.length < 3 && (
                      <button
                        type="button"
                        className="ios-alarm-main-add-btn"
                        onClick={() => setIsAddingAlarm(true)}
                      >
                        + Add alarm
                      </button>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
