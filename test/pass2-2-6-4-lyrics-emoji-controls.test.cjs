const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  getTrackLyricsPresentation,
  resolveLyricsMode,
  LYRICS_STYLES,
} = require('../src/lib/lyrics-style-engine.js');

test('Pass 2.2.7.6.1: Verified Emoji Asset Removal & Clean Two-Mode Policy', async (t) => {
  await t.test('public/emojis directory and emoji PNG assets do not exist', () => {
    const emojisDir = path.resolve(__dirname, '../public/emojis');
    assert.strictEqual(fs.existsSync(emojisDir), false, 'public/emojis directory must not exist');
  });

  await t.test('lyrics-style-engine does not export getAppleEmojiUrl or APPLE_EMOJIS', () => {
    const engine = require('../src/lib/lyrics-style-engine.js');
    assert.strictEqual(engine.getAppleEmojiUrl, undefined, 'getAppleEmojiUrl should be removed');
    assert.strictEqual(engine.APPLE_EMOJIS, undefined, 'APPLE_EMOJIS should be removed');
  });

  await t.test('Classic and Kinetic styles are supported without emoji paths', () => {
    assert.deepEqual(Object.values(LYRICS_STYLES), ['classic', 'kinetic']);
  });
});

test('Pass 2.2.7.6.1: Lyrics presentation & lyric mode resolution', async (t) => {
  await t.test('legacy expressive input falls back cleanly to classic presentation', () => {
    const lines = [
      { text: "I can't sleep until I feel your touch" },
      { text: "When I'm like this, you're the one I trust" },
      { text: "I said, ooh, I'm blinded by the lights" },
    ];
    // Passing legacy 'expressive' produces clean Classic presentation
    const pres = getTrackLyricsPresentation(lines, 'blinding-lights', 'expressive');

    assert.ok(Array.isArray(pres), 'presentation should be an array');
    assert.strictEqual(pres.length, 3);
    for (const p of pres) {
      assert.strictEqual(p.style, LYRICS_STYLES.CLASSIC);
      assert.strictEqual(p.inlineIcon, undefined);
      assert.strictEqual(p.emojiAccent, undefined);
    }
  });

  await t.test('resolves lyric modes (off, precision, full)', () => {
    assert.strictEqual(resolveLyricsMode('off'), 'off');
    assert.strictEqual(resolveLyricsMode('precision'), 'precision');
    assert.strictEqual(resolveLyricsMode('full'), 'full');
    assert.strictEqual(resolveLyricsMode('unknown'), 'precision');
  });
});
