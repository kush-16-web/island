/**
 * music-command-interpreter.js: High-confidence local music command parser for Jadu.
 *
 * Requirements (PASS 2 - PART B):
 * 1. Zero Groq Chat quota spent for deterministic local music commands:
 *    - Pause / Resume / Skip / Previous / What is playing
 *    - Play from favorites by title and/or artist
 *    - Play something from favorites / shuffle
 *    - Play the song I just liked
 * 2. Natural variation and Whisper speech recognition resilience:
 *    - Handles conversational fillers ("please", "can you", "hey jett", etc.)
 *    - Handles case differences, trailing punctuation, apostrophes
 *    - Normalizes Whisper phonetic mis-transcriptions
 * 3. Conversational Guard:
 *    - Does NOT hijack normal conversations (e.g. "Let's play chess", "play a role")
 * 4. Safe Groq Fallback:
 *    - Falls back to configured Groq chat model only when genuinely ambiguous
 */

import { cleanSpokenQuery, resolveFavoriteTrack } from './favorites-resolver.js';
import { executeMusicAction, normalizeText } from './music-actions.js';
import { SUPPORTED_PROVIDERS, getAllFavorites } from './favorites.js';
import { getAssistantName } from '../assistant.js';
import { parseMultiActionPlan, executeActionPlan } from '../action-plan.js';
import { musicContext } from './music-conversation-context.js';
import { planUserIntent, ACTION_TYPES } from '../semantic-tool-planner.js';
import { isExplicitReadAloudRequest } from '../agent-response-contract.js';

// Conversational phrases containing "play" that are NOT music commands
const NON_MUSIC_PLAY_PATTERNS = [
  /\bplay\s+(a\s+game|chess|cards|football|soccer|basketball|tennis|videogames?|games?)\b/i,
  /\bplay\s+(a\s+role|with\s+me|around|along|dead|fair)\b/i,
  /\bhow\s+to\s+play\b/i,
];

/**
 * Strip conversational wake names and filler prefixes dynamically.
 * Respects the user-configurable assistant name without hardcoding.
 */
function stripConversationalPrefixes(rawText) {
  if (!rawText || typeof rawText !== 'string') return '';
  const name = (typeof getAssistantName === 'function' ? getAssistantName() : 'Nova').toLowerCase().trim();
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const dynamicPattern = new RegExp(
    `^(hey\\s+)?(${escapedName}|island|computer|assistant)?[\\s,]*(please\\s+)?(can\\s+you\\s+)?(could\\s+you\\s+)?`,
    'i'
  );
  return rawText.replace(dynamicPattern, '');
}

/**
 * Clean and normalize a spoken user text.
 */
