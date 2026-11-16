import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { WheelPicker, WheelPickerWrapper } from '@ncdai/react-wheel-picker';
import '@ncdai/react-wheel-picker/style.css';
import { island } from '../../lib/bridge';
import { DAY_LABELS, DAY_NAMES, describeDays, formatAlarmTime, formatRemaining, pad, untilText, uses12h } from '../../lib/format';
import { MOTION, getMotionTransition } from '../../lib/motion';
import { Switch } from '../bits';
import { Icon } from '../icons';

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

export default function ClockPanel({ schedule = [], now = Date.now(), onBack }) {
  const [subMode, setSubMode] = useState('countdown'); // 'countdown' | 'alarms'
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
  const [feedbackError, setFeedbackError] = useState('');

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
      {/* Top Segmented Mode Selector [ Countdown | Alarms ] */}
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

        {subMode === 'alarms' && !isAddingAlarm && (
          <button
            type="button"
            className="clock-add-alarm-btn"
            onClick={() => setIsAddingAlarm(true)}
            title="Add Alarm"
            aria-label="Add Alarm"
          >
            <Icon.Plus width={12} height={12} />
            <span>New Alarm</span>
          </button>
        )}
      </div>

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
              className="alarms-view"
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 8 }}
              transition={contentTransition}
            >
              {isAddingAlarm ? (
                /* DEDICATED ADD ALARM EDITOR */
                <div className="alarm-editor">
                  <div className="alarm-editor__time">
                    <DigitSpinner
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
                      label="Hour"
                    />
                    <span className="countdown-colon">:</span>
                    <DigitSpinner
                      value={alarmMinute}
                      min={0}
                      max={59}
                      onChange={setAlarmMinute}
                      label="Minute"
                    />
                    {uses12h && (
                      <button
                        type="button"
                        className="alarm-period-toggle"
                        onClick={() => setAlarmHour((h) => (h + 12) % 24)}
                      >
                        {alarmPeriod}
                      </button>
                    )}
                  </div>

                  {/* Repeat Days */}
                  <div className="alarm-days-row" role="group" aria-label="Repeat days">
                    {DAY_LABELS.map((d, i) => (
                      <button
                        key={i}
                        type="button"
                        className={`alarm-day-pill${alarmDays.includes(i) ? ' is-on' : ''}`}
                        onClick={() => toggleAlarmDay(i)}
                        aria-pressed={alarmDays.includes(i)}
                      >
                        {d}
                      </button>
                    ))}
                  </div>

                  {/* Optional Label */}
                  <input
                    type="text"
                    className="alarm-label-input"
                    placeholder="Alarm label (optional)"
                    maxLength={40}
                    value={alarmLabel}
                    onChange={(e) => setAlarmLabel(e.target.value)}
                  />

                  {/* Editor Actions */}
                  <div className="alarm-editor__actions">
                    <button
                      type="button"
                      className="clock-btn clock-btn--secondary"
                      onClick={() => setIsAddingAlarm(false)}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="clock-btn clock-btn--primary"
                      onClick={handleSaveAlarm}
                    >
                      Save Alarm
                    </button>
                  </div>
                </div>
              ) : (
                /* ALARMS LIST */
                <div className="alarms-list-container">
                  {alarmsList.length === 0 ? (
                    <div className="alarms-empty">
                      <Icon.Bell width={24} height={24} />
                      <p>No alarms set</p>
                      <button
                        type="button"
                        className="clock-btn clock-btn--primary"
                        onClick={() => setIsAddingAlarm(true)}
                      >
                        Set an Alarm
                      </button>
                    </div>
                  ) : (
                    <ul className="alarms-list">
                      {alarmsList.map((item) => (
                        <li key={item.id} className={`alarm-row${item.enabled ? '' : ' is-off'}`}>
                          <div className="alarm-row__info">
                            <span className="alarm-row__time">{formatAlarmTime(item.time)}</span>
                            <span className="alarm-row__sub">
                              {item.label} · {describeDays(item.days)}
                              {item.enabled && item.fireAt ? ` · ${untilText(item.fireAt - now)}` : ''}
                            </span>
                          </div>
                          <div className="alarm-row__actions">
                            <Switch
                              checked={item.enabled}
                              label={`Toggle alarm at ${formatAlarmTime(item.time)}`}
                              onChange={(on) => island.scheduler.setEnabled(item.id, on)}
                            />
                            <button
                              type="button"
                              className="alarm-delete-btn"
                              onClick={() => island.scheduler.remove(item.id)}
                              title="Delete alarm"
                              aria-label="Delete alarm"
                            >
                              <Icon.Trash width={13} height={13} />
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
