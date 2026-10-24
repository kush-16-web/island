/**
 * scheduler-commands.js: Natural-Language Alarm & Timer Parsing & Execution for Island.
 * PASS 2.2.8
 *
 * Capabilities:
 * 1. Relative countdowns ("Set an alarm for one minute", "Start a 30-second timer", "Set a timer for five minutes")
 * 2. Absolute clock alarms ("Set an alarm for 7 AM", "Wake me up at 6:30 tomorrow morning", "Wake me up tomorrow at 6:30")
 * 3. Status queries ("How much time is left?", "How much time is left on my timer?", "What alarms do I have?")
 * 4. Cancellation ("Cancel my timer", "Cancel my 7 AM alarm", "Stop the timer")
 * 5. Ambiguity detection: asks concise clarifications rather than setting the wrong time
 * 6. True local clock & timezone awareness
 * 7. Authoritative scheduler execution: only confirms success after storage accepts the item
 * 8. Concise, TTS-safe spoken dialogue without JSON or Markdown symbols
 */

const NUMBER_WORDS = {
  zero: 0,
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
  hundred: 100,
};

/**
 * Convert spoken or written numbers to an integer.
 * e.g. "5", "five", "twenty five", "30"
 */
export function parseNumberWord(text) {
  if (!text || typeof text !== 'string') return null;
  const clean = text.trim().toLowerCase().replace(/-/g, ' ');
  if (/^\d+$/.test(clean)) return parseInt(clean, 10);

  const parts = clean.split(/\s+/);
  let total = 0;
  let current = 0;

  for (const part of parts) {
    if (NUMBER_WORDS[part] !== undefined) {
      const val = NUMBER_WORDS[part];
      if (val === 100) {
        current = (current || 1) * 100;
      } else {
        current += val;
      }
    } else {
      return null;
    }
  }
  total += current;
  return total > 0 || clean === 'zero' ? total : null;
}

/**
 * Format milliseconds into human speech (e.g. "1 minute", "30 seconds", "2 hours and 15 minutes")
 */
