import React, { useState } from 'react';

/**
 * ConversationalTextCard: Renders text responses and speech-synchronized captions.
 * Satisfies Pass 2.2.8.2:
 * - Distinguishes spoken captions from real tool results.
 * - Does not dominate the UI with large paragraphs when structured tool results exist.
 * - Provides clean optional inspection for extended response text.
 * - Only illuminates active speaking state when speech audio playback is actually running.
 */
export default function ConversationalTextCard({
  text,
  spokenText,
  isAssistant = true,
  isSpeaking = false,
  hasStructuredResult = false,
}) {
  const [showFullDetails, setShowFullDetails] = useState(false);

  if (!text && !spokenText) return null;

  // When a structured tool result is present, display a short, elegant spoken caption
  if (hasStructuredResult && isAssistant) {
    const caption = spokenText || text;
    const isLongText = text && text.length > 120 && text !== caption;

    // Avoid duplicate or generic messages underneath specific tool results
    // (e.g. No duplicate "Your timer is running" or generic "Action completed" below the TimerCard)
    if (!isSpeaking && !isLongText) {
      return null;
    }

    return (
      <div className={`structured-caption-wrap ${isSpeaking ? 'is-speaking' : ''}`}>
        <div className="structured-caption__bar">
          <span className="structured-caption__text">"{caption}"</span>
          {isLongText && (
            <button
              type="button"
              className="structured-caption__toggle"
              onClick={() => setShowFullDetails((prev) => !prev)}
              aria-label={showFullDetails ? 'Hide full details' : 'View full text'}
            >
              {showFullDetails ? 'Hide text' : 'Full text'}
            </button>
          )}
        </div>

        {showFullDetails && isLongText && (
          <div className="structured-caption__full-text">{text}</div>
        )}
      </div>
    );
  }

  // Pure conversational text (no structured tool cards)
  const paragraphs = typeof text === 'string'
    ? text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)
    : [String(text || '')];

  const hasDistinctSpokenCaption = Boolean(
    isAssistant &&
    spokenText &&
    spokenText.trim() !== text.trim() &&
    !text.includes(spokenText.trim())
  );

  return (
    <div className={`live-conversation-body ${isSpeaking ? 'is-speaking' : ''}`}>
      <div className="live-conversation-body__paragraphs">
        {paragraphs.map((p, idx) => (
          <p key={idx} className="live-conversation-body__p">{p}</p>
        ))}
      </div>
      {hasDistinctSpokenCaption && isSpeaking && (
        <div
          className="live-conversation-body__spoken-caption"
          title="Spoken caption"
        >
          <span>"{spokenText}"</span>
        </div>
      )}
    </div>
  );
}
