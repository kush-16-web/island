import { useState, useRef, useEffect } from 'react';
import Titlebar from '../common/Titlebar';
import { useThemeMode } from '../common/useThemeMode';
import { useWindowState } from '../common/useWindowState';
import { Icon } from '../icons';
import islandIconHero from '../../assets/island-icon-64.png';
import '../common/quiet-glass.css';
import './workspace.css';

/**
 * WorkspaceApp: AI Desktop Companion (Phase 1A.4).
 * 
 * Dimensions: 680×520 default (min 600×440).
 * Features:
 * - Collapsible ChatGPT-style left sidebar (190px) with New Chat & history area
 * - Smooth collapse/expand transition with state persistence
 * - Dedicated sidebar toggle in titlebar when collapsed
 * - Clean, quiet conversation canvas with minimal empty state
 * - Refined single-surface composer (no double border, monochrome send button)
 * - Fluid, restrained maximize/restore layout adaptation (180–220ms)
 */
export default function WorkspaceApp() {
  const { accentColor, isDynamic, hasAlbumColor, windowStyle } = useThemeMode();
  const { isMaximized, isTransitioning, toggleMaximize } = useWindowState();
  const [inputText, setInputText] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('island_sidebar_collapsed') !== 'true';
    }
    return true;
  });

  const textareaRef = useRef(null);

  // Auto-resize textarea height smoothly
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [inputText]);

  const toggleSidebar = () => {
    setSidebarOpen((prev) => {
      const next = !prev;
      if (typeof window !== 'undefined') {
        localStorage.setItem('island_sidebar_collapsed', String(!next));
      }
      return next;
    });
  };

  const handleNewChat = () => {
    setInputText('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.focus();
    }
  };

  const handleClear = () => {
    setInputText('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.focus();
    }
  };

  const handleTriggerVoice = () => {
    if (window.island?.getState) {
      window.island.getState().catch(() => {});
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      // Messaging backend connects in Phase 2
    }
  };

  const hasText = inputText.trim().length > 0;

  // Sidebar toggle icon for titlebar
  const titlebarToggle = (
    <button
      type="button"
      className="workspace-titlebar-toggle"
      onClick={toggleSidebar}
      title={sidebarOpen ? 'Collapse sidebar' : 'Open sidebar'}
      aria-label={sidebarOpen ? 'Collapse sidebar' : 'Open sidebar'}
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect width="18" height="18" x="3" y="3" rx="2" />
        <path d="M9 3v18" />
      </svg>
    </button>
  );

  return (
    <div
      className={`quiet-glass-window workspace-layout${hasAlbumColor ? ' is-dynamic' : ''}${isMaximized ? ' is-maximized' : ''}${isTransitioning ? ' is-transitioning' : ''}`}
      style={windowStyle}
    >
      <Titlebar
        title="Island AI"
        subtitle={hasAlbumColor ? 'Dynamic' : ''}
        accentColor={accentColor}
        isDynamic={hasAlbumColor}
        leftAction={!sidebarOpen ? titlebarToggle : null}
        isMaximized={isMaximized}
        onToggleMaximize={toggleMaximize}
      />

      <div className="workspace-main-row">
        {/* Collapsible Left Sidebar */}
        <aside
          className={`workspace-sidebar${sidebarOpen ? ' is-open' : ' is-collapsed'}`}
          aria-label="Conversation history"
          aria-hidden={!sidebarOpen}
        >
          <div className="workspace-sidebar__header">
            <button
              type="button"
              className="workspace-sidebar__new-chat-btn"
              onClick={handleNewChat}
              title="Start a new dialogue"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              <span>New Chat</span>
            </button>

            <button
              type="button"
              className="workspace-sidebar__toggle-btn"
              onClick={toggleSidebar}
              title="Collapse sidebar"
              aria-label="Collapse sidebar"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect width="18" height="18" x="3" y="3" rx="2" />
                <path d="M9 3v18" />
              </svg>
            </button>
          </div>

          <div className="workspace-sidebar__content">
            <div className="workspace-sidebar__empty">
              <span className="workspace-sidebar__empty-label">No conversations yet</span>
              <span className="workspace-sidebar__empty-sub">Saved chats will appear here</span>
            </div>
          </div>
        </aside>

        {/* Main Conversation Canvas */}
        <main className="workspace-canvas" role="main">
          <div className="workspace-canvas__center">
            <div className="workspace-brand-hero" aria-hidden="true">
              <img
                src={islandIconHero}
                className={`workspace-brand-icon${hasAlbumColor ? ' is-dynamic' : ''}`}
                alt=""
                width={38}
                height={38}
              />
            </div>
            <p className="workspace-canvas__prompt">
              How can I help you today?
            </p>
          </div>

          {/* Bottom Message Composer */}
          <div className="workspace-composer-container">
            <div className="workspace-composer">
              <textarea
                ref={textareaRef}
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask anything or plan your focus..."
                className="workspace-composer__input"
                rows={1}
                aria-label="Message Island AI"
                spellCheck={false}
              />

              <div className="workspace-composer__actions">
                {hasText && (
                  <button
                    type="button"
                    className="workspace-composer__action-btn workspace-composer__action-btn--clear"
                    onClick={handleClear}
                    title="Clear input"
                    aria-label="Clear input"
                  >
                    <Icon.Close width={13} height={13} />
                  </button>
                )}

                <button
                  type="button"
                  className="workspace-composer__action-btn"
                  onClick={handleTriggerVoice}
                  title="Voice Assistant (Ctrl+Alt+Space)"
                  aria-label="Voice Assistant"
                >
                  <Icon.Mic width={15} height={15} />
                </button>

                <button
                  type="button"
                  className={`workspace-composer__action-btn workspace-composer__send-btn${hasText ? ' is-active' : ''}`}
                  disabled={!hasText}
                  title={hasText ? 'Messaging connected in Phase 2' : 'Type a message'}
                  aria-label="Send message"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <line x1="12" y1="19" x2="12" y2="5" />
                    <polyline points="5 12 12 5 19 12" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
