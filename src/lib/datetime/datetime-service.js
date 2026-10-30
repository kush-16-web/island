/**
 * datetime-service.js: Deterministic, trusted operating system date/time service for Island.
 *
 * Requirements (Phase 2 - Task 2):
 * 1. Deterministic local computation reading system clock & timezone.
 * 2. Correctly handles:
 *    - Current local date, time, weekday
 *    - Yesterday, today, and tomorrow
 *    - Date-to-weekday conversions across past and future years
 *    - Month boundaries (e.g. Feb 28/29, Mar 1, Dec 31 -> Jan 1)
 *    - Leap years (divisible by 4, except century years unless divisible by 400)
 *    - Controlled referenceDate / clock parameter for reliable automated testing
 * 3. Fast local resolution for straightforward date/time questions with 0ms LLM latency.
 * 4. Grounding context generation for conversational LLMs (Groq / Gemini).
 */

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const MONTH_MAP = {
  january: 1, jan: 1,
  february: 2, feb: 2,
  march: 3, mar: 3,
  april: 4, apr: 4,
  may: 5,
  june: 6, jun: 6,
  july: 7, jul: 7,
  august: 8, aug: 8,
  september: 9, sep: 9, sept: 9,
  october: 10, oct: 10,
  november: 11, nov: 11,
  december: 12, dec: 12,
};

/**
 * Check if a given year is a leap year.
 */
export function isLeapYear(year) {
  const y = Number(year);
  return (y % 4 === 0 && y % 100 !== 0) || (y % 400 === 0);
}

/**
 * Get the system's active local timezone.
 */
export function getSystemTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata';
  } catch {
    return 'Asia/Kolkata';
  }
}

/**
 * Deterministic date and time resolution for a given reference date and timezone.
 *
 * @param {Date|number|string|null} referenceDate - Custom date for testing, defaults to real clock
 * @param {string|null} timezone - Custom timezone, defaults to OS timezone
 * @returns {object} Structured system datetime information
 */
export function getSystemDateTime(referenceDate = null, timezone = null) {
  const dateObj = referenceDate instanceof Date
    ? referenceDate
    : referenceDate != null
    ? new Date(referenceDate)
    : new Date();

  const tz = timezone || getSystemTimezone();

  // Format parts according to specific timezone using Intl.DateTimeFormat
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    weekday: 'long',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: true,
  });

  const parts = formatter.formatToParts(dateObj);
  const partMap = {};
  for (const p of parts) {
    partMap[p.type] = p.value;
  }

  const year = parseInt(partMap.year, 10);
  const month = parseInt(partMap.month, 10);
  const day = parseInt(partMap.day, 10);
  const weekday = partMap.weekday || WEEKDAYS[dateObj.getDay()];
  const rawHour = parseInt(partMap.hour, 10);
  const minute = parseInt(partMap.minute, 10);
  const second = parseInt(partMap.second, 10);
  const dayPeriod = (partMap.dayPeriod || 'AM').toUpperCase();

  const monthName = MONTHS[month - 1] || 'January';
  const paddedMinute = String(minute).padStart(2, '0');
  const formattedTime = `${rawHour}:${paddedMinute} ${dayPeriod}`;
  const formattedDate = `${weekday}, ${monthName} ${day}, ${year}`;

  return {
    year,
    month,
    day,
    monthName,
    weekday,
    hour: rawHour,
    minute,
    second,
    dayPeriod,
    timezone: tz,
    isLeapYear: isLeapYear(year),
    formattedTime,
    formattedDate,
    iso: dateObj.toISOString(),
  };
}

/**
 * Determine the weekday for any calendar date (past, present, or future).
 *
 * @param {number} year - Full year (e.g. 2026)
 * @param {number} month - 1-12
 * @param {number} day - 1-31
 * @param {string|null} timezone - Timezone
 * @returns {{ weekday: string, isLeapYear: boolean }}
 */
export function getWeekdayForDate(year, month, day, timezone = null) {
  const y = parseInt(year, 10);
  const m = parseInt(month, 10);
  const d = parseInt(day, 10);

  // Use UTC noon to safely avoid any midnight timezone offset edge cases
  const utcDate = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const dayIdx = utcDate.getUTCDay();
  const weekday = WEEKDAYS[dayIdx];

  return {
    weekday,
    year: y,
    month: m,
    day: d,
    monthName: MONTHS[m - 1] || '',
    isLeapYear: isLeapYear(y),
  };
}

