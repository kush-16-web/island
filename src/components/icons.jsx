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
};
