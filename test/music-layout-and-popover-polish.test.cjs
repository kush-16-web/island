const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

describe('Music Layout Polish, Hover Seek Fix & iOS Frosted Glass Popover', () => {
  const root = path.resolve(__dirname, '..');
  const spbCode = fs.readFileSync(path.join(root, 'src/components/SongProgressBar.jsx'), 'utf8');
  const stylesCss = fs.readFileSync(path.join(root, 'src/styles.css'), 'utf8');
  const popoverCode = fs.readFileSync(path.join(root, 'src/components/LyricsSettingsPopover.jsx'), 'utf8');
  const npCode = fs.readFileSync(path.join(root, 'src/components/NowPlaying.jsx'), 'utf8');

  it('1. SongProgressBar: prevents hover seeking by checking isPointerDown and buttons === 1', () => {
    assert.ok(spbCode.includes('isPointerDownRef'), 'Must declare isPointerDownRef');
    assert.ok(spbCode.includes('isPointerDownRef.current = true;'), 'Must set isPointerDownRef on pointer down');
    assert.ok(spbCode.includes('isPointerDownRef.current = false;'), 'Must reset isPointerDownRef on pointer up and cancel');
    assert.ok(
      spbCode.includes('!isPointerDownRef.current') && spbCode.includes('e.buttons !== 1'),
      'handlePointerMove must check both isPointerDownRef and e.buttons !== 1'
    );
  });

  it('2. Expanded Music Container: reclaims top dead space to raise artwork/eyes and uncrop play button', () => {
    assert.ok(
      stylesCss.includes('.hub--music-focus') && stylesCss.includes('.hub:has(.np--two-col)'),
      'Must define hub rules for expanded music'
    );
    assert.ok(
      stylesCss.includes('padding: 8px 14px 12px;'),
      'Must reduce top padding from 12px to 8px'
    );
    assert.ok(
      stylesCss.includes('.hub:has(.np--two-col) .hub__body {\n  margin-top: 0;\n}') ||
      stylesCss.includes('.hub--music-focus .hub__body,\n.hub:has(.np--two-col) .hub__body {\n  margin-top: 0;\n}'),
      'Must remove 10px margin-top on hub__body for expanded music'
    );
  });

  it('3. LyricsSettingsPopover: iOS Liquid Glass Material with dynamic Island color-mix and no hardcoded purple', () => {
    assert.ok(
      stylesCss.includes('backdrop-filter: blur(32px) saturate(200%)'),
      'Popover must use iOS 32px blur with 200% saturation'
    );
    assert.ok(
      !stylesCss.includes('#6366f1'),
      'Must not contain hardcoded purple (#6366f1) fallback'
    );
    assert.ok(
      stylesCss.includes('border-radius: 20px'),
      'Must use 20px continuous iOS corner radius'
    );
    assert.ok(
      stylesCss.includes('inset 0 1px 0 0 rgba(255, 255, 255, 0.22)'),
      'Must include top specular highlight rim'
    );
  });

  it('4. LyricsSettingsPopover Motion & Orientation: iOS spring morph animation from pill button and top placement preference', () => {
    assert.ok(
      popoverCode.includes("type: 'spring', stiffness: 380"),
      'Must use iOS spring with stiffness 380'
    );
    assert.ok(
      popoverCode.includes('scale: 0.18'),
      'Must scale from 0.18 directly out of the pill button anchor'
    );
    assert.ok(
      npCode.includes('preferredPlacement="top"'),
      'NowPlaying must request preferredPlacement="top" for bottom-anchored sliders button'
    );
  });

  it('5. Segmented Glider: smooth sliding pill indicator using layoutId', () => {
    assert.ok(
      popoverCode.includes('layoutId="lsp-active-style-glider"'),
      'Must include sliding layoutId glider for lyrics style'
    );
    assert.ok(
      popoverCode.includes('layoutId="lsp-active-layout-glider"'),
      'Must include sliding layoutId glider for layout'
    );
    assert.ok(
      stylesCss.includes('.lsp__pill-glider'),
      'Must define styles for the sliding pill glider'
    );
  });

  it('6. Apple Music Word Fill: feathered gradient mask on single text element without jagged letter slicing', () => {
    assert.ok(
      stylesCss.includes('calc(var(--word-fill, 0%) + 4px)') || stylesCss.includes('calc(var(--word-fill, 0%) + 14%)'),
      'Must use soft gradient transition zone on active word'
    );
    assert.ok(
      stylesCss.includes('-webkit-background-clip: text') || stylesCss.includes('background-clip: text'),
      'Must use background-clip text for Apple Music style liquid illumination'
    );
  });

  it('7. Window Blur Dismissal: Island dismisses on window:blur without being blocked by open popover', () => {
    const islandCode = fs.readFileSync(path.join(root, 'src/components/Island.jsx'), 'utf8');
    assert.ok(
      !islandCode.includes("window.island?.logLifecycle?.('window:blur:ignored_popover_open')"),
      'Must not ignore window:blur when lyrics settings popover is open'
    );
  });
});

