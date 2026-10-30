/**
 * src/lib/nlu/agent-execution-contract.js
 * Shared Agent Execution Contract & Pipeline (Phase 3.5).
 *
 * Provides a unified, reliable execution contract for all Island assistant turns:
 * 1. Input Normalization
 * 2. Intent & Tool Selection
 * 3. Parameter & Authorization Validation
 * 4. Deterministic Tool Execution
 * 5. Structured Tool Result Generation (canonical schema)
 * 6. Natural Language Response Composition (Rich UI vs Clean TTS)
 * 7. Guaranteed Lifecycle Completion (no frozen turns)
 */

import { cleanTextForSpeech, createAgentResponse } from './agent-response-contract.js';

/**
 * Standard Canonical Tool Result Factory.
 * Enforces structured outcomes with verified data and provenance.
 *
 * @param {object} params
 * @param {string} params.tool - Name of the tool executed (e.g. 'weather', 'scheduler', 'music')
 * @param {string|number} params.requestId - Unique identifier of the calling turn/request
 * @param {boolean} [params.ok=true] - Whether the tool succeeded
 * @param {any} [params.data=null] - Structured payload returned by the tool
 * @param {string|null} [params.error=null] - Error message if execution failed
 * @param {string} [params.source='local'] - Provider/engine that executed the tool ('local', 'open-meteo', 'groq', 'gemini')
 * @param {string} [params.status='success'] - Execution status ('success', 'clarification', 'failure', 'rejected')
 * @param {number} [params.timestamp=Date.now()] - Execution epoch timestamp
 * @returns {object} Canonical tool result
 */
export function createCanonicalToolResult({
  tool,
  requestId,
  ok = true,
  data = null,
  error = null,
  source = 'local',
  status = 'success',
  timestamp = Date.now(),
}) {
  return Object.freeze({
    tool: String(tool || 'unknown'),
    requestId: String(requestId || Date.now()),
    ok: Boolean(ok),
    data: data || null,
    error: error ? String(error) : null,
    source: String(source),
    status: ok ? status : 'failure',
    timestamp,
  });
}

/**
 * Validates whether an object adheres to the Canonical Tool Result schema.
 * @param {any} res
 * @returns {boolean}
 */
export function isValidToolResult(res) {
  if (!res || typeof res !== 'object') return false;
  return (
    typeof res.tool === 'string' &&
    typeof res.requestId === 'string' &&
    typeof res.ok === 'boolean' &&
    typeof res.source === 'string' &&
    typeof res.timestamp === 'number'
  );
}

/**
 * Compose natural spoken and display responses from a canonical tool result.
 * Strictly avoids generic static fallbacks like 'Ready.' or 'Done.' without data.
 *
 * @param {object} toolResult - Canonical tool result from createCanonicalToolResult
 * @param {object} options - Composition options
 * @returns {object} { displayText, spokenText, responseStatus }
 */
export function composeAgentResponse(toolResult, options = {}) {
  if (!toolResult) {
    return createAgentResponse({
      displayText: "I couldn't complete that request.",
      spokenText: "I couldn't complete that request.",
      responseStatus: 'failure',
    });
  }

  const { tool, ok, data, error } = toolResult;

  if (!ok) {
    const errorMsg = error || data?.speech || data?.error || "I ran into a problem completing that action.";
    return createAgentResponse({
      displayText: errorMsg,
      spokenText: cleanTextForSpeech(errorMsg),
      toolResults: { [tool]: data },
      responseStatus: 'failure',
    });
  }

  // Format based on tool type
  if (tool === 'weather') {
    const speech = data?.speech || `The weather in ${data?.city || 'your area'} is ${data?.temperature}°C.`;
    const display = data?.displayText || speech;
    return createAgentResponse({
      displayText: display,
      spokenText: cleanTextForSpeech(speech),
      toolResults: { type: 'weather', weather: data },
      responseStatus: 'success',
    });
  }

  if (tool === 'scheduler') {
    const speech = data?.spokenConfirmation || data?.message || 'Timer updated.';
    const display = data?.displayText || speech;
    return createAgentResponse({
      displayText: display,
      spokenText: cleanTextForSpeech(speech),
      toolResults: { type: 'scheduler', scheduler: data },
      responseStatus: data?.clarificationNeeded ? 'clarification' : 'success',
    });
  }

  if (tool === 'music') {
    const speech = data?.spokenConfirmation || (data?.track ? `Playing ${data.track.title}.` : 'Playing music.');
    const display = data?.displayText || speech;
    return createAgentResponse({
      displayText: display,
      spokenText: cleanTextForSpeech(speech),
      toolResults: {
        tracks: data?.tracks || null,
        candidates: data?.candidates || null,
      },
      responseStatus: data?.clarificationNeeded ? 'clarification' : 'success',
    });
  }

  // General or conversational tool
  const fallbackSpeech = data?.speech || data?.message || data?.displayText || 'Action completed.';
  return createAgentResponse({
    displayText: data?.displayText || fallbackSpeech,
    spokenText: cleanTextForSpeech(fallbackSpeech),
    toolResults: { [tool]: data },
    responseStatus: 'success',
  });
}

