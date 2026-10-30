/**
 * agent-response-contract.js: Structured Agent Response Contract & TTS Normalizer (Pass 2.2.6.3).
 *
 * Implements:
 * 1. Validated response contract:
 *    - displayText: Rich conversation content for UI display (Markdown, formatting, cards)
 *    - spokenText: Concise, natural language strictly prepared for TTS (no asterisks, no bullets, clean punctuation)
 *    - toolResults: Structured verified tool outputs (tracks, weather, candidates)
 *    - responseStatus: 'success' | 'clarification' | 'failure' | 'info'
 * 2. TTS-safe text normalizer (cleanTextForSpeech):
 *    - Strips asterisks, markdown headers, raw bullets, code fences, and links.
 *    - Converts numbered lists to natural spoken pauses ("1, Track. 2, Track.").
 *    - Translates units and currency ($ -> dollars, °C -> degrees Celsius, % -> percent, & -> and).
 *    - Strips action tags [[ACTION:...]] and Unicode emojis.
 * 3. Intent-aware length adaptation:
 *    - Distinguishes concise summaries from explicit read-aloud requests.
 */

/**
 * Checks if the user explicitly requested reading items or lists aloud.
 * @param {string} userText
 * @returns {boolean}
 */
export function isExplicitReadAloudRequest(userText) {
  if (!userText || typeof userText !== 'string') return false;
  const lower = userText.trim().toLowerCase();
  return (
    /\b(?:read\s+(?:all|them|it|the\s+list|all\s+of\s+them)?\s+(?:out\s+)?aloud|read\s+(?:it|them|the\s+list|everything)\s+to\s+me|speak\s+(?:all|the\s+list|them)|tell\s+me\s+all\s+(?:the\s+)?(?:songs|tracks|favorites))\b/i.test(lower) ||
    /^(?:read\s+aloud|read\s+my\s+list(?:\s+aloud)?|read\s+my\s+favorites(?:\s+aloud)?)$/i.test(lower)
  );
}

/**
 * Checks if the user explicitly requested a detailed or in-depth explanation.
 * @param {string} userText
 * @returns {boolean}
 */
export function isExplicitDetailRequest(userText) {
  if (!userText || typeof userText !== 'string') return false;
  const lower = userText.trim().toLowerCase();
  return /\b(?:explain\s+in\s+detail|tell\s+me\s+more\s+about|elaborate\s+on|give\s+me\s+a\s+detailed|in-depth|step\s+by\s+step|comprehensive)\b/i.test(lower);
}

/**
 * Safely clean and normalize text for speech synthesis (TTS).
 * Converts Markdown formatting into natural spoken prose.
 *
 * @param {string} rawText
 * @param {object} options { readAloud: boolean, readCode: boolean }
 * @returns {string}
 */
