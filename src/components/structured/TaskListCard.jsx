import React from 'react';
import { Icon } from '../icons';

export default function TaskListCard({ tasks = [] }) {
  const hasTasks = Array.isArray(tasks) && tasks.length > 0;

  return (
    <div className="structured-card structured-card--tasks" role="region" aria-label="Task List">
      <div className="structured-card__header">
        <div className="structured-card__title-row">
          <Icon.Check width={13} height={13} className="structured-card__icon" />
          <span className="structured-card__title">Tasks</span>
          {hasTasks && <span className="structured-card__count-badge">{tasks.length}</span>}
        </div>
      </div>

      {!hasTasks ? (
        <div className="structured-card__empty-state">
          <span className="structured-card__empty-text">
            No active tasks recorded. Task persistence is not yet connected.
          </span>
        </div>
      ) : (
        <div className="structured-tasks__list">
          {tasks.map((task, idx) => (
            <div key={task.id || `task-${idx}`} className={`structured-tasks__item ${task.completed ? 'is-completed' : ''}`}>
              <div className="structured-tasks__checkbox">
                {task.completed ? <Icon.Check width={11} height={11} /> : null}
              </div>
              <div className="structured-tasks__content">
                <span className="structured-tasks__title">{task.title || task.text}</span>
                {task.dueDate && (
                  <span className="structured-tasks__due">Due {new Date(task.dueDate).toLocaleDateString()}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