/**
 * Execute an agent turn through the shared execution pipeline.
 *
 * @param {object} params
 * @param {string} params.input - User utterance or input text
 * @param {string|number} params.turnId - Unique turn ID
 * @param {object} params.context - Context (schedule, media, history, storage)
 * @param {object} params.dispatchers - Tool handlers ({ weather, scheduler, music, llm })
 * @returns {Promise<object>} Structured execution result
 */
export async function executeAgentTurn({
  input,
  turnId = Date.now(),
  context = {},
  dispatchers = {},
}) {
  const normInput = typeof input === 'string' ? input.trim() : '';
  const startTime = Date.now();

  try {
    // 1. Weather Tool Dispatcher
    if (dispatchers.weather && typeof dispatchers.weather.match === 'function') {
      const match = dispatchers.weather.match(normInput, context);
      if (match) {
        const rawRes = await dispatchers.weather.execute(match, context);
        const toolResult = createCanonicalToolResult({
          tool: 'weather',
          requestId: turnId,
          ok: rawRes?.ok !== false,
          data: rawRes,
          error: rawRes?.ok === false ? rawRes.error || rawRes.speech : null,
          source: 'open-meteo',
        });
        const agentResponse = composeAgentResponse(toolResult);
        return {
          executed: true,
          tool: 'weather',
          toolResult,
          agentResponse,
          spokenText: agentResponse.spokenText,
          displayText: agentResponse.displayText,
          durationMs: Date.now() - startTime,
        };
      }
    }

    // 2. Scheduler Tool Dispatcher
    if (dispatchers.scheduler && typeof dispatchers.scheduler.match === 'function') {
      const match = dispatchers.scheduler.match(normInput, context);
      if (match && match.isScheduler) {
        const rawRes = await dispatchers.scheduler.execute(match, context);
        const toolResult = createCanonicalToolResult({
          tool: 'scheduler',
          requestId: turnId,
          ok: rawRes?.ok !== false,
          data: rawRes,
          error: rawRes?.ok === false ? rawRes.error : null,
          source: 'local',
        });
        const agentResponse = composeAgentResponse(toolResult);
        return {
          executed: true,
          tool: 'scheduler',
          toolResult,
          agentResponse,
          spokenText: agentResponse.spokenText,
          displayText: agentResponse.displayText,
          durationMs: Date.now() - startTime,
        };
      }
    }

    // 3. Fallback to conversational LLM dispatcher
    if (dispatchers.llm && typeof dispatchers.llm.execute === 'function') {
      const rawRes = await dispatchers.llm.execute(normInput, context);
      const text = typeof rawRes === 'string' ? rawRes : rawRes?.text || '';
      const spoken = cleanTextForSpeech(text);
      const agentResponse = createAgentResponse({
        displayText: text,
        spokenText: spoken,
        responseStatus: 'success',
      });
      return {
        executed: true,
        tool: 'conversational_llm',
        toolResult: createCanonicalToolResult({
          tool: 'conversational_llm',
          requestId: turnId,
          ok: true,
          data: { text },
          source: 'llm',
        }),
        agentResponse,
        spokenText: spoken,
        displayText: text,
        durationMs: Date.now() - startTime,
      };
    }

    return {
      executed: false,
      tool: null,
      toolResult: null,
      spokenText: '',
      displayText: '',
      durationMs: Date.now() - startTime,
    };
  } catch (err) {
    const failResult = createCanonicalToolResult({
      tool: 'pipeline',
      requestId: turnId,
      ok: false,
      error: err.message,
      source: 'local',
    });
    const agentResponse = composeAgentResponse(failResult);
    return {
      executed: false,
      error: err.message,
      toolResult: failResult,
      agentResponse,
      spokenText: agentResponse.spokenText,
      displayText: agentResponse.displayText,
      durationMs: Date.now() - startTime,
    };
  }
}

export default {
  createCanonicalToolResult,
  isValidToolResult,
  composeAgentResponse,
  executeAgentTurn,
};