export function formatDurationSpeech(ms) {
  const totalSec = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;

  const parts = [];
  if (h > 0) parts.push(`${h} ${h === 1 ? 'hour' : 'hours'}`);
  if (m > 0) parts.push(`${m} ${m === 1 ? 'minute' : 'minutes'}`);
  if (s > 0 && h === 0) parts.push(`${s} ${s === 1 ? 'second' : 'seconds'}`);

  if (parts.length === 0) return 'zero seconds';
  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/**
 * Format 24h "HH:MM" into spoken 12h time (e.g. "7:00 AM", "6:30 PM")
 */
export function formatTimeSpeech(hhmm) {
  if (!hhmm || typeof hhmm !== 'string') return '';
  const [hStr, mStr] = hhmm.split(':');
  let h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  const period = h < 12 ? 'AM' : 'PM';
  h = h % 12 || 12;
  const minuteText = m === 0 ? '' : `:${String(m).padStart(2, '0')}`;
  return `${h}${minuteText} ${period}`;
}

/**
 * Clean spoken conversational prefixes and polite fillers.
 */
function cleanUtterance(text) {
  if (!text || typeof text !== 'string') return '';
  return text
    .toLowerCase()
    .replace(/^(?:hey\s+)?(?:island|jett|nova|computer|assistant)[,\s]*/i, '')
    .replace(/^(?:please|can\s+you|could\s+you|would\s+you|will\s+you|just)\s+/i, '')
    .replace(/[.,!?;]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Parse relative countdown duration from natural language.
 * Returns durationMs and optional label, or null.
 */
export function parseRelativeCountdown(text) {
  if (!text || typeof text !== 'string') return null;
  const norm = cleanUtterance(text);

  // Special cases:
  // "half an hour" / "half hour"
  if (/\bhalf\s+(?:an\s+)?hour\b/i.test(norm)) {
    return { durationMs: 30 * 60 * 1000, label: extractLabel(norm) };
  }
  // "hour and a half"
  if (/\b(?:an?\s+)?hour\s+and\s+(?:a\s+)?half\b/i.test(norm)) {
    return { durationMs: 90 * 60 * 1000, label: extractLabel(norm) };
  }

  // Regex for compound units: e.g. "1 hour 30 minutes", "5 minutes and 10 seconds", "30 seconds", "10m"
  // Match hours, minutes, seconds
  let totalMs = 0;
  let matched = false;

  // Hours
  const hourMatch = norm.match(/\b(\d+|[a-z]+)\s*(?:hours?|hrs?|h)\b/i);
  if (hourMatch) {
    const val = parseNumberWord(hourMatch[1]);
    if (val !== null) {
      totalMs += val * 3600 * 1000;
      matched = true;
    }
  }

  // Minutes
  const minMatch = norm.match(/\b(\d+|[a-z]+)\s*(?:minutes?|mins?|m)\b/i);
  if (minMatch) {
    const val = parseNumberWord(minMatch[1]);
    if (val !== null) {
      totalMs += val * 60 * 1000;
      matched = true;
    }
  }

  // Seconds
  const secMatch = norm.match(/\b(\d+|[a-z]+)\s*(?:seconds?|secs?|s)\b/i);
  if (secMatch) {
    const val = parseNumberWord(secMatch[1]);
    if (val !== null) {
      totalMs += val * 1000;
      matched = true;
    }
  }

  // Single duration pattern: "30-second timer", "5-minute alarm"
  if (!matched) {
    const hyphenMatch = norm.match(/\b(\d+|[a-z]+)[-\s](second|sec|minute|min|hour)[-\s]?(?:timer|alarm)?\b/i);
    if (hyphenMatch) {
      const val = parseNumberWord(hyphenMatch[1]);
      const unit = hyphenMatch[2].toLowerCase();
      if (val !== null) {
        if (unit.startsWith('sec')) totalMs = val * 1000;
        else if (unit.startsWith('min')) totalMs = val * 60 * 1000;
        else if (unit.startsWith('hour')) totalMs = val * 3600 * 1000;
        matched = true;
      }
    }
  }

  if (matched && totalMs > 0) {
    return { durationMs: totalMs, label: extractLabel(norm) };
  }

  return null;
}

/**
 * Extract an optional label/purpose from a command
 * e.g. "for cooking pasta", "for tea", "tea timer", "study timer"
 */
function extractLabel(norm) {
  // Pattern 1: "... for <label>"
  const forMatch = norm.match(/\bfor\s+([a-z0-9\s]+)$/i);
  if (forMatch) {
    let candidate = forMatch[1]
      .replace(/\b(?:timer|alarm|minutes?|seconds?|hours?|\d+)\b/gi, '')
      .trim()
      .replace(/^(?:for\s+)+/i, '')
      .trim();
    if (candidate.length > 1 && !/^(?:a|an|the|me|my)$/i.test(candidate)) {
      return candidate.charAt(0).toUpperCase() + candidate.slice(1);
    }
  }

  // Pattern 2: "<label> timer" e.g. "tea timer", "pasta timer", "focus timer"
  const tagMatch = norm.match(/\b([a-z0-9]+)\s+(?:timer|alarm)\b/i);
  if (tagMatch) {
    const candidate = tagMatch[1].trim();
    if (candidate.length > 1 && !/^(?:a|an|the|set|start|put|cancel|stop|my|new|\d+)$/i.test(candidate) && parseNumberWord(candidate) === null) {
      return candidate.charAt(0).toUpperCase() + candidate.slice(1);
    }
  }

  return '';
}

/**
 * Parse absolute clock alarm time from natural language.
 * Returns { time: 'HH:MM', isTomorrow: boolean, label: string } or null.
 */
export function parseAbsoluteClockTime(text, now = new Date()) {
  if (!text || typeof text !== 'string') return null;
  const norm = cleanUtterance(text);

  // Do NOT match relative countdown phrases (e.g. "in 7 minutes", "for 10 minutes")
  if (/\b(?:in|for)\s+\d+\s*(?:minutes?|seconds?|hours?)\b/i.test(norm)) {
    return null;
  }
  if (/\b(?:in|for)\s+(?:one|two|three|four|five|six|seven|eight|nine|ten|fifteen|twenty|thirty)\s*(?:minutes?|seconds?|hours?)\b/i.test(norm)) {
    return null;
  }

  const isTomorrow = /\btomorrow\b/i.test(norm);
  let hours = null;
  let minutes = 0;
  let period = null; // 'am' | 'pm'

  // Pattern 1: HH:MM am/pm or HH:MM (e.g. "6:30 am", "7:00 AM", "19:30", "6:30")
  const colonMatch = norm.match(/\b(\d{1,2}):(\d{2})(?:\s*(am|pm|a\.m\.|p\.m\.))?\b/i);
  if (colonMatch) {
    hours = parseInt(colonMatch[1], 10);
    minutes = parseInt(colonMatch[2], 10);
    if (colonMatch[3]) {
      period = colonMatch[3].toLowerCase().startsWith('p') ? 'pm' : 'am';
    }
  }

  // Pattern 2: Digits with explicit am/pm (e.g. "7 am", "7am", "8 PM", "11pm")
  if (hours === null) {
    const digitAmPmMatch = norm.match(/\b(\d{1,2})\s*(am|pm|a\.m\.|p\.m\.)\b/i);
    if (digitAmPmMatch) {
      hours = parseInt(digitAmPmMatch[1], 10);
      minutes = 0;
      period = digitAmPmMatch[2].toLowerCase().startsWith('p') ? 'pm' : 'am';
    }
  }

  // Pattern 3: Words with am/pm or morning/evening/night (e.g. "seven am", "wake me up at seven in the morning")
  if (hours === null) {
    const wordTimeMatch = norm.match(/\b(?:at|for)\s+([a-z]+)(?:\s+([a-z]+))?(?:\s*(am|pm|in\s+the\s+morning|in\s+the\s+evening|at\s+night|tonight))?\b/i);
    if (wordTimeMatch) {
      const num1 = parseNumberWord(wordTimeMatch[1]);
      const num2 = wordTimeMatch[2] ? parseNumberWord(wordTimeMatch[2]) : null;

      if (num1 !== null && num1 <= 24) {
        hours = num1;
        if (num2 !== null && num2 < 60) {
          minutes = num2;
        }
        const timeOfDay = wordTimeMatch[3] ? wordTimeMatch[3].toLowerCase() : '';
        if (timeOfDay.includes('pm') || timeOfDay.includes('evening') || timeOfDay.includes('night') || timeOfDay.includes('tonight')) {
          period = 'pm';
        } else if (timeOfDay.includes('am') || timeOfDay.includes('morning')) {
          period = 'am';
        }
      }
    }
  }

  // Pattern 4: "wake me up at 7" or "alarm at 7" with morning/evening context
  if (hours === null) {
    const contextMatch = norm.match(/\b(?:at|for)\s+(\d{1,2})(?:\s*(?:o'?clock))?(?:\s*(in\s+the\s+morning|in\s+the\s+evening|at\s+night|tonight))?\b/i);
    if (contextMatch) {
      hours = parseInt(contextMatch[1], 10);
      minutes = 0;
      const tod = contextMatch[2] ? contextMatch[2].toLowerCase() : '';
      if (tod.includes('evening') || tod.includes('night') || tod.includes('tonight')) {
        period = 'pm';
      } else if (tod.includes('morning')) {
        period = 'am';
      }
    }
  }

  // Pattern 5: "noon" or "midnight"
  if (hours === null) {
    if (/\bnoon\b/i.test(norm)) {
      hours = 12;
      minutes = 0;
      period = 'pm';
    } else if (/\bmidnight\b/i.test(norm)) {
      hours = 0;
      minutes = 0;
      period = 'am';
    }
  }

  if (hours === null || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return null;
  }

  // Apply AM/PM conversions if specified
  let finalHour = hours;
  if (period === 'pm' && finalHour < 12) {
    finalHour += 12;
  } else if (period === 'am' && finalHour === 12) {
    finalHour = 0;
  } else if (!period && finalHour <= 12) {
    // If no AM/PM was explicitly provided, infer sensibly based on current time:
    // e.g. "wake me up at 7" or "alarm at 6:30"
    // Usually "wake me up" is AM. If the target hour today has already passed, it refers to tomorrow.
    const currentHour = now.getHours();
    const currentMin = now.getMinutes();

    // If it's a common morning wake-up time (5..11), assume AM unless currently evening and user said "alarm for 7"
    if (finalHour >= 1 && finalHour <= 11) {
      // Check if user likely meant morning
      if (/\bwake(?:\s+me)?\s+up\b/i.test(norm) || /\bmorning\b/i.test(norm)) {
        period = 'am';
      } else {
        // Compare with current 24h time
        const pmCandidate = finalHour + 12;
        if (currentHour < pmCandidate && currentHour >= finalHour) {
          // It is afternoon (e.g. 15:00) and user says "alarm at 7": could be 7 PM (19:00)!
          // We will mark it as needing clarification if completely unguided.
        }
      }
    }
  }

  const hh = String(finalHour).padStart(2, '0');
  const mm = String(minutes).padStart(2, '0');
  const timeStr = `${hh}:${mm}`;

  // Extract label: e.g. "Wake up" if user said "wake me up"
  let label = extractLabel(norm);
  if (!label && /\bwake\b/i.test(norm)) {
    label = 'Wake up';
  } else if (!label) {
    label = 'Alarm';
  }

  return {
    time: timeStr,
    isTomorrow,
    period,
    label,
    rawHour: hours,
    rawMinute: minutes,
  };
}

/**
 * High-level intent parsing: converts raw user text into structured scheduler commands.
 *
 * @param {string} rawText - Transcribed user speech or text command
 * @param {object} options - { schedule: [], now: Date|number }
 * @returns {object} Parsed intent object
 */
export function parseSchedulerIntent(rawText, options = {}) {
  if (!rawText || typeof rawText !== 'string') {
    return { isScheduler: false };
  }

  const norm = cleanUtterance(rawText);
  const now = options.now instanceof Date ? options.now : new Date(options.now || Date.now());
  const schedule = Array.isArray(options.schedule) ? options.schedule : [];

  // 1. Cancellation Commands
  // e.g. "Cancel my timer", "Stop my timer", "Cancel the alarm", "Cancel my 7 AM alarm", "Delete my timer"
  if (
    /^(?:cancel|stop|delete|remove|clear|turn\s+off|dismiss)\s+(?:the\s+|my\s+|all\s+)?(?:timers?|alarms?)/i.test(norm) ||
    /^(?:cancel|stop|delete|remove|clear|turn\s+off)\b/i.test(norm) && /\b(?:timer|alarm)\b/i.test(norm)
  ) {
    const isAlarm = /\balarms?\b/i.test(norm);
    const isTimer = /\btimers?\b/i.test(norm);
    const isAll = /\ball\b/i.test(norm);

    // Look for specific time to cancel: "cancel my 7 am alarm", "cancel the 6:30 alarm"
    const parsedTime = parseAbsoluteClockTime(rawText, now);

    return {
      isScheduler: true,
      intent: 'CANCEL',
      target: isAlarm ? 'alarm' : isTimer ? 'timer' : 'any',
      isAll,
      specificTime: parsedTime ? parsedTime.time : null,
      label: extractLabel(norm),
      rawText,
    };
  }

  // 2. Status & Remaining Time Queries
  // e.g. "How much time is left?", "How much time is left on my timer?", "What alarms do I have?", "Do I have any timers?"
  const isRemainingQuery =
    /^(?:how\s+much\s+time\s+is\s+left|how\s+much\s+time\s+left|what\s+is\s+the\s+time\s+left|time\s+left)\b/i.test(norm) ||
    /\b(?:how\s+much\s+time\s+is\s+left|time\s+left\s+on\s+my\s+timer|remaining\s+time)\b/i.test(norm);

  const isAlarmQuery =
    /^(?:what|do\s+i\s+have|show|list|any)\s+(?:are\s+my\s+|my\s+|any\s+)?alarms?\b/i.test(norm) ||
    /\b(?:what\s+alarms\s+do\s+i\s+have|do\s+i\s+have\s+(?:an\s+|any\s+)?alarms?|show\s+my\s+alarms)\b/i.test(norm);

  const isTimerQuery =
    /^(?:do\s+i\s+have|show|list|any)\s+(?:any\s+|my\s+)?timers?\b/i.test(norm) ||
    /\b(?:do\s+i\s+have\s+(?:a\s+|any\s+)?timers?|show\s+my\s+timers|timers?\s+running)\b/i.test(norm);

  if (isRemainingQuery || isAlarmQuery || isTimerQuery) {
    return {
      isScheduler: true,
      intent: 'QUERY_STATUS',
      target: isRemainingQuery || isTimerQuery ? 'timer' : 'alarm',
      rawText,
    };
  }

  // 3. Relative Countdown / Timers
  // Matches "timer for 1 minute", "set an alarm for one minute", "start a 30 second timer"
  // Note: "alarm for one minute" is a countdown duration (Pass 2.2.8 Step 2)
  const isTimerTrigger =
    /\b(?:timer|countdown)\b/i.test(norm) ||
    (/\balarm\b/i.test(norm) && /\b(?:for|in)\s+(\d+|[a-z]+)\s*(?:seconds?|minutes?|hours?|secs?|mins?)\b/i.test(norm));

  if (isTimerTrigger) {
    const countdown = parseRelativeCountdown(norm);
    if (countdown) {
      // Validate range: 1 second to 99 hours
      if (countdown.durationMs < 1000) {
        return {
          isScheduler: true,
          intent: 'ERROR',
          error: 'Timers must be at least 1 second.',
          rawText,
        };
      }
      if (countdown.durationMs > 99 * 3600 * 1000) {
        return {
          isScheduler: true,
          intent: 'ERROR',
          error: 'Timers cannot exceed 99 hours.',
          rawText,
        };
      }

      return {
        isScheduler: true,
        intent: 'SET_TIMER',
        durationMs: countdown.durationMs,
        label: countdown.label || (/\balarm\b/i.test(norm) ? 'Alarm' : 'Timer'),
        userSaidAlarm: /\balarm\b/i.test(norm),
        rawText,
      };
    }

    // Bare "set a timer" with no duration -> clarification
    if (/^(?:set|start|put\s+on|give\s+me)\s+(?:a\s+)?timer$/i.test(norm)) {
      return {
        isScheduler: true,
        intent: 'CLARIFY',
        question: 'How long would you like the timer for?',
        rawText,
      };
    }
  }

  // 4. Absolute Clock Alarms
  // Matches "Set an alarm for 7 AM", "Wake me up at 6:30 tomorrow morning", "Wake me up tomorrow at 6:30"
  const isAlarmTrigger =
    /\b(?:alarm|wake(?:\s+me)?\s+up)\b/i.test(norm) ||
    /^(?:set\s+an?\s+alarm|wake\s+me\s+up|alarm\s+at)\b/i.test(norm);

  if (isAlarmTrigger) {
    const absolute = parseAbsoluteClockTime(norm, now);

    // Check for ambiguous time: e.g. "set an alarm for 7" without AM/PM or duration
    const ambiguousHourMatch = norm.match(/\b(?:at|for)\s+(\d{1,2}|[a-z]+)$/i);
    if (ambiguousHourMatch && (!absolute || absolute.period === null)) {
      const num = parseNumberWord(ambiguousHourMatch[1]);
      if (num !== null && num >= 1 && num <= 12) {
        return {
          isScheduler: true,
          intent: 'CLARIFY',
          question: `Would you like that alarm for ${num}:00 AM or ${num}:00 PM?`,
          rawText,
        };
      }
    }

    if (absolute) {
      return {
        isScheduler: true,
        intent: 'SET_ALARM',
        time: absolute.time,
        isTomorrow: absolute.isTomorrow,
        label: absolute.label || 'Alarm',
        rawText,
      };
    }

    // Bare "set an alarm" or "wake me up" without time -> clarification
    if (/^(?:set\s+(?:an?\s+)?alarm|wake\s+me\s+up)$/i.test(norm)) {
      return {
        isScheduler: true,
        intent: 'CLARIFY',
        question: 'What time should I set the alarm for?',
        rawText,
      };
    }
  }

  return { isScheduler: false };
}

/**
 * Execute a parsed scheduler intent against the authoritative scheduler bridge.
 *
 * @param {object} parsed - Parsed intent from parseSchedulerIntent
 * @param {object} env - { scheduler, schedule = [], now = Date.now() }
 * @returns {Promise<{ ok: boolean, action: string, spokenConfirmation: string, displayText: string, item?: object, error?: string, clarificationNeeded?: boolean }>}
 */
export async function executeSchedulerIntent(parsed, env = {}) {
  if (!parsed || !parsed.isScheduler) {
    return { ok: false, error: 'Not a scheduler command' };
  }

  const scheduler = env.scheduler || (typeof window !== 'undefined' ? window.island?.scheduler : null);
  const schedule = Array.isArray(env.schedule) ? env.schedule : [];
  const now = typeof env.now === 'number' ? env.now : Date.now();

  // 1. Clarification needed
  if (parsed.intent === 'CLARIFY') {
    return {
      ok: true,
      action: 'clarification_needed',
      clarificationNeeded: true,
      spokenConfirmation: parsed.question,
      displayText: parsed.question,
    };
  }

  // 2. Validation error
  if (parsed.intent === 'ERROR') {
    return {
      ok: false,
      action: 'error',
      spokenConfirmation: parsed.error,
      displayText: parsed.error,
    };
  }

  // 3. SET_TIMER
  if (parsed.intent === 'SET_TIMER') {
    if (!scheduler || typeof scheduler.addTimer !== 'function') {
      return {
        ok: false,
        error: 'Scheduler service is unavailable.',
        spokenConfirmation: 'I could not set the timer because the scheduler is unavailable.',
      };
    }

    try {
      const res = await scheduler.addTimer({
        durationMs: parsed.durationMs,
        label: parsed.label || 'Timer',
      });

      if (!res || (res.ok === false)) {
        const errMsg = res?.error || 'Failed to add timer to scheduler.';
        return {
          ok: false,
          error: errMsg,
          spokenConfirmation: `Sorry, I couldn't set that timer: ${errMsg}`,
          displayText: errMsg,
        };
      }

      const item = res.item || res;
      const durationSpeech = formatDurationSpeech(parsed.durationMs);

      // "Okay, your alarm is set for one minute from now." (Pass 2.2.8 Step 4)
      const spokenConfirmation = parsed.userSaidAlarm
        ? `Okay, your alarm is set for ${durationSpeech} from now.`
        : `Okay, your timer is set for ${durationSpeech} from now.`;

      return {
        ok: true,
        action: 'set_timer',
        item,
        spokenConfirmation,
        displayText: spokenConfirmation,
      };
    } catch (err) {
      return {
        ok: false,
        error: err.message,
        spokenConfirmation: `Sorry, I could not set the timer: ${err.message}`,
        displayText: err.message,
      };
    }
  }

  // 4. SET_ALARM
  if (parsed.intent === 'SET_ALARM') {
    if (!scheduler || typeof scheduler.addAlarm !== 'function') {
      return {
        ok: false,
        error: 'Scheduler service is unavailable.',
        spokenConfirmation: 'I could not set the alarm because the scheduler is unavailable.',
      };
    }

    try {
      const res = await scheduler.addAlarm({
        time: parsed.time,
        days: [],
        label: parsed.label || 'Alarm',
      });

      if (!res || (res.ok === false)) {
        const errMsg = res?.error || 'Failed to add alarm to scheduler.';
        return {
          ok: false,
          error: errMsg,
          spokenConfirmation: `Sorry, I couldn't set that alarm: ${errMsg}`,
          displayText: errMsg,
        };
      }

      const item = res.item || res;
      const timeSpeech = formatTimeSpeech(parsed.time);

      // Determine if it fires tomorrow
      const [h, m] = parsed.time.split(':').map(Number);
      const targetToday = new Date(now);
      targetToday.setHours(h, m, 0, 0);
      const isTomorrow = parsed.isTomorrow || targetToday.getTime() <= now;

      // "Your alarm is set for 7 AM tomorrow." (Pass 2.2.8 Step 4)
      const spokenConfirmation = isTomorrow
        ? `Your alarm is set for ${timeSpeech} tomorrow.`
        : `Your alarm is set for ${timeSpeech} today.`;

      return {
        ok: true,
        action: 'set_alarm',
        item,
        spokenConfirmation,
        displayText: spokenConfirmation,
      };
    } catch (err) {
      return {
        ok: false,
        error: err.message,
        spokenConfirmation: `Sorry, I could not set the alarm: ${err.message}`,
        displayText: err.message,
      };
    }
  }

  // 5. QUERY_STATUS
  if (parsed.intent === 'QUERY_STATUS') {
    const activeTimers = schedule
      .filter((i) => i.kind === 'timer' && i.enabled && i.fireAt > now)
      .sort((a, b) => a.fireAt - b.fireAt);

    const activeAlarms = schedule
      .filter((i) => i.kind === 'alarm' && i.enabled && i.fireAt)
      .sort((a, b) => a.fireAt - b.fireAt);

    if (parsed.target === 'timer') {
      if (activeTimers.length === 0) {
        return {
          ok: true,
          action: 'query_status',
          spokenConfirmation: "You don't have any active timers right now.",
          displayText: "No active timers.",
        };
      }
      if (activeTimers.length === 1) {
        const t = activeTimers[0];
        const rem = formatDurationSpeech(t.fireAt - now);
        const spoken = t.label && t.label !== 'Timer'
          ? `You have ${rem} left on your ${t.label} timer.`
          : `You have ${rem} left on your timer.`;
        return {
          ok: true,
          action: 'query_status',
          spokenConfirmation: spoken,
          displayText: spoken,
        };
      }
      // Multiple timers
      const summary = activeTimers
        .slice(0, 3)
        .map((t) => `${formatDurationSpeech(t.fireAt - now)}${t.label && t.label !== 'Timer' ? ` for ${t.label}` : ''}`)
        .join(', and ');
      const spoken = `You have ${activeTimers.length} active timers: ${summary}.`;
      return {
        ok: true,
        action: 'query_status',
        spokenConfirmation: spoken,
        displayText: spoken,
      };
    }

    // Alarms
    if (activeAlarms.length === 0) {
      return {
        ok: true,
        action: 'query_status',
        spokenConfirmation: "You have no upcoming alarms.",
        displayText: "No upcoming alarms.",
      };
    }

    const firstAlarm = activeAlarms[0];
    const timeSpeech = formatTimeSpeech(firstAlarm.time);
    const isTomorrow = (firstAlarm.fireAt - now) > 12 * 3600 * 1000;
    const spoken = isTomorrow
      ? `You have an alarm set for ${timeSpeech} tomorrow.`
      : `You have an alarm set for ${timeSpeech}.`;

    return {
      ok: true,
      action: 'query_status',
      spokenConfirmation: spoken,
      displayText: spoken,
    };
  }

  // 6. CANCEL
  if (parsed.intent === 'CANCEL') {
    if (!scheduler || typeof scheduler.remove !== 'function') {
      return {
        ok: false,
        error: 'Scheduler service is unavailable.',
        spokenConfirmation: 'I could not cancel because the scheduler is unavailable.',
      };
    }

    const activeTimers = schedule.filter((i) => i.kind === 'timer');
    const activeAlarms = schedule.filter((i) => i.kind === 'alarm' && i.enabled);

    // Cancel specific alarm by time (e.g. "cancel my 7 am alarm")
    if (parsed.specificTime) {
      const match = activeAlarms.find((a) => a.time === parsed.specificTime);
      if (match) {
        await scheduler.remove(match.id);
        const speech = `I've canceled your ${formatTimeSpeech(match.time)} alarm.`;
        return {
          ok: true,
          action: 'cancel_alarm',
          spokenConfirmation: speech,
          displayText: speech,
        };
      }
      return {
        ok: false,
        spokenConfirmation: `I couldn't find an alarm set for ${formatTimeSpeech(parsed.specificTime)}.`,
        displayText: `No alarm found for ${formatTimeSpeech(parsed.specificTime)}.`,
      };
    }

    // Cancel Timer
    if (parsed.target === 'timer' || parsed.target === 'any') {
      if (activeTimers.length === 0) {
        if (parsed.target === 'timer') {
          return {
            ok: false,
            spokenConfirmation: "You don't have any active timers to cancel.",
            displayText: "No active timers.",
          };
        }
      } else if (activeTimers.length === 1) {
        const timer = activeTimers[0];
        await scheduler.remove(timer.id);
        const durationSpeech = formatDurationSpeech(timer.durationMs);
        const speech = `I've canceled your ${durationSpeech} timer.`;
        return {
          ok: true,
          action: 'cancel_timer',
          spokenConfirmation: speech,
          displayText: speech,
        };
      } else {
        // Multiple timers: ask which one to cancel (Pass 2.2.8 Step 5)
        const optionsStr = activeTimers
          .map((t) => formatDurationSpeech(t.durationMs))
          .join(' or ');
        const speech = `You have ${activeTimers.length} active timers: ${optionsStr}. Which one would you like to cancel?`;
        return {
          ok: true,
          action: 'clarification_needed',
          clarificationNeeded: true,
          spokenConfirmation: speech,
          displayText: speech,
        };
      }
    }

    // Cancel Alarm
    if (parsed.target === 'alarm') {
      if (activeAlarms.length === 0) {
        return {
          ok: false,
          spokenConfirmation: "You have no upcoming alarms to cancel.",
          displayText: "No upcoming alarms.",
        };
      }
      if (activeAlarms.length === 1) {
        const alarm = activeAlarms[0];
        await scheduler.remove(alarm.id);
        const speech = `I've canceled your ${formatTimeSpeech(alarm.time)} alarm.`;
        return {
          ok: true,
          action: 'cancel_alarm',
          spokenConfirmation: speech,
          displayText: speech,
        };
      }
      // Multiple alarms
      const times = activeAlarms.map((a) => formatTimeSpeech(a.time)).join(' or ');
      const speech = `You have ${activeAlarms.length} alarms set: ${times}. Which one would you like to cancel?`;
      return {
        ok: true,
        action: 'clarification_needed',
        clarificationNeeded: true,
        spokenConfirmation: speech,
        displayText: speech,
      };
    }

    return {
      ok: false,
      spokenConfirmation: "I didn't find any active timers or alarms to cancel.",
      displayText: "Nothing to cancel.",
    };
  }

  return { ok: false, error: `Unhandled intent: ${parsed.intent}` };
}
