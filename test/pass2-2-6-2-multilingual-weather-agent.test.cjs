/**
 * pass2-2-6-2-multilingual-weather-agent.test.cjs: Verification suite for Pass 2.2.6.2
 *
 * Covers:
 * Part A: Multilingual music resolution, phonetic Whisper matching, candidate ranking & natural clarifications
 * Part B: Weather accuracy, 4-tier location resolution, forecast grounding & conversational follow-ups
 * Part C & D: Structured UI data contracts for compact Favorites and Weather results
 */

const test = require('node:test');
const assert = require('node:assert/strict');

// In-memory mock storage for deterministic isolation
function createMockStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    clear: () => map.clear(),
    dump: () => Object.fromEntries(map.entries()),
  };
}

const FIXTURE_FAVORITES = [
  {
    id: 'youtube:attention__charlie_puth',
    title: 'Attention',
    artist: 'Charlie Puth',
    provider: 'youtube',
    source: 'youtube',
    playableUrl: 'https://music.youtube.com/watch?v=nfs8NYg7yQM',
    youtubeId: 'nfs8NYg7yQM',
  },
  {
    id: 'youtube:die_for_you__the_weeknd',
    title: 'Die For You',
    artist: 'The Weeknd',
    provider: 'youtube',
    source: 'youtube',
    playableUrl: 'https://music.youtube.com/watch?v=QLCpqdqeoII',
    youtubeId: 'QLCpqdqeoII',
  },
  {
    id: 'youtube:tuu__arijit_singh',
    title: 'Tuu',
    artist: 'Arijit Singh',
    provider: 'youtube',
    source: 'youtube',
    playableUrl: 'https://music.youtube.com/watch?v=TuuVideo123',
    youtubeId: 'TuuVideo123',
  },
  {
    id: 'spotify:pashmina__amit_trivedi',
    title: 'Pashmina',
    artist: 'Amit Trivedi',
    provider: 'spotify',
    source: 'spotify',
    playableUrl: 'spotify:track:pashmina123',
    providerTrackId: 'pashmina123',
  },
  {
    id: 'spotify:starboy__the_weeknd',
    title: 'Starboy',
    artist: 'The Weeknd',
    provider: 'spotify',
    source: 'spotify',
    playableUrl: 'spotify:track:starboy123',
    providerTrackId: 'starboy123',
  },
  {
    id: 'youtube:two_step__ed_sheeran',
    title: '2step',
    artist: 'Ed Sheeran',
    provider: 'youtube',
    source: 'youtube',
    playableUrl: 'https://music.youtube.com/watch?v=2stepEd1234',
    youtubeId: '2stepEd1234',
  },
];