export function cleanTextForSpeech(rawText, options = {}) {
  if (!rawText || typeof rawText !== 'string') return '';

  let text = rawText;

  // 1. Strip raw action tags completely
  text = text.replace(/\[\[ACTION:[\s\S]*?\]\]/g, '');

  // 2. Strip code blocks: replace with brief summary or omit
  text = text.replace(/```[\w]*\n([\s\S]*?)```/g, (match, code) => {
    return options.readCode ? code.trim() : 'a code snippet.';
  });
  text = text.replace(/`([^`]+)`/g, '$1');

  // 3. Normalize Markdown links: [Title](URL) -> Title
  text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');

  // 4. Strip raw web URLs down to domain name or brief indicator
  text = text.replace(/https?:\/\/(?:www\.)?([a-zA-Z0-9.-]+)(?:\/[^\s]*)?/g, '$1');

  // 5. Strip Markdown headers: ### Heading -> Heading.
  text = text.replace(/^[ \t]*#{1,6}[ \t]+([^\n]+)/gm, '$1.');

  // 6. Strip Blockquotes: > quote -> quote
  text = text.replace(/^[ \t]*>[ \t]+([^\n]+)/gm, '$1');

  // 7. Strip Markdown Table syntax
  text = text.replace(/\|[ \t]*:?-+:?[ \t]*\|/g, '');
  text = text.replace(/\|/g, ' ');

  // 8. Numbered lists: "1. First item\n2. Second item" -> "1, First item. 2, Second item."
  text = text.replace(/^[ \t]*(\d+)[.)][ \t]+([^\n]+)/gm, '$1, $2.');

  // 9. Unordered list markers: "* Item", "- Item", "+ Item", "• Item" -> "Item,"
  text = text.replace(/^[ \t]*[-*+•][ \t]+([^\n]+)/gm, '$1,');

  // 10. Strip Bold and Italics: ***text***, **text**, *text*, ___text___, __text__, _text_
  text = text.replace(/\*{1,3}([^*]+)\*{1,3}/g, '$1');
  text = text.replace(/_{1,3}([^_]+)_{1,3}/g, '$1');
  text = text.replace(/~{1,2}([^~]+)~{1,2}/g, '$1');

  // 11. Translate symbols and units into spoken words
  // Temperature
  text = text.replace(/(\d+(?:\.\d+)?)\s*°\s*[cC]\b/g, '$1 degrees Celsius');
  text = text.replace(/(\d+(?:\.\d+)?)\s*°\s*[fF]\b/g, '$1 degrees Fahrenheit');
  text = text.replace(/(\d+(?:\.\d+)?)\s*°\b/g, '$1 degrees');
  // Percent
  text = text.replace(/(\d+(?:\.\d+)?)\s*%/g, '$1 percent');
  // Currency
  text = text.replace(/\$(\d+(?:\.\d{1,2})?)/g, '$1 dollars');
  text = text.replace(/₹(\d+(?:\.\d{1,2})?)/g, '$1 rupees');
  text = text.replace(/€(\d+(?:\.\d{1,2})?)/g, '$1 euros');
  text = text.replace(/£(\d+(?:\.\d{1,2})?)/g, '$1 pounds');
  // Conjunctions & symbols
  text = text.replace(/\s+&\s+/g, ' and ');
  text = text.replace(/(\w+)\/(\w+)/g, '$1 or $2');
  text = text.replace(/@/g, ' at ');

  // 12. Strip Emojis and decorative Unicode symbols
  text = text.replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1FA00}-\u{1FAFF}]/gu, '');

  // 13. Clean up multiple punctuation and whitespace
  text = text.replace(/\s+,/g, ',');
  text = text.replace(/,\s*,+/g, ',');
  text = text.replace(/\.\s*\.+/g, '.');
  text = text.replace(/\?\s*\?+/g, '?');
  text = text.replace(/!\s*!+/g, '!');
  text = text.replace(/\s+/g, ' ').trim();

  // Remove trailing comma if present at the end
  text = text.replace(/,\s*$/, '.');

  return text;
}

/**
 * Creates and validates a structured Agent response.
 *
 * @param {object} params
 * @param {string} params.displayText - Rich text for visual UI rendering
 * @param {string} params.spokenText - Clean text strictly for TTS
 * @param {object|null} params.toolResults - Structured tool data (tracks, weather, candidates)
 * @param {string} params.responseStatus - 'success' | 'clarification' | 'failure' | 'info'
 * @param {boolean} params.readAloud - Whether user asked for all items to be read aloud
 * @returns {object} { displayText, spokenText, toolResults, responseStatus }
 */
export function createAgentResponse({
  displayText = '',
  spokenText = '',
  toolResults = null,
  responseStatus = 'success',
  readAloud = false,
} = {}) {
  const validStatus = ['success', 'clarification', 'failure', 'info'].includes(responseStatus)
    ? responseStatus
    : 'info';

  const cleanSpoken = cleanTextForSpeech(spokenText || displayText, { readAloud });
  const richDisplay = (displayText || cleanSpoken || '').trim();

  return {
    displayText: richDisplay,
    spokenText: cleanSpoken,
    toolResults: toolResults || null,
    responseStatus: validStatus,
  };
}

/**
 * Format a structured favorites listing response with concise speech vs rich cards.
 *
 * @param {object} actionResult - Result from list_favorites
 * @param {object} options - { readAloud: boolean }
 * @returns {object} AgentResponse
 */
export function formatFavoritesResponse(actionResult, options = {}) {
  const tracks = actionResult?.tracks || [];
  const count = actionResult?.totalCount ?? tracks.length;
  const prov = actionResult?.provider ? actionResult.provider.toLowerCase() : null;
  const provName = prov === 'spotify' ? 'Spotify' : prov === 'youtube' ? 'YouTube Music' : null;

  if (count === 0) {
    const msg = provName
      ? `You don't have any songs from ${provName} in your favorites.`
      : 'Your favorites list is empty.';
    return createAgentResponse({
      displayText: msg,
      spokenText: msg,
      toolResults: { type: 'favorites', tracks: [], totalCount: 0 },
      responseStatus: 'info',
    });
  }

  const label = provName ? `${provName} favorites` : 'saved songs';
  const displayIntro = `Here are your ${count} ${label}:`;

  let spoken;
  if (options.readAloud) {
    // Explicit read-aloud requested: speak each track cleanly without markdown
    const trackList = tracks
      .map((t, i) => `${i + 1}, ${t.title}${t.artist ? ' by ' + t.artist : ''}`)
      .join('. ');
    spoken = `Here are your ${count} ${label}: ${trackList}.`;
  } else {
    // Natural concise speech: visual cards already display the songs
    spoken = `Here are your ${count} ${provName ? provName + ' ' : ''}favorites.`;
  }

  return createAgentResponse({
    displayText: displayIntro,
    spokenText: spoken,
    toolResults: {
      type: 'favorites',
      tracks,
      totalCount: count,
      provider: actionResult?.provider || 'all',
    },
    responseStatus: 'success',
    readAloud: Boolean(options.readAloud),
  });
}

