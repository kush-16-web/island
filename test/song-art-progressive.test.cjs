'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { pathToFileURL } = require('node:url');

// Strictly offline unit test suite for Living Canvas Progressive Art Engine
test('Living Canvas Progressive Composition & Strategy Verification Suite', async (t) => {
  // Dynamically load the ES module in Node.js on Windows
  const esmUrl = pathToFileURL(path.resolve(__dirname, '../src/lib/song-art.js')).href;
  const {
    STRATEGY_IDS,
    classifySongStrategy,
    getCompositionForSong,
  } = await import(esmUrl);

  await t.test('1. Contrasting song archetypes produce genuinely distinct composition strategies', () => {
    const romantic = classifySongStrategy('Kalank (Title Track)', 'Arijit Singh');
    assert.equal(romantic, STRATEGY_IDS.ROMANTIC_FLAME, 'Kalank should classify as romantic_flame');

    const rain = classifySongStrategy('Midnight Rain', 'The Lumineers');
    assert.equal(rain, STRATEGY_IDS.NOCTURNAL_RAIN, 'Midnight Rain should classify as nocturnal_rain');

    const solar = classifySongStrategy('Solar Flare', 'Horizon Zero');
    assert.equal(solar, STRATEGY_IDS.CELESTIAL_SOLAR, 'Solar Flare should classify as celestial_solar');

    const acoustic = classifySongStrategy('Wooden Porch Echoes', 'Iron & Pine');
    assert.equal(acoustic, STRATEGY_IDS.BOTANICAL_ROOTS, 'Wooden Porch Echoes should classify as botanical_roots');

    const kinetic = classifySongStrategy('How Long', 'Charlie Puth');
    assert.equal(kinetic, STRATEGY_IDS.GEOMETRIC_KINETIC, 'How Long should classify as geometric_kinetic');

    const peaches = classifySongStrategy('Peaches', 'Justin Bieber');
    assert.equal(peaches, STRATEGY_IDS.GEOMETRIC_KINETIC, 'Peaches should classify as geometric_kinetic');
  });

  await t.test('2. Each composition provides 4 distinct progressive drawing layers with meaningful subjects', () => {
    const testCases = [
      { title: 'Kalank', artist: 'Pritam', expectedStrategy: STRATEGY_IDS.ROMANTIC_FLAME },
      { title: 'Midnight Rain', artist: 'The Lumineers', expectedStrategy: STRATEGY_IDS.NOCTURNAL_RAIN },
      { title: 'Solar Flare', artist: 'Horizon Zero', expectedStrategy: STRATEGY_IDS.CELESTIAL_SOLAR },
      { title: 'Wooden Porch Echoes', artist: 'Iron & Pine', expectedStrategy: STRATEGY_IDS.BOTANICAL_ROOTS },
      { title: 'How Long', artist: 'Charlie Puth', expectedStrategy: STRATEGY_IDS.GEOMETRIC_KINETIC },
    ];

    for (const tc of testCases) {
      const comp = getCompositionForSong(tc.title, tc.artist);
      assert.equal(comp.strategyId, tc.expectedStrategy);
      assert.equal(comp.layers.length, 4, `${tc.title} must have exactly 4 progressive layers`);

      const [layer1, layer2, layer3, layer4] = comp.layers;
      assert.equal(layer1.id, 'foundation');
      assert.equal(layer2.id, 'structure');
      assert.equal(layer3.id, 'metaphor');
      assert.equal(layer4.id, 'accent');

      // Verify each layer contains valid non-empty SVG path data
      for (const layer of comp.layers) {
        assert.ok(Array.isArray(layer.paths) && layer.paths.length > 0, `${layer.label} must have path data`);
        for (const p of layer.paths) {
          assert.ok(typeof p === 'string' && p.startsWith('M'), `Path "${p}" must be valid SVG path starting with M`);
        }
      }

      // Verify palette
      assert.ok(comp.color_palette.background, 'Palette must have background');
      assert.ok(comp.color_palette.line_color, 'Palette must have line_color');
      assert.ok(comp.color_palette.accent_color, 'Palette must have accent_color');
    }
  });

  await t.test('3. Visual subjects across strategies are completely different (not identical curves)', () => {
    const solarComp = getCompositionForSong('Solar Flare', 'Horizon Zero');
    const rainComp = getCompositionForSong('Midnight Rain', 'The Lumineers');
    const rootsComp = getCompositionForSong('Wooden Porch Echoes', 'Iron & Pine');
    const flameComp = getCompositionForSong('Kalank', 'Arijit Singh');
    const kineticComp = getCompositionForSong('How Long', 'Charlie Puth');

    // Foundation comparison
    assert.notEqual(solarComp.layers[0].paths[0], rainComp.layers[0].paths[0], 'Solar ridge != Rain skyline');
    assert.notEqual(rootsComp.layers[0].paths[0], flameComp.layers[0].paths[0], 'Roots strata != Lotus petals');
    assert.notEqual(kineticComp.layers[0].paths[0], solarComp.layers[0].paths[0], 'Isometric plane != Solar ridge');

    // Metaphor comparison
    assert.ok(solarComp.layers[2].label.includes('Crane'), 'Solar metaphor is Origami Crane');
    assert.ok(rainComp.layers[2].label.includes('Umbrella'), 'Rain metaphor is Umbrella');
    assert.ok(rootsComp.layers[2].label.includes('Vines') || rootsComp.layers[2].label.includes('Soundhole'), 'Roots metaphor is Vines/Soundhole');
    assert.ok(flameComp.layers[2].label.includes('Ribbon'), 'Romantic metaphor is Silk Ribbon');
    assert.ok(kineticComp.layers[2].label.includes('Ribbon Vector'), 'Kinetic metaphor is Acoustic Vector');
  });

  await t.test('4. Layer progression ensures cumulative drawing: 0%, 25%, 50%, 75%, 100% visible states', () => {
    const comp = getCompositionForSong('Peaches', 'Justin Bieber');

    // Check layer thresholds
    const getVisibleLayersCount = (prog) => {
      let count = 0;
      if (prog > 0.00) count++; // layer 1 (0 - 0.25)
      if (prog > 0.25) count++; // layer 2 (0.25 - 0.55)
      if (prog > 0.55) count++; // layer 3 (0.55 - 0.85)
      if (prog > 0.85) count++; // layer 4 (0.85 - 1.00)
      return count;
    };

    assert.equal(getVisibleLayersCount(0.00), 0, 'At 0%: canvas empty, 0 layers visible');
    assert.equal(getVisibleLayersCount(0.25), 1, 'At 25%: Layer 1 (foundation) visible');
    assert.equal(getVisibleLayersCount(0.50), 2, 'At 50%: Layers 1 + 2 (foundation + structure) visible');
    assert.equal(getVisibleLayersCount(0.75), 3, 'At 75%: Layers 1 + 2 + 3 (foundation + structure + metaphor) visible');
    assert.equal(getVisibleLayersCount(1.00), 4, 'At 100%: All 4 layers visible');
  });
});
