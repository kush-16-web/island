import React from 'react';
import InlineFavorites from '../InlineFavorites';
import { Icon } from '../icons';

export default function MusicListCard({ tracks = [], title = 'Songs', provider = null }) {
  if (!tracks || tracks.length === 0) {
    return (
      <div className="structured-card structured-card--empty">
        <Icon.Music width={14} height={14} className="structured-card__icon" />
        <span className="structured-card__empty-text">No songs found in this collection.</span>
      </div>
    );
  }

  return (
    <div className="structured-card structured-card--music" role="region" aria-label="Music List">
      <div className="structured-card__header">
        <div className="structured-card__title-row">
          <Icon.Music width={13} height={13} className="structured-card__icon" />
          <span className="structured-card__title">{title}</span>
          <span className="structured-card__count-badge">{tracks.length}</span>
        </div>
      </div>
      <InlineFavorites tracks={tracks} />
    </div>
  );
}
