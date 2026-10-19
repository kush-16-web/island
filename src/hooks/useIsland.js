import { useEffect, useMemo, useReducer } from 'react';
import { island } from '../lib/bridge';

const initial = {
  ready: false,
  schedule: [],
  inbox: [],
  media: { active: false },
  platform: '',
  port: 47823,
  hotkey: 'Ctrl+Alt+Space',
  toast: null,
  rings: [],
};

function reducer(state, action) {
  switch (action.type) {
    case 'init':
      return { ...state, ...action.payload, ready: true };
    case 'schedule':
      return { ...state, schedule: action.payload };
    case 'inbox':
      return { ...state, inbox: action.payload };
    case 'media':
      return { ...state, media: action.payload };
    case 'toast':
      return { ...state, toast: action.payload };
    case 'toast-clear':
      return state.toast && state.toast.id === action.id ? { ...state, toast: null } : state;
    case 'toast-drop':
      return state.toast ? { ...state, toast: null } : state;
    case 'ring':
      return { ...state, rings: [...state.rings, action.payload] };
    case 'ring-dismiss':
      return { ...state, rings: state.rings.filter((r) => r.key !== action.key) };
    default:
      return state;
  }
}

export function useIsland() {
  const [state, dispatch] = useReducer(reducer, initial);

  useEffect(() => {
    let alive = true;
    island.getState().then((s) => {
      if (!alive) return;
      dispatch({
        type: 'init',
        payload: {
          schedule: s.schedule,
          inbox: s.inbox,
          media: s.media,
          platform: s.platform,
          port: s.port,
          hotkey: s.hotkey,
        },
      });
    });
    const offs = [
      island.on('scheduler:state', (payload) => dispatch({ type: 'schedule', payload })),
      island.on('inbox:state', (payload) => dispatch({ type: 'inbox', payload })),
      island.on('media', (payload) => dispatch({ type: 'media', payload })),
      island.on('notification', (payload) => dispatch({ type: 'toast', payload })),
      island.on('ring', (payload) =>
        dispatch({ type: 'ring', payload: { ...payload, key: `${payload.item.id}-${Date.now()}` } }),
      ),
    ];
    return () => {
      alive = false;
      offs.forEach((off) => off());
    };
  }, []);

  const actions = useMemo(
    () => ({
      clearToast: (id) => dispatch({ type: 'toast-clear', id }),
      dropToast: () => dispatch({ type: 'toast-drop' }),
      dismissRing: (key) => dispatch({ type: 'ring-dismiss', key }),
      snoozeRing: async (ring) => {
        const { item, kind } = ring;
        if (kind === 'alarm') await island.scheduler.snooze({ label: item.label, minutes: 5 });
        else await island.scheduler.addTimer({ durationMs: 60000, label: item.label });
        dispatch({ type: 'ring-dismiss', key: ring.key });
      },
      markRead: () => island.inbox.markRead(),
      clearInbox: () => island.inbox.clear(),
      removeNote: (id) => island.inbox.remove(id),
      mediaControl: (action) => island.media.control(action),
    }),
    [],
  );

  return { state, actions };
}
