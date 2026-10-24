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
  Alert: ({ className = '', ...p }) => (
    <svg {...base} className={`lucide-icon ${className}`} {...p}>
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  ),
  Bell: ({ className = '', ...p }) => (
    <svg {...base} className={`lucide-icon lucide-icon--bell ${className}`} {...p}>
      <path d="M6 9a6 6 0 1 1 12 0c0 5 2 6.5 2 6.5H4S6 14 6 9Z" />
      <path d="M10 19a2 2 0 0 0 4 0" />
    </svg>
  ),
  Timer: ({ className = '', ...p }) => (
    <svg {...base} className={`lucide-icon lucide-icon--timer ${className}`} {...p}>
      <circle cx="12" cy="13.5" r="7.5" />
      <path d="M12 9.5v4l2.5 1.5M9.5 3h5" />
    </svg>
  ),
  Music: ({ className = '', ...p }) => (
    <svg {...base} className={`lucide-icon lucide-icon--music ${className}`} {...p}>
      <path d="M9 18V6l10-2v12" />
      <circle cx="6.5" cy="18" r="2.5" />
      <circle cx="16.5" cy="16" r="2.5" />
    </svg>
  ),
  Inbox: ({ className = '', ...p }) => (
    <svg {...base} className={`lucide-icon lucide-icon--inbox ${className}`} {...p}>
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
  Replay5: (p) => (
    <svg {...base} {...p}>
      <path d="M3.5 13a9 9 0 1 0 2.5-6.2L3 10M3 4v6h6" />
      <text x="12" y="15.5" fontSize="7.5" fontWeight="800" textAnchor="middle" fill="currentColor" stroke="none">5</text>
    </svg>
  ),
  Forward5: (p) => (
    <svg {...base} {...p}>
      <path d="M20.5 13a9 9 0 1 1-2.5-6.2L21 10M21 4v6h-6" />
      <text x="12" y="15.5" fontSize="7.5" fontWeight="800" textAnchor="middle" fill="currentColor" stroke="none">5</text>
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
  Paw: ({ className = '', ...p }) => (
    <svg {...base} className={`lucide-icon lucide-icon--paw ${className}`} {...p}>
      <circle cx="6.5" cy="8.5" r="1.8" fill="currentColor" stroke="none" />
      <circle cx="11" cy="6" r="2" fill="currentColor" stroke="none" />
      <circle cx="16" cy="7" r="1.8" fill="currentColor" stroke="none" />
      <circle cx="18.5" cy="11" r="1.6" fill="currentColor" stroke="none" />
      <path d="M7 14c-1 3 1.5 5 5 5s6-2 5-5c-.8-2.5-3.5-3-5-3s-4.2.5-5 3z" fill="currentColor" stroke="none" />
    </svg>
  ),
  Settings: ({ className = '', ...p }) => (
    <svg {...base} className={`lucide-icon lucide-icon--settings ${className}`} {...p}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  ),
  ArrowLeft: ({ className = '', ...p }) => (
    <svg {...base} className={`lucide-icon ${className}`} {...p}>
      <path d="M19 12H5M12 19l-7-7 7-7" />
    </svg>
  ),
  Cat: ({ className = '', ...p }) => (
    <svg {...base} className={`lucide-icon ${className}`} {...p}>
      <path d="M5 19c0-4.5 3-8 7-8s7 3.5 7 8M6.5 11.5L4.5 5l5.5 3M17.5 11.5L19.5 5l-5.5 3" />
      <circle cx="9.5" cy="14" r="1" fill="currentColor" />
      <circle cx="14.5" cy="14" r="1" fill="currentColor" />
      <path d="M11 16.2c.5.4 1.5.4 2 0" />
    </svg>
  ),
  Dog: ({ className = '', ...p }) => (
    <svg {...base} className={`lucide-icon ${className}`} {...p}>
      <path d="M6 19c0-4.5 2.5-8 6-8s6 3.5 6 8M5 9.5c-.8 2.5 0 4.5 1.8 4.5M19 9.5c.8 2.5 0 4.5-1.8 4.5" />
      <circle cx="9.5" cy="13.5" r="1" fill="currentColor" />
      <circle cx="14.5" cy="13.5" r="1" fill="currentColor" />
      <circle cx="12" cy="15.5" r="1.1" fill="currentColor" />
    </svg>
  ),
  Mic: ({ className = '', ...p }) => (
    <svg {...base} className={`lucide-icon ${className}`} {...p}>
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v3M8 22h8" />
    </svg>
  ),
  MicOff: ({ className = '', ...p }) => (
    <svg {...base} className={`lucide-icon ${className}`} {...p}>
      <line x1="2" y1="2" x2="22" y2="22" />
      <path d="M18.89 13.23A7.12 7.12 0 0 0 19 12v-2" />
      <path d="M5 10v2a7 7 0 0 0 12 5" />
      <path d="M15 9.34V5a3 3 0 0 0-5.68-1.33" />
      <path d="M9 9v3a3 3 0 0 0 5.12 2.12" />
      <line x1="12" y1="19" x2="12" y2="22" />
      <line x1="8" y1="22" x2="16" y2="22" />
    </svg>
  ),
  Heart: ({ className = '', ...p }) => (
    <svg {...base} className={`lucide-icon ${className}`} {...p}>
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  ),
  HeartSolid: ({ className = '', ...p }) => (
    <svg {...solid} className={`lucide-icon ${className}`} {...p}>
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  ),
  Video: ({ className = '', ...p }) => (
    <svg {...base} className={`lucide-icon ${className}`} {...p}>
      <polygon points="23 7 16 12 23 17 23 7" fill="currentColor" stroke="none" />
      <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
    </svg>
  ),
  Move: ({ className = '', ...p }) => (
    <svg {...base} className={`lucide-icon lucide-icon--move ${className}`} {...p}>
      <polyline points="5 9 2 12 5 15" />
      <polyline points="9 5 12 2 15 5" />
      <polyline points="15 19 12 22 9 19" />
      <polyline points="19 9 22 12 19 15" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <line x1="12" y1="2" x2="12" y2="22" />
    </svg>
  ),
  Layers: ({ className = '', ...p }) => (
    <svg {...base} className={`lucide-icon lucide-icon--layers ${className}`} {...p}>
      <polygon points="12 2 2 7 12 12 22 7 12 2" />
      <polyline points="2 17 12 22 22 17" />
      <polyline points="2 12 12 17 22 12" />
    </svg>
  ),
  Maximize: ({ className = '', ...p }) => (
    <svg {...base} className={`lucide-icon lucide-icon--maximize ${className}`} {...p}>
      <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
    </svg>
  ),
  Sliders: ({ className = '', ...p }) => (
    <svg {...base} className={`lucide-icon lucide-icon--sliders ${className}`} {...p}>
      <line x1="4" y1="21" x2="4" y2="14" />
      <line x1="4" y1="10" x2="4" y2="3" />
      <line x1="12" y1="21" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12" y2="3" />
      <line x1="20" y1="21" x2="20" y2="16" />
      <line x1="20" y1="12" x2="20" y2="3" />
      <line x1="1" y1="14" x2="7" y2="14" />
      <line x1="9" y1="8" x2="15" y2="8" />
      <line x1="17" y1="16" x2="23" y2="16" />
    </svg>
  ),
  Magnet: ({ className = '', ...p }) => (
    <svg {...base} className={`lucide-icon lucide-icon--magnet ${className}`} {...p}>
      <path d="m6 15-4-4 6.75-6.77a7.78 7.78 0 0 1 11 11L13 22l-4-4 6.35-6.35a2.14 2.14 0 0 0-3-3L6 15Z" />
      <path d="m5 8 4 4" />
      <path d="m12 15 4 4" />
    </svg>
  ),
  Sparkles: ({ className = '', ...p }) => (
    <svg {...base} className={`lucide-icon lucide-icon--sparkles ${className}`} {...p}>
      <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
      <path d="M5 3v4" />
      <path d="M19 17v4" />
      <path d="M3 5h4" />
      <path d="M17 19h4" />
    </svg>
  ),
  RotateCcw: ({ className = '', ...p }) => (
    <svg {...base} className={`lucide-icon lucide-icon--rotate-ccw ${className}`} {...p}>
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
    </svg>
  ),
  Monitor: ({ className = '', ...p }) => (
    <svg {...base} className={`lucide-icon lucide-icon--monitor ${className}`} {...p}>
      <rect width="20" height="14" x="2" y="3" rx="2" />
      <line x1="8" x2="16" y1="21" y2="21" />
      <line x1="12" x2="12" y1="17" y2="21" />
    </svg>
  ),
  Compass: ({ className = '', ...p }) => (
    <svg {...base} className={`lucide-icon lucide-icon--compass ${className}`} {...p}>
      <circle cx="12" cy="12" r="10" />
      <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
    </svg>
  ),
  Check: ({ className = '', ...p }) => (
    <svg {...base} className={`lucide-icon ${className}`} {...p}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
  Volume2: ({ className = '', ...p }) => (
    <svg {...base} className={`lucide-icon ${className}`} {...p}>
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
    </svg>
  ),
  VolumeX: ({ className = '', ...p }) => (
    <svg {...base} className={`lucide-icon ${className}`} {...p}>
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <line x1="23" y1="9" x2="17" y2="15" />
      <line x1="17" y1="9" x2="23" y2="15" />
    </svg>
  ),
  Hourglass: ({ className = '', ...p }) => (
    <svg {...base} className={`lucide-icon ${className}`} {...p}>
      <path d="M5 22h14" />
      <path d="M5 2h14" />
      <path d="M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22" />
      <path d="M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2" />
    </svg>
  ),
  Home: ({ className = '', ...p }) => (
    <svg {...base} className={`lucide-icon lucide-icon--home ${className}`} {...p}>
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  ),
  Grid: ({ className = '', ...p }) => (
    <svg {...base} className={`lucide-icon lucide-icon--grid ${className}`} {...p}>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
    </svg>
  ),
  Search: ({ className = '', ...p }) => (
    <svg {...base} className={`lucide-icon lucide-icon--search ${className}`} {...p}>
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  ),
  Sun: ({ className = '', ...p }) => (
    <svg {...base} className={`lucide-icon lucide-icon--sun ${className}`} {...p}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </svg>
  ),
  Moon: ({ className = '', ...p }) => (
    <svg {...base} className={`lucide-icon lucide-icon--moon ${className}`} {...p}>
      <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
    </svg>
  ),
  Cloud: ({ className = '', ...p }) => (
    <svg {...base} className={`lucide-icon lucide-icon--cloud ${className}`} {...p}>
      <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" />
    </svg>
  ),
  CloudRain: ({ className = '', ...p }) => (
    <svg {...base} className={`lucide-icon lucide-icon--cloud-rain ${className}`} {...p}>
      <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242" />
      <path d="M16 14v6M8 14v6M12 16v6" />
    </svg>
  ),
  CloudLightning: ({ className = '', ...p }) => (
    <svg {...base} className={`lucide-icon lucide-icon--cloud-lightning ${className}`} {...p}>
      <path d="M6 16.326A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 .5 8.973" />
      <path d="m13 12-3 5h4l-3 5" />
    </svg>
  ),
  CloudSnow: ({ className = '', ...p }) => (
    <svg {...base} className={`lucide-icon lucide-icon--cloud-snow ${className}`} {...p}>
      <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242" />
      <path d="M8 15h.01M8 19h.01M12 17h.01M12 21h.01M16 15h.01M16 19h.01" />
    </svg>
  ),
  CloudDrizzle: ({ className = '', ...p }) => (
    <svg {...base} className={`lucide-icon lucide-icon--cloud-drizzle ${className}`} {...p}>
      <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242" />
      <path d="M8 19v1M8 14v1M16 19v1M16 14v1M12 21v1M12 16v1" />
    </svg>
  ),
  CloudFog: ({ className = '', ...p }) => (
    <svg {...base} className={`lucide-icon lucide-icon--cloud-fog ${className}`} {...p}>
      <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242" />
      <path d="M16 17H7M17 21H9" />
    </svg>
  ),
  Thermometer: ({ className = '', ...p }) => (
    <svg {...base} className={`lucide-icon lucide-icon--thermometer ${className}`} {...p}>
      <path d="M14 4v10.54a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0Z" />
    </svg>
  ),
  Wind: ({ className = '', ...p }) => (
    <svg {...base} className={`lucide-icon lucide-icon--wind ${className}`} {...p}>
      <path d="M17.7 7.7a2.5 2.5 0 1 1 1.8 4.3H2" />
      <path d="M9.6 4.6A2 2 0 1 1 11 8H2" />
      <path d="M12.6 19.4A2 2 0 1 0 14 16H2" />
    </svg>
  ),
  Droplets: ({ className = '', ...p }) => (
    <svg {...base} className={`lucide-icon lucide-icon--droplets ${className}`} {...p}>
      <path d="M7 16.3c2.2 0 4-1.83 4-4.05 0-1.16-.57-2.26-1.71-3.19S7.29 6.75 7 5.3c-.29 1.45-1.14 2.84-2.29 3.76S3 11.1 3 12.25c0 2.22 1.8 4.05 4 4.05z" />
      <path d="M12.56 6.6A10.97 10.97 0 0 0 14 3.02c.5 2.5 2 4.9 4 6.5s3 3.5 3 5.5a6.98 6.98 0 0 1-11.91 4.97" />
    </svg>
  ),
  Library: ({ className = '', ...p }) => (
    <svg {...base} className={`lucide-icon lucide-icon--library ${className}`} {...p}>
      <path d="m16 6 4 14" />
      <path d="M12 6v14" />
      <path d="M8 8v12" />
      <path d="M4 4v16" />
    </svg>
  ),
  Check: ({ className = '', ...p }) => (
    <svg {...base} className={`lucide-icon lucide-icon--check ${className}`} {...p}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
  Droplet: ({ className = '', ...p }) => (
    <svg {...base} className={`lucide-icon lucide-icon--droplet ${className}`} {...p}>
      <path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z" />
    </svg>
  ),
  HeartCrack: ({ className = '', ...p }) => (
    <svg {...base} className={`lucide-icon lucide-icon--heart-crack ${className}`} {...p}>
      <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
      <path d="m12 13-1-1 2-2-3-3 2-2" />
    </svg>
  ),
  Flame: ({ className = '', ...p }) => (
    <svg {...base} className={`lucide-icon lucide-icon--flame ${className}`} {...p}>
      <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
    </svg>
  ),
};

