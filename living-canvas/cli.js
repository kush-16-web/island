#!/usr/bin/env node
'use strict';

const path = require('path');
const { checkEnvironment } = require('./env-check');
const { runLivingCanvasPipeline } = require('./pipeline');
const { buildExhibitionGallery } = require('./gallery');
const { getAllManifests } = require('./store');

// Distinct test songs representing 3 completely different musical and emotional themes
const TEST_SUITE_SONGS = [
  {
    title: 'Midnight Rain',
    artist: 'The Lumineers',
    lyrics: 'Rain pouring down on cold asphalt, standing under the lone streetlight watching reflections shatter as cars pass by in the quiet dark.',
    expectedTheme: 'Melancholic / Solitude / Rain / Midnight',
  },
  {
    title: 'Solar Flare',
    artist: 'Horizon Zero',
    lyrics: 'Break the gravitational pull, ascend through the stratosphere into blinding radiant light, unfolding paper wings into the morning sun.',
    expectedTheme: 'Euphoric / Ascension / Solar / Catharsis',
  },
  {
    title: 'Wooden Porch Echoes',
    artist: 'Iron & Pine',
    lyrics: 'Creaking floorboards and an old six-string with worn frets, family memories carved into the cedar post by the river roots.',
    expectedTheme: 'Nostalgic / Acoustic / Memory / Hearth',
  },
];

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'help';

  if (command === 'check') {
    console.log('\n🔍 Probing Living Canvas Local Environment...');
    const env = await checkEnvironment();
    console.log('----------------------------------------------------');
    console.log(`Platform:      ${env.hardware.platform} (${env.hardware.arch})`);
    console.log(`CPU:           ${env.hardware.cpuModel} (${env.hardware.cpuCores} cores)`);
    console.log(`Memory:        ${env.hardware.freeRamMB} MB free / ${env.hardware.totalRamMB} MB total`);
    console.log(`Node.js:       ${env.hardware.nodeVersion}`);
    console.log('----------------------------------------------------');
    console.log(`Ollama:        ${env.ollama.available ? '✅ Online' : '❌ Offline'} (${env.ollama.error || env.ollama.models?.join(', ') || 'No models'})`);
    console.log(`ComfyUI:       ${env.comfy.available ? '✅ Online' : '❌ Offline'} (${env.comfy.error || 'Running'})`);
    console.log(`Pipeline Mode: [${env.recommendedMode.toUpperCase()}]`);
    console.log(`Notes:         ${env.notes}`);
    console.log('----------------------------------------------------\n');
    return;
  }

  if (command === 'test') {
    console.log('\n🎨 Island Living Canvas: Pass 1 Quality Evaluation Test Suite');
    console.log('===============================================================');
    console.log('Testing 3 distinct song themes with continuous-line editorial poster concepts...\n');

    const env = await checkEnvironment();
    console.log(`⚙️ Operating Mode: ${env.recommendedMode.toUpperCase()} (${env.notes})\n`);

    const results = [];
    for (let i = 0; i < TEST_SUITE_SONGS.length; i++) {
      const song = TEST_SUITE_SONGS[i];
      console.log(`[${i + 1}/3] Processing: "${song.title}" by ${song.artist}`);
      console.log(`    Archetype: ${song.expectedTheme}`);

      const res = await runLivingCanvasPipeline(song, { envInfo: env });
      results.push(res);

      console.log(`    ✅ Metaphor: "${res.concept.central_metaphor}"`);
      console.log(`    🎨 Palette:  ${res.concept.color_palette.background} bg / ${res.concept.color_palette.line_color} line / ${res.concept.color_palette.accent_color} accent`);
      console.log(`    📄 Saved:    ${res.targetDir}`);
      console.log(`    ⏱️ Time:     ${res.durationMs}ms\n`);
    }

    // Verify distinctness across the 3 outputs
    const themes = results.map((r) => r.concept.emotional_theme);
    const metaphors = results.map((r) => r.concept.central_metaphor);
    const bgs = results.map((r) => r.concept.color_palette.background);

    const uniqueThemes = new Set(themes).size;
    const uniqueMetaphors = new Set(metaphors).size;
    const uniqueBgs = new Set(bgs).size;

    console.log('===============================================================');
    console.log('📊 Diversity & Distinctness Verification:');
    console.log(`  - Unique Emotional Themes:    ${uniqueThemes} / 3`);
    console.log(`  - Unique Central Metaphors:   ${uniqueMetaphors} / 3`);
    console.log(`  - Distinct Color Palettes:    ${uniqueBgs} / 3`);
    console.log('===============================================================');
    console.log(`🖼️ Exhibition Gallery compiled at:`);
    console.log(`   file:///${results[0].galleryPath.replace(/\\/g, '/')}\n`);
    return;
  }

  if (command === 'run') {
    const titleIdx = args.indexOf('--title');
    const artistIdx = args.indexOf('--artist');
    const lyricsIdx = args.indexOf('--lyrics');

    const title = titleIdx !== -1 ? args[titleIdx + 1] : 'Sample Track';
    const artist = artistIdx !== -1 ? args[artistIdx + 1] : 'Sample Artist';
    const lyrics = lyricsIdx !== -1 ? args[lyricsIdx + 1] : '';

    console.log(`\n🎨 Running Living Canvas for: "${title}" by ${artist}...`);
    const env = await checkEnvironment();
    const res = await runLivingCanvasPipeline({ title, artist, lyrics }, { envInfo: env });

    console.log(`\n✅ Generated Concept:`);
    console.log(`   Theme:    ${res.concept.emotional_theme}`);
    console.log(`   Metaphor: "${res.concept.central_metaphor}"`);
    console.log(`   Subject:  ${res.concept.main_visual_subject}`);
    console.log(`   Palette:  ${res.concept.color_palette.mood_description}`);
    console.log(`\n📁 Saved to: ${res.targetDir}`);
    console.log(`🖼️ Gallery:  file:///${res.galleryPath.replace(/\\/g, '/')}\n`);
    return;
  }

  if (command === 'gallery') {
    const galleryPath = buildExhibitionGallery();
    console.log(`\n🖼️ Exhibition Gallery refreshed: file:///${galleryPath.replace(/\\/g, '/')}\n`);
    return;
  }

  console.log(`
Island Living Canvas — Local Prototype CLI
Usage:
  node living-canvas/cli.js check                 Check local Ollama, ComfyUI & hardware
  node living-canvas/cli.js test                  Run 3-song quality evaluation suite
  node living-canvas/cli.js run --title "..."     Generate concept for custom song
  node living-canvas/cli.js gallery               Rebuild HTML exhibition gallery
`);
}

main().catch((err) => {
  console.error('\n❌ Error in Living Canvas CLI:', err);
  process.exit(1);
});
