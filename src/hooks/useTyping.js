import { useMemo } from 'react';
import { island } from '../lib/bridge';

// The overlay window never takes keyboard focus on its own. While a text field is focused we ask the
// main process to make it focusable, and give focus back to the previous app when the field blurs.
export function useTyping(setTyping) {
  return useMemo(
    () => ({
      onFocus: () => {
        setTyping(true);
        island.setFocusable(true);
      },
      onBlur: () => {
        setTyping(false);
        island.setFocusable(false);
      },
    }),
    [setTyping],
  );
}
