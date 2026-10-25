import React from 'react';
import { Icon } from '../icons';

export default function SavedIdeasCard({ ideas = [] }) {
  const hasIdeas = Array.isArray(ideas) && ideas.length > 0;

  return (
    <div className="structured-card structured-card--ideas" role="region" aria-label="Saved Ideas">
      <div className="structured-card__header">
        <div className="structured-card__title-row">
          <Icon.Sparkles width={13} height={13} className="structured-card__icon" />
          <span className="structured-card__title">Saved Ideas</span>
          {hasIdeas && <span className="structured-card__count-badge">{ideas.length}</span>}
        </div>
      </div>

      {!hasIdeas ? (
        <div className="structured-card__empty-state">
          <span className="structured-card__empty-text">
            No saved ideas recorded. Ideas storage is not yet connected.
          </span>
        </div>
      ) : (
        <div className="structured-ideas__list">
          {ideas.map((idea, idx) => (
            <div key={idea.id || `idea-${idx}`} className="structured-ideas__item">
              <span className="structured-ideas__text">{idea.content || idea.text || idea.title}</span>
              {idea.timestamp && (
                <span className="structured-ideas__time">
                  {new Date(idea.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