export function sanitizeSpokenInput(rawText) {
  if (!rawText || typeof rawText !== 'string') return '';
  const stripped = stripConversationalPrefixes(rawText);
  return cleanSpokenQuery(
    stripped
      .replace(/[.,!?;:]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

/**
 * Interpret a spoken sentence locally for high-confidence music actions.
 *
 * @param {string} rawText - Transcribed speech from Whisper
 * @param {object} env - Environment { media, onControl, onOpenUrl, customStorage, turnId }
 * @returns {{ handledLocally: boolean, actionResult?: object, fallbackToLlm?: boolean, reason?: string }}
 */
export function interpretLocalMusicCommand(rawText, env = {}) {
  if (!rawText || typeof rawText !== 'string') {
    return { handledLocally: false };
  }

  const cleaned = sanitizeSpokenInput(rawText);
  if (!cleaned) return { handledLocally: false };

  // Guard against non-music utterances containing "play"
  for (const nonMusicPattern of NON_MUSIC_PLAY_PATTERNS) {
    if (nonMusicPattern.test(rawText)) {
      return { handledLocally: false, fallbackToLlm: true, reason: 'conversational_phrase' };
    }
  }

  const media = env.media || { active: false };
  const storage = env.storage || env.customStorage || null;
  const turnId = env.turnId || Date.now();

  // Helper to record context on handled results
  const wrapResult = (res, query) => {
    if (!res || !res.handledLocally || !res.actionResult) return res;
    const r = res.actionResult;
    if (r.ok) {
      musicContext.recordSuccess(r.action, r.track);
    } else if (r.reason === 'ambiguous_match' || r.clarificationNeeded || r.action === 'clarification_needed') {
      musicContext.setPreviousCandidates(r.candidates || r.matches || []);
      musicContext.recordFailure(r.action, query || cleaned, 'clarification_needed', r.candidates || r.matches || []);
    } else {
      musicContext.recordFailure(r.action, query || cleaned, r.reason, r.matches || []);
    }
    return res;
  };

  // 00A. Contextual Clarification Confirmation or Correction (Pass 2.2.6.2 Part A)
  const correction = musicContext.detectCorrection(rawText);
  if (correction && correction.isCorrection) {
    if (correction.selectedTrack) {
      if (correction.confirmedAliasQuery && correction.selectedTrack.id) {
        musicContext.learnAlias(correction.confirmedAliasQuery, correction.selectedTrack.id, storage);
      }
      const res = executeMusicAction({ action: 'play_favorite', track: correction.selectedTrack }, env);
      if (res.ok) musicContext.recordSuccess('play_favorite', res.track);
      return {
        handledLocally: true,
        actionResult: res,
      };
    }

    const candidateTitle = correction.candidateTitle;
    const languageHint = correction.languageHint;
    const artistHint = correction.artistHint;

    const resolution = resolveFavoriteTrack({
      query: candidateTitle,
      title: candidateTitle,
      artist: artistHint,
      languageHint: languageHint,
      storage,
    });

    if (resolution.match) {
      if (correction.previousQuery && resolution.match.id) {
        musicContext.learnAlias(correction.previousQuery, resolution.match.id, storage);
      }
      const res = executeMusicAction({ action: 'play_favorite', track: resolution.match, query: resolution.match.title }, env);
      if (res.ok) musicContext.recordSuccess('play_favorite', res.track);
      return {
        handledLocally: true,
        actionResult: res,
      };
    }
  }

  // 00. General Semantic Tool Planning (Pass 2.2.6.1)
  const semanticPlan = planUserIntent(rawText, musicContext.getContext());
  if (semanticPlan && semanticPlan.confidence === 'high' && semanticPlan.plan) {
    const p = semanticPlan.plan;
    switch (p.type) {
      case ACTION_TYPES.CONVERSATION_DISMISS: {
        const isMusicPlaying = Boolean(
          (env.media?.active && env.media?.status === 'playing') ||
          (media?.active && media?.status === 'playing')
        );
        let closingAck;
        if (/bye|goodbye/i.test(cleaned)) {
          closingAck = isMusicPlaying ? 'Goodbye! Enjoy your music.' : 'Goodbye! Have a great day.';
        } else if (/no|that(?:'s|\s+is)\s+all|nothing/i.test(cleaned)) {
          closingAck = isMusicPlaying ? 'Understood. Enjoy your music!' : 'Understood. Enjoy your day!';
        } else {
          closingAck = isMusicPlaying ? "You're welcome! Enjoy your music." : "You're welcome! Have a great day.";
        }
        return {
          handledLocally: true,
          actionResult: {
            ok: true,
            action: 'session_dismiss',
            isSessionEnd: true,
            spokenConfirmation: closingAck,
          },
        };
      }

      case ACTION_TYPES.CONVERSATION_INFO: {
        if (p.topic === 'weather') {
          return {
            handledLocally: true,
            actionResult: {
              ok: true,
              action: 'info_weather',
              isWeather: true,
              location: p.location || null,
              timeframe: p.timeframe || 'current',
              questionType: p.questionType || 'general',
              spokenConfirmation: p.location ? `Checking the live weather for ${p.location}...` : 'Checking the live weather...',
            },
          };
        }
        return { handledLocally: false, fallbackToLlm: true, reason: 'informational_query' };
      }

      case ACTION_TYPES.MUSIC_CONTROL: {
        const op = p.operation;
        if (op === 'volume') {
          const res = executeMusicAction({ action: 'set_volume', level: p.level }, env);
          return wrapResult({ handledLocally: true, actionResult: res });
        }
        const actionMap = {
          pause: 'pause',
          resume: 'resume',
          stop: 'pause',
          next: 'next_track',
          previous: 'previous_track',
        };
        const mappedAction = actionMap[op] || 'pause';
        return wrapResult({
          handledLocally: true,
          actionResult: executeMusicAction({ action: mappedAction }, env),
        });
      }

      case ACTION_TYPES.FAVORITES_COUNT: {
        return wrapResult({
          handledLocally: true,
          actionResult: executeMusicAction({ action: 'count_favorites', provider: p.filter !== 'all' ? p.filter : undefined }, env),
        });
      }

      case ACTION_TYPES.FAVORITES_LIST: {
        return wrapResult({
          handledLocally: true,
          actionResult: executeMusicAction({ action: 'list_favorites', filter: p.filter, provider: p.filter !== 'all' ? p.filter : undefined, all: true, readAloud: Boolean(p.readAloud) }, env),
        });
      }

      case ACTION_TYPES.FAVORITES_SELECT: {
        if (p.selection.kind === 'random') {
          return wrapResult({
            handledLocally: true,
            actionResult: executeMusicAction(
              { action: 'favorites_select_random', filter: p.filter, collectionRef: p.collectionRef },
              env
            ),
          });
        }
        if (p.selection.kind === 'ordinal') {
          return wrapResult({
            handledLocally: true,
            actionResult: executeMusicAction(
              { action: 'favorites_select_ordinal', index: p.selection.index, collectionRef: p.collectionRef },
              env
            ),
          });
        }
        if (p.selection.kind === 'track') {
          const res = resolveFavoriteTrack({
            query: p.selection.query,
            title: p.selection.query,
            provider: p.provider || (p.filter !== 'all' ? p.filter : undefined),
            storage,
          });
          if (res.match) {
            return wrapResult(
              {
                handledLocally: true,
                actionResult: executeMusicAction(
                  { action: 'play_favorite', track: res.match, query: res.match.title },
                  env
                ),
              },
              p.selection.query
            );
          }
          if (res.clarificationNeeded || res.ambiguous) {
            return wrapResult(
              {
                handledLocally: true,
                actionResult: {
                  ok: false,
                  action: 'clarification_needed',
                  reason: res.ambiguous ? 'ambiguous_match' : (res.reason || 'clarification_needed'),
                  clarificationNeeded: true,
                  candidates: res.candidates,
                  suggestedCandidate: res.suggestedCandidate || res.candidates[0],
                  spokenConfirmation: res.spokenConfirmation || `Did you mean ${res.candidates[0]?.title}?`,
                },
              },
              p.selection.query
            );
          }
          return wrapResult(
            {
              handledLocally: true,
              actionResult: {
                ok: false,
                action: 'play_favorite',
                reason: 'not_found',
                spokenConfirmation: `I couldn't find "${p.selection.query}" in your favorites.`,
              },
            },
            p.selection.query
          );
        }
        break;
      }

      case ACTION_TYPES.MUSIC_PLAY: {
        const favRes = resolveFavoriteTrack({
          query: p.trackRef,
          title: p.trackRef,
          provider: p.provider,
          storage,
        });
        if (favRes.match) {
          return wrapResult({
            handledLocally: true,
            actionResult: executeMusicAction(
              { action: 'play_favorite', track: favRes.match, query: favRes.match.title },
              env
            ),
          });
        }
        if (favRes.clarificationNeeded) {
          return wrapResult({
            handledLocally: true,
            actionResult: {
              ok: false,
              action: 'clarification_needed',
              clarificationNeeded: true,
              candidates: favRes.candidates,
              suggestedCandidate: favRes.suggestedCandidate || favRes.candidates[0],
              spokenConfirmation: favRes.spokenConfirmation,
            },
          });
        }
        return wrapResult({
          handledLocally: true,
          actionResult: executeMusicAction(
            { action: 'play_track', query: p.trackRef, provider: p.provider },
            env
          ),
        });
      }
    }
  }

  // 0B. Multi-Action Commands (Priority 3)
  const plan = parseMultiActionPlan(rawText, env);
  if (plan && plan.steps.length > 1) {
    const planResult = executeActionPlan(plan, env);
    if (planResult.ok) {
      musicContext.recordSuccess(planResult.actionResult?.action || 'multi_action', planResult.track);
    } else {
      musicContext.recordFailure(
        planResult.actionResult?.action || 'multi_action',
        rawText,
        planResult.actionResult?.reason || 'action_plan_failed'
      );
    }
    return {
      handledLocally: true,
      isCompound: true,
      actionResult: planResult,
    };
  }

  // 0C. Volume Adjustments
  const volMatch = cleaned.match(/^(?:set|turn|change)?\s*(?:the\s+)?volume\s+(?:to\s+)?(\d+)%?$/i) ||
                   cleaned.match(/^(?:turn|turn\s+the\s+music)\s+(down|up|lower|higher)$/i) ||
                   cleaned.match(/^(?:make\s+it)\s+(quieter|louder)$/i) ||
                   cleaned.match(/^(?:volume)\s+(down|up|lower|higher)$/i);
  if (volMatch) {
    const res = executeMusicAction({ action: 'set_volume', level: volMatch[1] }, env);
    return wrapResult({
      handledLocally: true,
      actionResult: res,
    });
  }

  // 1. Basic Transport Commands
  if (/^(pause|pause music|pause the music|stop music|stop the music|pause playback|halt)$/i.test(cleaned)) {
    return wrapResult({
      handledLocally: true,
      actionResult: executeMusicAction({ action: 'pause' }, env),
    });
  }

  if (/^(resume|resume music|resume the music|resume playback|unpause|unpause music|continue playing)$/i.test(cleaned)) {
    return wrapResult({
      handledLocally: true,
      actionResult: executeMusicAction({ action: 'resume' }, env),
    });
  }

  // Generic "play" or "play music" when already active and paused -> resume
  if (/^(play|play music|start music)$/i.test(cleaned)) {
    if (media.active && media.status === 'paused') {
      return wrapResult({
        handledLocally: true,
        actionResult: executeMusicAction({ action: 'resume' }, env),
      });
    }
    // If nothing playing, play a random favorite
    return wrapResult({
      handledLocally: true,
      actionResult: executeMusicAction({ action: 'play_random_favorite' }, env),
    });
  }

  if (/^(next|next song|next track|skip|skip track|skip song|play the next song|play the next track)$/i.test(cleaned)) {
    return wrapResult({
      handledLocally: true,
      actionResult: executeMusicAction({ action: 'next_track' }, env),
    });
  }

  // 0D. Conversational Closing & Dismissal Detection (Part 4)
  const isClosingPhrase =
    /^(thanks|thank\s+you|thank\s+you\s+so\s+much|thanks\s+a\s+lot|no\s+thanks|no\s+thank\s+you|no\s+that(?:'s|\s+is)\s+all|that(?:'s|\s+is)\s+all|that(?:'s|\s+is)\s+it|nothing\s+else|bye|goodbye|done|dismiss)$/i.test(cleaned) ||
    /^(?:thanks|thank\s+you)[,\s]+(?:bye|goodbye|that(?:'s|\s+is)\s+all|done)$/i.test(cleaned);
  if (isClosingPhrase) {
    const isMusicPlaying = Boolean(
      (env.media?.active && env.media?.status === 'playing') ||
      (media?.active && media?.status === 'playing')
    );
    let closingAck;
    if (/bye|goodbye/i.test(cleaned)) {
      closingAck = isMusicPlaying ? 'Goodbye! Enjoy your music.' : 'Goodbye! Have a great day.';
    } else if (/no|that(?:'s|\s+is)\s+all|nothing/i.test(cleaned)) {
      closingAck = isMusicPlaying ? 'Understood. Enjoy your music!' : 'Understood. Enjoy your day!';
    } else {
      closingAck = isMusicPlaying ? "You're welcome! Enjoy your music." : "You're welcome! Have a great day.";
    }

    return {
      handledLocally: true,
      actionResult: {
        ok: true,
        action: 'session_dismiss',
        isSessionEnd: true,
        spokenConfirmation: closingAck,
      },
    };
  }

  // 0E. Informational questions about artists/music (Must NOT trigger playback!)
  if (/\b(?:tell\s+me|who\s+is|what\s+is|explain|describe|information)\s+(?:about\s+)?(?:this|the)\s+(?:artist|singer|band|musician|album)\b/i.test(cleaned) ||
      /\btell\s+me\s+about\s+(?:this|the)\s+artist\b/i.test(rawText)) {
    return { handledLocally: false, fallbackToLlm: true, reason: 'informational_query' };
  }

  if (/^(previous|previous song|previous track|prev song|prev track|go back|go back to the previous track|go back to the previous song)$/i.test(cleaned)) {
    return wrapResult({
      handledLocally: true,
      actionResult: executeMusicAction({ action: 'previous_track' }, env),
    });
  }

  // Current track inspection
  if (/^(what is playing|whats playing|what's playing|what song is this|what track is this|current song|current track|which song is playing|what song am i listening to|what am i listening to)$/i.test(cleaned)) {
    return wrapResult({
      handledLocally: true,
      actionResult: executeMusicAction({ action: 'get_current_track' }, env),
    });
  }

  // Explicit menu opening (redirects to full Favorites tab)
  if (/^(open|open\s+the)\s+(?:favorites\s+menu|favorites\s+page)$/i.test(cleaned)) {
    return wrapResult({
      handledLocally: true,
      actionResult: executeMusicAction({ action: 'show_favorites' }, env),
    });
  }

  // 1A. Favorites Count Request: "How many songs do I have?", "How many favorites do I have?"
  if (/^how\s+many\s+(?:favorites|songs|tracks|saved\s+songs|saved\s+tracks)(?:\s+do\s+i\s+have|\s+are\s+saved|\s+are\s+in\s+my\s+favorites|\s+in\s+my\s+favorites)?$/i.test(cleaned) ||
      /^how\s+many\s+songs\s+(?:are\s+in|in)\s+my\s+favorites$/i.test(cleaned)) {
    return wrapResult({
      handledLocally: true,
      actionResult: executeMusicAction({ action: 'count_favorites' }, env),
    });
  }

  // 1B. Complete List Request: "Name all of them", "List all of them", "Show all of them", "Read all of them aloud"
  if (/^(name|list|show|tell\s+me|read)\s+(all|all\s+of\s+them|every\s+song)(\s+in\s+my\s+favorites|\s+aloud)?$/i.test(cleaned)) {
    return wrapResult({
      handledLocally: true,
      actionResult: executeMusicAction({ action: 'list_favorites', all: true, readAloud: isExplicitReadAloudRequest(rawText) }, env),
    });
  }

  // 1C. Filtered List Request: "Show only Spotify songs", "Show my Spotify favorites"
  const spotifyListMatch = cleaned.match(/^(?:show|list|what\s+are)\s+(?:only\s+)?spotify\s+(?:favorites|songs|tracks)$/i) ||
                           cleaned.match(/^(?:show|list)\s+my\s+spotify\s+favorites$/i);
  if (spotifyListMatch) {
    return wrapResult({
      handledLocally: true,
      actionResult: executeMusicAction({ action: 'list_favorites', provider: 'spotify' }, env),
    });
  }

  const ytmListMatch = cleaned.match(/^(?:show|list|what\s+are)\s+(?:only\s+)?(?:youtube|youtube\s+music)\s+(?:favorites|songs|tracks)$/i) ||
                       cleaned.match(/^(?:show|list)\s+my\s+(?:youtube|youtube\s+music)\s+favorites$/i);
  if (ytmListMatch) {
    return wrapResult({
      handledLocally: true,
      actionResult: executeMusicAction({ action: 'list_favorites', provider: 'youtube' }, env),
    });
  }

  // 1D. General List Request: "Show my favorite songs", "Which songs have I saved?", "What songs are in my favorites?"
  // Directly renders inline favorites in Agent chat without navigating away!
  if (/^(show|list|what\s+are|which\s+songs\s+have\s+i\s+saved|what\s+songs\s+are\s+in\s+my\s+favorites|which\s+songs\s+do\s+i\s+have)\s*(my\s+favorite\s+songs|my\s+saved\s+songs|my\s+favorites|favorites)?$/i.test(cleaned) ||
      /^(which\s+songs|what\s+songs)\s+(have\s+i\s+saved|are\s+in\s+my\s+favorites|do\s+i\s+have)$/i.test(cleaned) ||
      /^(show|display|browse)\s+(my\s+)?(favorite\s+songs|favorites|saved\s+songs)$/i.test(cleaned)) {
    return wrapResult({
      handledLocally: true,
      actionResult: executeMusicAction({ action: 'list_favorites' }, env),
    });
  }

  if (/^(add\s+(this\s+song|this\s+track|this)?\s*to\s+favorites|favorite\s+this(\s+song)?|like\s+this(\s+song)?)$/i.test(cleaned)) {
    return wrapResult({
      handledLocally: true,
      actionResult: executeMusicAction({ action: 'add_current_to_favorites' }, env),
    });
  }

  // 2. Favorites Commands: Shuffle / Something / Saved songs / Spotify favorite
  if (/^play\s+(?:something\s+from\s+)?(?:my\s+)?spotify\s+favorites?$/i.test(cleaned) ||
      /^play\s+(?:a\s+)?spotify\s+favorite$/i.test(cleaned)) {
    return wrapResult({
      handledLocally: true,
      actionResult: executeMusicAction({ action: 'play_random_favorite', provider: 'spotify' }, env),
    });
  }

  if (/^play\s+(something|anything|a\s+song|random)\s+from\s+(my\s+)?favorites$/i.test(cleaned) ||
      /^play\s+my\s+(saved\s+songs|favorites)$/i.test(cleaned) ||
      /^shuffle\s+(my\s+)?favorites$/i.test(cleaned)) {
    return wrapResult({
      handledLocally: true,
      actionResult: executeMusicAction({ action: 'play_random_favorite' }, env),
    });
  }

  // 3. Favorites Command: Most recently liked song ("Play the song I just liked / saved")
  if (/^play\s+the\s+song\s+i\s+(just\s+)?(liked|saved|favorited)$/i.test(cleaned) ||
      /^play\s+(my\s+)?(recently|latest|last)\s+(liked|saved|favorited)\s+song$/i.test(cleaned)) {
    const resolution = resolveFavoriteTrack({ mostRecent: true, storage });
    if (!resolution.match) {
      return wrapResult({
        handledLocally: true,
        actionResult: {
          ok: false,
          action: 'play_favorite',
          reason: 'empty_favorites',
          spokenConfirmation: "You don't have any saved favorites yet.",
        },
      });
    }
    return wrapResult({
      handledLocally: true,
      actionResult: executeMusicAction({ action: 'play_favorite', track: resolution.match, query: resolution.match.title }, env),
    });
  }

  // 4. Natural-Language Music Intent with Source Constraints (Part 2)
  // Handles:
  // - "Play city of star from my list."
  // - "Play that city stars song I saved."
  // - "Play Starboy, but from Spotify."
  // - "Play Tuu."
  const playMatch = cleaned.match(/^play\s+(.+)$/i);
  if (playMatch) {
    let targetQuery = playMatch[1].trim();

    // Provider constraint extraction:
    let explicitProvider = null;
    if (/\b(?:,\s*)?(?:but\s+)?(?:from|on|in)\s+spotify\b/i.test(targetQuery)) {
      explicitProvider = SUPPORTED_PROVIDERS.SPOTIFY;
      targetQuery = targetQuery.replace(/\b(?:,\s*)?(?:but\s+)?(?:from|on|in)\s+spotify\b/gi, '').trim();
    } else if (/\b(?:,\s*)?(?:but\s+)?(?:from|on|in)\s+youtube(?:\s+music)?\b/i.test(targetQuery)) {
      explicitProvider = SUPPORTED_PROVIDERS.YOUTUBE;
      targetQuery = targetQuery.replace(/\b(?:,\s*)?(?:but\s+)?(?:from|on|in)\s+youtube(?:\s+music)?\b/gi, '').trim();
    } else if (/\b(?:,\s*)?(?:but\s+)?(?:from|on|in)\s+apple(?:\s+music)?\b/i.test(targetQuery)) {
      explicitProvider = SUPPORTED_PROVIDERS.APPLE;
      targetQuery = targetQuery.replace(/\b(?:,\s*)?(?:but\s+)?(?:from|on|in)\s+apple(?:\s+music)?\b/gi, '').trim();
    }

    // Source constraint extraction (Favorites / My List / Saved songs):
    let isFavoritesConstraint = false;
    if (/\b(?:from|in|on)\s+(?:my\s+)?(?:list|playlist|favorites|saved\s+songs|saved\s+tracks|library)\b/i.test(targetQuery)) {
      isFavoritesConstraint = true;
      targetQuery = targetQuery.replace(/\b(?:from|in|on)\s+(?:my\s+)?(?:list|playlist|favorites|saved\s+songs|saved\s+tracks|library)\b/gi, '').trim();
    } else if (/\b(?:that\s+)?(?:i\s+)?(?:saved|liked|favorited)\b/i.test(targetQuery)) {
      isFavoritesConstraint = true;
      targetQuery = targetQuery.replace(/\b(?:that\s+)?(?:i\s+)?(?:saved|liked|favorited)\b/gi, '').trim();
    } else if (/^my\s+favorite\s+song\s+(.+)$/i.test(targetQuery)) {
      isFavoritesConstraint = true;
      targetQuery = targetQuery.replace(/^my\s+favorite\s+song\s+/i, '').trim();
    } else if (/^favorite\s+(.+)$/i.test(targetQuery)) {
      isFavoritesConstraint = true;
      targetQuery = targetQuery.replace(/^favorite\s+/i, '').trim();
    }

    // Clean conversational wrapping: e.g. "that city stars song" -> "city stars"
    targetQuery = targetQuery
      .replace(/^(?:that|the)\s+/i, '')
      .replace(/\s+(?:song|track)$/i, '')
      .trim();

    // Check artist separator: "song by artist"
    let title = targetQuery;
    let artist = '';
    const byMatch = targetQuery.match(/^(.+?)\s+by\s+(.+)$/i);
    if (byMatch) {
      title = byMatch[1].trim();
      artist = byMatch[2].trim();
    }

    // If query was constrained to favorites ("from my list", "i saved", etc.)
    if (isFavoritesConstraint) {
      const resolution = resolveFavoriteTrack({
        query: targetQuery,
        title,
        artist,
        provider: explicitProvider,
        storage,
      });

      if (resolution.ambiguous) {
        const candidateList = resolution.candidates
          .map((c) => `"${c.title}"${c.artist ? ` by ${c.artist}` : ''}`)
          .join(' or ');
        return wrapResult({
          handledLocally: true,
          actionResult: {
            ok: false,
            action: 'play_favorite',
            reason: 'ambiguous_match',
            clarificationNeeded: true,
            matches: resolution.candidates,
            spokenConfirmation: `I found multiple matching songs in your favorites: ${candidateList}. Which one would you like?`,
          },
        });
      }

      if (resolution.match) {
        return wrapResult({
          handledLocally: true,
          actionResult: executeMusicAction(
            { action: 'play_favorite', track: resolution.match, query: resolution.match.title },
            env
          ),
        });
      }

      // Truthful negative feedback: Never fabricate or search internet if user explicitly requested from their list
      return wrapResult(
        {
          handledLocally: true,
          actionResult: {
            ok: false,
            action: 'play_favorite',
            reason: 'not_found',
            spokenConfirmation: `I couldn't find "${title}" in your favorites.`,
          },
        },
        title
      );
    }

    // General Play command: Check favorites first with high confidence
    const favRes = resolveFavoriteTrack({
      query: targetQuery,
      title,
      artist,
      provider: explicitProvider,
      storage,
    });

    if (favRes.match) {
      return wrapResult({
        handledLocally: true,
        actionResult: executeMusicAction(
          { action: 'play_favorite', track: favRes.match, query: favRes.match.title },
          env
        ),
      });
    }

    if (favRes.ambiguous) {
      const candidateList = favRes.candidates
        .map((c) => `"${c.title}"${c.artist ? ` by ${c.artist}` : ''}`)
        .join(' or ');
      return wrapResult({
        handledLocally: true,
        actionResult: {
          ok: false,
          action: 'play_track',
          reason: 'ambiguous_match',
          clarificationNeeded: true,
          matches: favRes.candidates,
          spokenConfirmation: `I found multiple matching songs: ${candidateList}. Which one did you mean?`,
        },
      });
    }

    return wrapResult({
      handledLocally: true,
      actionResult: executeMusicAction(
        { action: 'play_track', query: targetQuery, provider: explicitProvider },
        env
      ),
    });
  }

  // Not a deterministic music command -> pass to Groq chat
  return { handledLocally: false, fallbackToLlm: true };
}
