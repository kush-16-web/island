const base = {
  width: 18,
  height: 18,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
};

const solid = { ...base, fill: 'currentColor', stroke: 'none' };

export const Icon = {
  Bell: (p) => (
    <svg {...base} {...p}>
      <path d="M6 9a6 6 0 1 1 12 0c0 5 2 6.5 2 6.5H4S6 14 6 9Z" />
      <path d="M10 19a2 2 0 0 0 4 0" />
    </svg>
  ),
  Timer: (p) => (
    <svg {...base} {...p}>
      <circle cx="12" cy="13.5" r="7.5" />
      <path d="M12 9.5v4l2.5 1.5M9.5 3h5" />
    </svg>
  ),
  Music: (p) => (
    <svg {...base} {...p}>
      <path d="M9 18V6l10-2v12" />
      <circle cx="6.5" cy="18" r="2.5" />
      <circle cx="16.5" cy="16" r="2.5" />
    </svg>
  ),
  Inbox: (p) => (
    <svg {...base} {...p}>
      <path d="M4 13l2.4-7.2A2 2 0 0 1 8.3 4.5h7.4a2 2 0 0 1 1.9 1.3L20 13" />
      <path d="M4 13v4.5A1.5 1.5 0 0 0 5.5 19h13a1.5 1.5 0 0 0 1.5-1.5V13h-4.5a3.5 3.5 0 0 1-7 0H4Z" />
    </svg>
  ),
  Play: (p) => (
    <svg {...solid} {...p}>
      <path d="M8 5.6v12.8a1 1 0 0 0 1.5.86l10.1-6.4a1 1 0 0 0 0-1.72L9.5 4.74A1 1 0 0 0 8 5.6Z" />
    </svg>
  ),
  Pause: (p) => (
    <svg {...solid} {...p}>
      <rect x="6.5" y="5" width="4" height="14" rx="1.4" />
      <rect x="13.5" y="5" width="4" height="14" rx="1.4" />
    </svg>
  ),
  Next: (p) => (
    <svg {...solid} {...p}>
      <path d="M5.5 6.4v11.2a.9.9 0 0 0 1.4.75l8-5.6a.9.9 0 0 0 0-1.5l-8-5.6a.9.9 0 0 0-1.4.75Z" />
      <rect x="16.6" y="5.5" width="2.6" height="13" rx="1.3" />
    </svg>
  ),
  Prev: (p) => (
    <svg {...solid} {...p}>
      <path d="M18.5 6.4v11.2a.9.9 0 0 1-1.4.75l-8-5.6a.9.9 0 0 1 0-1.5l8-5.6a.9.9 0 0 1 1.4.75Z" />
      <rect x="4.8" y="5.5" width="2.6" height="13" rx="1.3" />
    </svg>
  ),
  Close: (p) => (
    <svg {...base} {...p}>
      <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />
    </svg>
  ),
  Chevron: (p) => (
    <svg {...base} {...p}>
      <path d="M6 14.5l6-6 6 6" />
    </svg>
  ),
  Plus: (p) => (
    <svg {...base} {...p}>
      <path d="M12 5.5v13M5.5 12h13" />
    </svg>
  ),
  Paw: (p) => (
    <svg {...base} {...p}>
      <circle cx="6.5" cy="8.5" r="1.8" fill="currentColor" stroke="none" />
      <circle cx="11" cy="6" r="2" fill="currentColor" stroke="none" />
      <circle cx="16" cy="7" r="1.8" fill="currentColor" stroke="none" />
      <circle cx="18.5" cy="11" r="1.6" fill="currentColor" stroke="none" />
      <path d="M7 14c-1 3 1.5 5 5 5s6-2 5-5c-.8-2.5-3.5-3-5-3s-4.2.5-5 3z" fill="currentColor" stroke="none" />
    </svg>
  ),
  Settings: (p) => (
    <svg {...base} {...p}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  ),
  ArrowLeft: (p) => (
    <svg {...base} {...p}>
      <path d="M19 12H5M12 19l-7-7 7-7" />
    </svg>
  ),
  Cat: (p) => (
    <svg {...base} {...p}>
      <path d="M5 19c0-4.5 3-8 7-8s7 3.5 7 8M6.5 11.5L4.5 5l5.5 3M17.5 11.5L19.5 5l-5.5 3" />
      <circle cx="9.5" cy="14" r="1" fill="currentColor" />
      <circle cx="14.5" cy="14" r="1" fill="currentColor" />
      <path d="M11 16.2c.5.4 1.5.4 2 0" />
    </svg>
  ),
  Dog: (p) => (
    <svg {...base} {...p}>
      <path d="M6 19c0-4.5 2.5-8 6-8s6 3.5 6 8M5 9.5c-.8 2.5 0 4.5 1.8 4.5M19 9.5c.8 2.5 0 4.5-1.8 4.5" />
      <circle cx="9.5" cy="13.5" r="1" fill="currentColor" />
      <circle cx="14.5" cy="13.5" r="1" fill="currentColor" />
      <circle cx="12" cy="15.5" r="1.1" fill="currentColor" />
    </svg>
  ),
  Mic: (p) => (
    <svg {...base} {...p}>
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v3M8 22h8" />
    </svg>
  ),
  Heart: (p) => (
    <svg {...base} {...p}>
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  ),
  HeartSolid: (p) => (
    <svg {...solid} {...p}>
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  ),
};