/**
 * Calculate relative date (e.g. yesterday = -1, tomorrow = +1).
 */
export function getRelativeDateTime(dayOffset, referenceDate = null, timezone = null) {
  const base = referenceDate instanceof Date
    ? new Date(referenceDate.getTime())
    : referenceDate != null
    ? new Date(referenceDate)
    : new Date();

  // Shift day cleanly
  base.setDate(base.getDate() + dayOffset);
  return getSystemDateTime(base, timezone);
}

/**
 * Build a concise, dynamic grounding prompt for LLM system prompts.
 * Prevents year/date hallucinations without stale application-startup caches.
 */
export function getGroundingPrompt(referenceDate = null, timezone = null) {
  const dt = getSystemDateTime(referenceDate, timezone);
  return `Temporal Anchor: Today is ${dt.weekday}, ${dt.monthName} ${dt.day}, ${dt.year}. Current local time is ${dt.formattedTime} (${dt.timezone}). Always adhere to this ground truth when answering date, weekday, or time questions.`;
}

/**
 * Clean spoken or written input for date/time intent classification.
 */
function cleanQuery(text) {
  if (!text || typeof text !== 'string') return '';
  return text
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[.,?!;:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Parse an explicit date reference in natural phrasing:
 * e.g. "November 5, 2026", "5th November 2026", "2026-11-05", "Nov 5 2026"
 */
export function parseDateFromQuery(query) {
  if (!query || typeof query !== 'string') return null;
  const clean = cleanQuery(query);

  // Pattern A: "Month Day Year" (e.g. "November 5 2026", "Nov 5th 2026")
  const m1 = clean.match(/\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\s+(\d{1,2})(?:st|nd|rd|th)?(?:[,\s]+(\d{4}))?\b/i);
  if (m1) {
    const month = MONTH_MAP[m1[1].toLowerCase()];
    const day = parseInt(m1[2], 10);
    const year = m1[3] ? parseInt(m1[3], 10) : new Date().getFullYear();
    if (month && day >= 1 && day <= 31) {
      return { year, month, day, monthName: MONTHS[month - 1] };
    }
  }

  // Pattern B: "Day Month Year" (e.g. "5th November 2026", "15 August 1947")
  const m2 = clean.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)(?:[,\s]+(\d{4}))?\b/i);
  if (m2) {
    const day = parseInt(m2[1], 10);
    const month = MONTH_MAP[m2[2].toLowerCase()];
    const year = m2[3] ? parseInt(m2[3], 10) : new Date().getFullYear();
    if (month && day >= 1 && day <= 31) {
      return { year, month, day, monthName: MONTHS[month - 1] };
    }
  }

  // Pattern C: ISO YYYY-MM-DD (e.g. "2026-11-05")
  const m3 = clean.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
  if (m3) {
    const year = parseInt(m3[1], 10);
    const month = parseInt(m3[2], 10);
    const day = parseInt(m3[3], 10);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return { year, month, day, monthName: MONTHS[month - 1] };
    }
  }

  return null;
}

/**
 * Interpret a spoken or typed question for date, time, or weekday.
 * Resolves straightforward questions deterministically without calling any LLM.
 *
 * @param {string} rawQuery - Spoken query text
 * @param {object} options - { referenceDate, timezone, clock }
 * @returns {{ handled: boolean, intent?: string, speech?: string, display?: string, data?: object }}
 */
