import { AnimatePresence, motion } from 'framer-motion';
import { useState } from 'react';
import { island } from '../../lib/bridge';
import { DAY_LABELS, DAY_NAMES, describeDays, formatAlarmTime, formatRemaining, pad, untilText, uses12h } from '../../lib/format';
import { useTyping } from '../../hooks/useTyping';
import { Ring, Switch } from '../bits';
import { Icon } from '../icons';

const QUICK_MINUTES = [1, 5, 10, 15, 25, 45];

function Spin({ value, label, onUp, onDown, hint }) {
  const onWheel = (e) => (e.deltaY < 0 ? onUp(true) : onDown(true));
  return (
    <div className="spin" onWheel={onWheel} title={hint}>
      <button type="button" className="spin__btn" aria-label={`Increase ${label}`} onClick={() => onUp(false)}>
        <Icon.Chevron width={14} height={14} />
      </button>
      <div className="spin__val">{value}</div>
      <button type="button" className="spin__btn spin__btn--down" aria-label={`Decrease ${label}`} onClick={() => onDown(false)}>
        <Icon.Chevron width={14} height={14} />
      </button>
    </div>
  );
}

function TimerRow({ item, now }) {
  const remaining = item.fireAt - now;
  return (
    <motion.li className="row" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 24 }} transition={{ duration: 0.2 }}>
      <Ring fraction={remaining / item.durationMs} size={30} stroke={3} color="var(--c-timer)" />
      <div className="row__main">
        <div className="row__big">{formatRemaining(remaining)}</div>
        <div className="row__sub">{item.label || 'Timer'}</div>
      </div>
      <button type="button" className="icon-btn icon-btn--sm" aria-label="Cancel timer" onClick={() => island.scheduler.remove(item.id)}>
        <Icon.Close width={14} height={14} />
      </button>
    </motion.li>
  );
}

function AlarmRow({ item, now }) {
  const sub = [item.label, describeDays(item.days), item.enabled && item.fireAt ? untilText(item.fireAt - now) : 'Off']
    .filter(Boolean)
    .join(' · ');
  return (
    <motion.li className={`row${item.enabled ? '' : ' is-off'}`} initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 24 }} transition={{ duration: 0.2 }}>
      <span className="row__bell">
        <Icon.Bell width={16} height={16} />
      </span>
      <div className="row__main">
        <div className="row__big">{formatAlarmTime(item.time)}</div>
        <div className="row__sub">{sub}</div>
      </div>
      <Switch checked={item.enabled} label={`Alarm at ${formatAlarmTime(item.time)}`} onChange={(on) => island.scheduler.setEnabled(item.id, on)} />
      <button type="button" className="icon-btn icon-btn--sm" aria-label="Delete alarm" onClick={() => island.scheduler.remove(item.id)}>
        <Icon.Close width={14} height={14} />
      </button>
    </motion.li>
  );
}

export default function ClockPanel({ schedule, now, setTyping }) {
  const typing = useTyping(setTyping);
  const [hour, setHour] = useState(() => (new Date().getHours() + 1) % 24);
  const [minute, setMinute] = useState(0);
  const [days, setDays] = useState([]);
  const [label, setLabel] = useState('');
  const [custom, setCustom] = useState('');
  const [error, setError] = useState('');

  const showHour = uses12h ? hour % 12 || 12 : pad(hour);
  const period = hour < 12 ? 'AM' : 'PM';

  const run = async (promise) => {
    const res = await promise;
    setError(res && res.ok === false ? res.error : '');
    return res;
  };

  const startTimer = (minutes) => run(island.scheduler.addTimer({ durationMs: minutes * 60000 }));

  const startCustom = async () => {
    const minutes = Number.parseInt(custom, 10);
    if (!Number.isFinite(minutes) || minutes < 1 || minutes > 999) {
      setError('Enter a number of minutes between 1 and 999');
      return;
    }
    const res = await startTimer(minutes);
    if (res.ok) setCustom('');
  };

  const addAlarm = async () => {
    const res = await run(island.scheduler.addAlarm({ time: `${pad(hour)}:${pad(minute)}`, days, label: label.trim() }));
    if (res.ok) setLabel('');
  };

  const toggleDay = (d) => setDays((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d].sort()));
  const onEnter = (fn) => (e) => {
    if (e.key === 'Enter') {
      fn();
      e.currentTarget.blur();
    }
  };

  return (
    <div className="clock">
      <div className="chips">
        {QUICK_MINUTES.map((m) => (
          <button key={m} type="button" className="chip" onClick={() => startTimer(m)}>
            {m}m
          </button>
        ))}
        <input
          className="field field--mini"
          inputMode="numeric"
          placeholder="min"
          aria-label="Custom timer in minutes"
          maxLength={3}
          value={custom}
          onChange={(e) => setCustom(e.target.value.replace(/\D/g, ''))}
          onKeyDown={onEnter(startCustom)}
          {...typing}
        />
        <button type="button" className="chip chip--go" aria-label="Start custom timer" onClick={startCustom}>
          <Icon.Plus width={14} height={14} />
        </button>
      </div>

      <div className="creator">
        <div className="creator__time">
          <Spin value={showHour} label="hour" hint="Scroll to change" onUp={() => setHour((h) => (h + 1) % 24)} onDown={() => setHour((h) => (h + 23) % 24)} />
          <span className="creator__colon">:</span>
          <Spin
            value={pad(minute)}
            label="minute"
            hint="Click for 5 minutes, scroll for 1"
            onUp={(wheel) => setMinute((m) => (m + (wheel ? 1 : 5)) % 60)}
            onDown={(wheel) => setMinute((m) => (m + 60 - (wheel ? 1 : 5)) % 60)}
          />
          {uses12h && (
            <button type="button" className="period" aria-label="Toggle AM or PM" onClick={() => setHour((h) => (h + 12) % 24)}>
              {period}
            </button>
          )}
        </div>
        <div className="creator__side">
          <div className="days" role="group" aria-label="Repeat on">
            {DAY_LABELS.map((d, i) => (
              <button key={i} type="button" className={`day${days.includes(i) ? ' is-on' : ''}`} aria-pressed={days.includes(i)} aria-label={DAY_NAMES[i]} onClick={() => toggleDay(i)}>
                {d}
              </button>
            ))}
          </div>
          <div className="creator__row">
            <input
              className="field"
              placeholder="Label (optional)"
              aria-label="Alarm label"
              maxLength={40}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              onKeyDown={onEnter(addAlarm)}
              {...typing}
            />
            <button type="button" className="btn btn--solid" onClick={addAlarm}>
              Add alarm
            </button>
          </div>
        </div>
      </div>

      {error && <div className="clock__error" role="alert">{error}</div>}

      <ul className="list scroll">
        <AnimatePresence initial={false}>
          {schedule.map((item) =>
            item.kind === 'timer' ? <TimerRow key={item.id} item={item} now={now} /> : <AlarmRow key={item.id} item={item} now={now} />,
          )}
        </AnimatePresence>
        {schedule.length === 0 && <li className="list__empty">No timers or alarms yet. Tap a timer above or set an alarm.</li>}
      </ul>
    </div>
  );
}