/**
 * Format a structured weather response with concise speech vs rich cards.
 *
 * @param {object} weatherData - Result from getCurrentWeather
 * @returns {object} AgentResponse
 */
export function formatWeatherResponse(weatherData) {
  if (!weatherData || !weatherData.ok) {
    const errorMsg = weatherData?.speech || "I couldn't retrieve the live weather right now.";
    return createAgentResponse({
      displayText: errorMsg,
      spokenText: errorMsg,
      toolResults: { type: 'weather', weather: weatherData || null },
      responseStatus: 'failure',
    });
  }

  const city = weatherData.city || weatherData.location?.resolvedCity || weatherData.location?.queryCity || 'your area';
  const temp = Math.round(weatherData.temperature ?? weatherData.current?.temperature ?? 0);
  const condition = weatherData.condition || weatherData.current?.conditionText || 'Clear';
  const feelsLike = weatherData.feelsLike !== undefined && weatherData.feelsLike !== null
    ? Math.round(weatherData.feelsLike)
    : (weatherData.current?.apparentTemperature ? Math.round(weatherData.current.apparentTemperature) : null);
  const high = weatherData.high !== undefined && weatherData.high !== null
    ? Math.round(weatherData.high)
    : (weatherData.daily?.maxTemp ? Math.round(weatherData.daily.maxTemp) : null);
  const low = weatherData.low !== undefined && weatherData.low !== null
    ? Math.round(weatherData.low)
    : (weatherData.daily?.minTemp ? Math.round(weatherData.daily.minTemp) : null);

  let displayText = `Weather in ${city}: ${temp}°C, ${condition}.`;
  if (feelsLike !== null && Math.abs(feelsLike - temp) >= 2) {
    displayText += ` Feels like ${feelsLike}°C.`;
  }
  if (high !== null && low !== null) {
    displayText += ` High: ${high}°C, Low: ${low}°C.`;
  }

  // Spoken text is concise and grounded
  const spokenText = weatherData.speech || displayText;

  return createAgentResponse({
    displayText,
    spokenText,
    toolResults: { type: 'weather', weather: weatherData },
    responseStatus: 'info',
  });
}