export function interpretDateTimeQuery(rawQuery, options = {}) {
  if (!rawQuery || typeof rawQuery !== 'string') {
    return { handled: false };
  }

  const clean = cleanQuery(rawQuery);
  const refDate = options.referenceDate || options.clock || options.now || null;
  const tz = options.timezone || null;

  // 1. Target date weekday queries:
  // e.g. "What weekday is November 5, 2026?", "What day was August 15, 1947?", "What day is 2026-11-05?"
  const isDateWeekdayQuery =
    /\b(?:what|which)\s+(?:day(?:\s+of\s+the\s+week)?|weekday)\s+(?:is|was|will\s+be|on)\b/i.test(clean) ||
    /\b(?:what|which)\s+day\b/i.test(clean);

  const parsedDate = parseDateFromQuery(rawQuery);
  if (isDateWeekdayQuery && parsedDate) {
    const res = getWeekdayForDate(parsedDate.year, parsedDate.month, parsedDate.day, tz);
    const speech = `${parsedDate.monthName} ${parsedDate.day}, ${parsedDate.year} is a ${res.weekday}.`;
    const display = `${res.weekday}, ${parsedDate.monthName} ${parsedDate.day}, ${parsedDate.year}`;
    return {
      handled: true,
      intent: 'weekday_date',
      speech,
      display,
      data: { ...res, ...parsedDate },
    };
  }

  // 2. "What day was yesterday?" / "What day was it yesterday?"
  if (
    /^(?:what|which)\s+(?:day(?:\s+was\s+it)?|weekday)\s+(?:was\s+)?yesterday\b/i.test(clean) ||
    /^yesterday(?:s|\s+was|\s+weekday)?\b/i.test(clean)
  ) {
    const yest = getRelativeDateTime(-1, refDate, tz);
    return {
      handled: true,
      intent: 'weekday_yesterday',
      speech: `Yesterday was ${yest.weekday}.`,
      display: `Yesterday: ${yest.weekday}, ${yest.monthName} ${yest.day}`,
      data: yest,
    };
  }

  // 3. "What day is tomorrow?" / "What day will tomorrow be?"
  if (
    /^(?:what|which)\s+(?:day(?:\s+is\s+it)?|weekday)\s+(?:is|will\s+be)\s+tomorrow\b/i.test(clean) ||
    /^tomorrow(?:s|\s+is|\s+weekday)?\b/i.test(clean)
  ) {
    const tom = getRelativeDateTime(1, refDate, tz);
    return {
      handled: true,
      intent: 'weekday_tomorrow',
      speech: `Tomorrow is ${tom.weekday}.`,
      display: `Tomorrow: ${tom.weekday}, ${tom.monthName} ${tom.day}`,
      data: tom,
    };
  }

  // 4. "What day is today?" / "What day is it?" / "What is today?"
  if (
    /^(?:what(?:s|\s+is)?|which)\s+(?:day(?:\s+is\s+it)?|weekday)\s+(?:is\s+today|today|is\s+it)\b/i.test(clean) ||
    /^(?:what\s+is\s+today|what\s+day\s+is\s+it\s+today|what\s+day\s+is\s+today|whats\s+today)$/i.test(clean)
  ) {
    const now = getSystemDateTime(refDate, tz);
    return {
      handled: true,
      intent: 'weekday_today',
      speech: `Today is ${now.weekday}.`,
      display: `${now.weekday}, ${now.monthName} ${now.day}, ${now.year}`,
      data: now,
    };
  }

  // 5. "What's today's date?" / "What is the date today?" / "What's the date?"
  if (
    /\b(?:what(?:s|\s+is)?\s+(?:today(?:s)?\s+)?date|what\s+is\s+the\s+date|tell\s+me\s+the\s+date|today(?:s)?\s+date|whats\s+the\s+date)\b/i.test(clean)
  ) {
    const now = getSystemDateTime(refDate, tz);
    return {
      handled: true,
      intent: 'date_today',
      speech: `Today's date is ${now.weekday}, ${now.monthName} ${now.day}, ${now.year}.`,
      display: `${now.weekday}, ${now.monthName} ${now.day}, ${now.year}`,
      data: now,
    };
  }

  // 6. "What time is it?" / "What's the time?" / "What time is it right now?"
  if (
    /\b(?:what(?:s|\s+is)?\s+(?:the\s+)?time|what\s+time\s+is\s+it|tell\s+me\s+the\s+time|current\s+time|whats\s+the\s+time)\b/i.test(clean)
  ) {
    const now = getSystemDateTime(refDate, tz);
    return {
      handled: true,
      intent: 'time_now',
      speech: `It's ${now.formattedTime} right now.`,
      display: `${now.formattedTime} (${now.timezone})`,
      data: now,
    };
  }

  return { handled: false };
}
