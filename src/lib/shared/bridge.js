import { createMockIsland } from './mockIsland';

// Inside Electron, preload.js provides window.island. In a plain browser tab (npm run dev:web)
// we fall back to an in-memory mock so the UI can be designed without launching the desktop app.
export const isMock = typeof window === 'undefined' || !window.island;
export const island = isMock ? createMockIsland() : window.island;
if (typeof window !== 'undefined' && !window.island) {
  window.island = island;
}
