import React from 'react';
import ConversationalTextCard from './ConversationalTextCard';
import MusicListCard from './MusicListCard';
import SchedulerCard from './SchedulerCard';
import WeatherCard from './WeatherCard';
import TaskListCard from './TaskListCard';
import SavedIdeasCard from './SavedIdeasCard';
import InlineClarification from '../InlineClarification';

/**
 * StructuredResponseRegistry: Modular dispatch table for AI Assistant responses.
 * Avoids giant monolithic conditional trees.
 */
const RESPONSE_RENDERERS = [
  {
    name: 'music_list',
    predicate: (item) => Boolean(
      (item.tracks && item.tracks.length > 0) ||
      (item.toolResults?.tracks && item.toolResults.tracks.length > 0) ||
      item.toolResults?.type === 'favorites'
    ),
    render: (item) => {
      const tracks = item.tracks || item.toolResults?.tracks || [];
      const title = item.toolResults?.provider
        ? `${item.toolResults.provider === 'spotify' ? 'Spotify' : 'YouTube Music'} Favorites`
        : 'Favorite Songs';
      return <MusicListCard tracks={tracks} title={title} />;
    },
  },
  {
    name: 'alarm_timer',
    predicate: (item) => Boolean(
      item.toolResults?.type === 'scheduler' ||
      item.scheduler ||
      (item.actionResult?.action && ['set_timer', 'set_alarm', 'query_status', 'cancel_alarm', 'cancel_timer'].includes(item.actionResult.action))
    ),
    render: (item) => {
      const data = item.toolResults?.scheduler || item.scheduler || item.actionResult || item.toolResults;
      return <SchedulerCard data={data} />;
    },
  },
  {
    name: 'weather',
    predicate: (item) => Boolean(item.weather || item.toolResults?.weather),
    render: (item) => {
      const weather = item.weather || item.toolResults?.weather;
      return <WeatherCard weather={weather} />;
    },
  },
  {
    name: 'clarification',
    predicate: (item) => Boolean(item.candidates && item.candidates.length > 0),
    render: (item) => <InlineClarification candidates={item.candidates} />,
  },
  {
    name: 'task_list',
    predicate: (item) => Boolean(item.tasks || item.toolResults?.type === 'tasks'),
    render: (item) => <TaskListCard tasks={item.tasks || item.toolResults?.tasks || []} />,
  },
  {
    name: 'saved_ideas',
    predicate: (item) => Boolean(item.ideas || item.toolResults?.type === 'ideas'),
    render: (item) => <SavedIdeasCard ideas={item.ideas || item.toolResults?.ideas || []} />,
  },
];

/**
 * StructuredResponseRenderer: Reusable response presentation layer.
 * Prioritizes structured tool results as the primary hero content,
 * separated from short spoken captions and optional full text inspection.
 */
export default function StructuredResponseRenderer({
  item,
  isAssistant = true,
  isSpeaking = false,
}) {
  if (!item) return null;

  const displayText = item.displayText || item.text || '';
  const spokenText = item.spokenText || null;

  // Find all matched structured renderers
  const matchedRenderers = RESPONSE_RENDERERS.filter((r) => r.predicate(item));
  const hasStructuredResult = matchedRenderers.length > 0;

  return (
    <div className="structured-response-container">
      {/* 1. Structured presentation cards appear FIRST as the primary useful result */}
      {isAssistant && matchedRenderers.map((r) => (
        <React.Fragment key={r.name}>
          {r.render(item)}
        </React.Fragment>
      ))}

      {/* 2. Spoken caption / conversational text */}
      <ConversationalTextCard
        text={displayText}
        spokenText={spokenText}
        isAssistant={isAssistant}
        isSpeaking={isSpeaking}
        hasStructuredResult={hasStructuredResult}
      />
    </div>
  );
}