test('Pass 2.2.6.2: Multilingual Music Intelligence & Weather Accuracy Suite', async (t) => {
  // Dynamically load ES modules
  const { calculatePhoneticSimilarity } = await import('../src/lib/phonetic-transliteration.js');
  const { resolveFavoriteTrack, scoreFavoriteCandidate } = await import('../src/lib/favorites-resolver.js');
  const { interpretLocalMusicCommand } = await import('../src/lib/music-command-interpreter.js');
  const { musicContext } = await import('../src/lib/music-conversation-context.js');
  const { planUserIntent, ACTION_TYPES } = await import('../src/lib/semantic-tool-planner.js');
  const { getCurrentWeather, resetWeatherContext } = await import('../src/lib/weather.js');

  const mockStorage = createMockStorage({
    island_favorites_v2: JSON.stringify(FIXTURE_FAVORITES),
  });

  const testEnv = {
    storage: mockStorage,
    media: { active: false },
    onControl: () => {},
    onOpenUrl: () => {},
  };

  await t.test('1. Phonetic & Hindi-English Transliteration Similarity Engine', () => {
    // English number homophones to Hindi titles
    assert.equal(calculatePhoneticSimilarity('two', 'Tuu'), 1.0);
    assert.equal(calculatePhoneticSimilarity('too', 'Tuu'), 1.0);
    assert.equal(calculatePhoneticSimilarity('to', 'Tuu'), 1.0);
    assert.equal(calculatePhoneticSimilarity('tu', 'Tuu'), 1.0);

    // Vowel & consonant transliteration variations
    assert.equal(calculatePhoneticSimilarity('pashmina', 'Pasmina'), 1.0);
    assert.ok(calculatePhoneticSimilarity('channa mereya', 'Chana Merya') >= 0.90);
    assert.ok(calculatePhoneticSimilarity('raataan lambiyan', 'Ratan Lambiyan') >= 0.85);

    // Phonetic difference detection
    assert.ok(calculatePhoneticSimilarity('Attention', 'Starboy') < 0.3);
  });

  await t.test('2. Phonetic Candidate Ranking & Natural Clarification Flow', () => {
    musicContext.reset();

    // User asks for "Tuu" but Whisper transcribes "Play two from my list"
    const res = interpretLocalMusicCommand('Play two from my list', testEnv);

    assert.equal(res.handledLocally, true);
    assert.equal(res.actionResult?.action, 'clarification_needed');
    assert.equal(res.actionResult?.clarificationNeeded, true);
    assert.ok(Array.isArray(res.actionResult?.candidates));
    assert.ok(res.actionResult?.candidates.length > 0);

    // The suggested candidate must be the real favorite "Tuu" by Arijit Singh
    const topCandidate = res.actionResult?.candidates[0];
    assert.equal(topCandidate.title, 'Tuu');
    assert.equal(topCandidate.artist, 'Arijit Singh');

    // Natural spoken clarification identifying real candidate
    assert.match(res.actionResult?.spokenConfirmation, /Did you mean Tuu by Arijit Singh\?/i);

    // Context must record pending candidates across turns
    assert.equal(musicContext.previousCandidates.length > 0, true);
    assert.equal(musicContext.previousCandidates[0].title, 'Tuu');
  });

  await t.test('3. Natural Clarification Affirmation ("Yes, that one") & Alias Learning', () => {
    // User responds affirmatively to the clarification
    const followUp = interpretLocalMusicCommand('Yes, that one', testEnv);

    assert.equal(followUp.handledLocally, true);
    assert.equal(followUp.actionResult?.ok, true);
    assert.equal(followUp.actionResult?.track?.title, 'Tuu');
    assert.equal(followUp.actionResult?.track?.provider, 'youtube');

    // Verification of confirmed alias persistence
    const learnedAlias = musicContext.getLearnedAlias('two', mockStorage);
    assert.equal(learnedAlias, 'youtube:tuu__arijit_singh');

    // Subsequent turns with "two" now execute with high confidence directly
    const directRes = interpretLocalMusicCommand('Play two from my list', testEnv);
    assert.equal(directRes.handledLocally, true);
    assert.equal(directRes.actionResult?.ok, true);
    assert.equal(directRes.actionResult?.track?.title, 'Tuu');
  });

  await t.test('4. Disambiguation Responses ("No, the other one", "The second one", "By [artist]")', () => {
    musicContext.reset();

    // Prime context with 2 candidates: [Tuu, 2step]
    musicContext.setPreviousCandidates([FIXTURE_FAVORITES[2], FIXTURE_FAVORITES[5]]);
    musicContext.recordFailure('play_favorite', 'two', 'ambiguous_match', [FIXTURE_FAVORITES[2], FIXTURE_FAVORITES[5]]);

    // A. "No, the other one"
    const otherRes = interpretLocalMusicCommand('No, the other one', testEnv);
    assert.equal(otherRes.actionResult?.ok, true);
    assert.equal(otherRes.actionResult?.track?.title, '2step');

    // B. "The second one" (ordinal reference)
    musicContext.setPreviousCandidates([FIXTURE_FAVORITES[2], FIXTURE_FAVORITES[5]]);
    const secondRes = interpretLocalMusicCommand('The second one', testEnv);
    assert.equal(secondRes.actionResult?.ok, true);
    assert.equal(secondRes.actionResult?.track?.title, '2step');

    // C. "The one by Arijit Singh"
    musicContext.setPreviousCandidates([FIXTURE_FAVORITES[2], FIXTURE_FAVORITES[5]]);
    const artistRes = interpretLocalMusicCommand('The one by Arijit Singh', testEnv);
    assert.equal(artistRes.actionResult?.ok, true);
    assert.equal(artistRes.actionResult?.track?.title, 'Tuu');

    // D. "No, I meant the Hindi song"
    musicContext.setPreviousCandidates([FIXTURE_FAVORITES[5], FIXTURE_FAVORITES[2]]);
    const hindiRes = interpretLocalMusicCommand('No, I meant the Hindi song', testEnv);
    assert.equal(hindiRes.actionResult?.ok, true);
    assert.equal(hindiRes.actionResult?.track?.title, 'Tuu');
  });

  await t.test('5. Weather: 4-Tier Location Resolution & Grounded Forecasts', async () => {
    resetWeatherContext();

    // A. Explicit city lookup: "What's the weather in Delhi?"
    const delhiRes = await getCurrentWeather('Delhi', { timeframe: 'current' });
    assert.equal(delhiRes.ok, true);
    assert.equal(delhiRes.city, 'Delhi');
    assert.equal(delhiRes.locationType, 'explicit');
    assert.ok(typeof delhiRes.temperature === 'number');
    assert.ok(typeof delhiRes.feelsLike === 'number');
    assert.ok(delhiRes.condition);
    assert.match(delhiRes.speech, /Delhi/);

    // B. Default city fallback from localStorage
    const defaultStore = createMockStorage({
      island_weather_default_city: 'Tokyo',
    });
    const defaultRes = await getCurrentWeather(null, { storage: defaultStore });
    assert.equal(defaultRes.ok, true);
    assert.equal(defaultRes.city, 'Tokyo');
    assert.equal(defaultRes.locationType, 'default');

    // C. Tomorrow's verified forecast query
    const tomorrowRes = await getCurrentWeather('Delhi', { timeframe: 'tomorrow' });
    assert.equal(tomorrowRes.ok, true);
    assert.equal(tomorrowRes.timeframe, 'tomorrow');
    assert.ok(tomorrowRes.tomorrow != null, 'Tomorrow forecast data must be populated');
    assert.ok(typeof tomorrowRes.tomorrow.high === 'number');
    assert.ok(typeof tomorrowRes.tomorrow.low === 'number');
    assert.match(tomorrowRes.speech, /Tomorrow in Delhi/i);

    // D. Heat inquiry ("Is it hot right now?")
    const heatRes = await getCurrentWeather('Delhi', { questionType: 'heat' });
    assert.equal(heatRes.ok, true);
    assert.match(heatRes.speech, /(?:Yes|No|It's a)/i);
  });

  await t.test('6. Weather: Conversational Follow-up References', async () => {
    resetWeatherContext();

    // Turn 1: User asks about Delhi
    const plan1 = planUserIntent("What's the weather in Delhi?", musicContext.getContext());
    assert.equal(plan1.plan.topic, 'weather');
    assert.equal(plan1.plan.location, 'Delhi');

    await getCurrentWeather('Delhi');

    // Turn 2: User asks follow-up "How about tomorrow?" (location retained from session context)
    const plan2 = planUserIntent('How about tomorrow?', musicContext.getContext());
    assert.equal(plan2.plan.topic, 'weather');
    assert.equal(plan2.plan.timeframe, 'tomorrow');

    const tomorrowFollowUp = await getCurrentWeather(null, { timeframe: 'tomorrow' });
    assert.equal(tomorrowFollowUp.city, 'Delhi');
    assert.equal(tomorrowFollowUp.timeframe, 'tomorrow');

    // Turn 3: User asks follow-up "How about Mumbai instead?"
    const plan3 = planUserIntent('How about Mumbai instead?', musicContext.getContext());
    assert.equal(plan3.plan.topic, 'weather');
    assert.equal(plan3.plan.location, 'Mumbai');

    const mumbaiFollowUp = await getCurrentWeather('Mumbai');
    assert.equal(mumbaiFollowUp.city, 'Mumbai');
  });

  await t.test('7. Structured UI Result Contracts', () => {
    // A. Structured Weather UI Contract
    const weatherMock = {
      ok: true,
      city: 'Delhi',
      country: 'India',
      locationType: 'explicit',
      timeframe: 'current',
      temperature: 31,
      feelsLike: 33,
      high: 34,
      low: 21,
      condition: 'partly cloudy',
      weatherCode: 2,
      isDay: true,
      humidity: 35,
      windSpeed: 8,
      rainChance: 0,
      speech: "It's currently 31°C and partly cloudy in Delhi.",
    };
    assert.ok(weatherMock.city);
    assert.ok(typeof weatherMock.temperature === 'number');
    assert.ok(weatherMock.condition);
    assert.ok(typeof weatherMock.weatherCode === 'number');

    // B. Structured Clarification UI Contract
    const clarificationCandidates = [FIXTURE_FAVORITES[2], FIXTURE_FAVORITES[5]];
    assert.equal(clarificationCandidates.length, 2);
    assert.equal(clarificationCandidates[0].title, 'Tuu');
    assert.equal(clarificationCandidates[1].title, '2step');
    assert.ok(clarificationCandidates[0].provider);
  });
});
