#!/usr/bin/env node
'use strict';

const path = require('path');
const { checkEnvironment } = require('./env-check');
const { discoverLocalCheckpoints } = require('./comfy-adapter');
const { runLivingCanvasPipeline } = require('./pipeline');
const { buildExhibitionGallery } = require('./gallery');

// 3 distinct song archetypes for quality validation
const VALIDATION_SONGS = [
  {
    title: 'Midnight Rain',
    artist: 'The Lumineers',
    lyrics: 'Rain pouring down on cold asphalt, standing under the lone streetlight watching reflections shatter as cars pass by in the quiet dark.',
    archetype: 'Melancholic / Solitude / Rain / Midnight',
  },
  {
    title: 'Solar Flare',
    artist: 'Horizon Zero',
    lyrics: 'Break the gravitational pull, ascend through the stratosphere into blinding radiant light, unfolding paper wings into the morning sun.',
    archetype: 'Euphoric / Ascension / Solar / Catharsis',
  },
  {
    title: 'Wooden Porch Echoes',
    artist: 'Iron & Pine',
    lyrics: 'Creaking floorboards and an old six-string with worn frets, family memories carved into the cedar post by the river roots.',
    archetype: 'Nostalgic / Acoustic / Memory / Hearth',
  },
];

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'help';

  if (command === 'check') {
    console.log('\n🔍 Probing Living Canvas Local Environment & ComfyUI Checkpoints...');
    const env = await checkEnvironment();
    const discovery = await discoverLocalCheckpoints(env.comfy?.endpoint);

    console.log('----------------------------------------------------');
    console.log(`Platform:      ${env.hardware.platform} (${env.hardware.arch})`);
    console.log(`CPU:           ${env.hardware.cpuModel} (${env.hardware.cpuCores} cores)`);
    console.log(`Memory:        ${env.hardware.freeRamMB} MB free / ${env.hardware.totalRamMB} MB total`);
    console.log(`Node.js:       ${env.hardware.nodeVersion}`);
    console.log('----------------------------------------------------');
    console.log(`Ollama:        ${env.ollama.available ? '✅ Online' : '❌ Offline'} (${env.ollama.error || env.ollama.models?.join(', ') || 'No models'})`);
    console.log(`ComfyUI:       ${env.comfy.available ? '✅ Online' : '❌ Offline'} (${env.comfy.error || 'Running'})`);
    console.log(`Checkpoints:   ${discovery.checkpoints.length > 0 ? discovery.checkpoints.join(', ') : 'None detected locally'}`);
    console.log(`Recommended:   ${env.comfy.available && discovery.checkpoints.length > 0 ? '[LIVE INFERENCE]' : '[WORKFLOW VALIDATION]'}`);
    console.log('----------------------------------------------------\n');
    return;
  }

  if (command === 'validate' || command === 'test') {
    console.log('\n🎨 Living Canvas — Pass 2 Quality Validation Suite');
    console.log('================================================================');
    console.log('Validating prompt quality, composition distinctiveness, and portable');
    console.log('ComfyUI SDXL workflows across 3 distinct song archetypes...\n');

    const env = await checkEnvironment();
    const results = [];

    for (let i = 0; i < VALIDATION_SONGS.length; i++) {
      const song = VALIDATION_SONGS[i];
      console.log(`[${i + 1}/3] Song: "${song.title}" by ${song.artist}`);
      console.log(`    Archetype: ${song.archetype}`);

      const res = await runLivingCanvasPipeline(song, { envInfo: env });
      results.push(res);

      const q = res.qualityReport;
      console.log(`    ✅ Metaphor: "${res.concept.central_metaphor}"`);
      console.log(`    📊 Quality Score: ${q?.totalScore || 0}/100 (${q?.passed ? 'PASSED' : 'NEEDS WORK'})`);
      if (q?.criteria) {
        q.criteria.forEach((c) => {
          console.log(`       - ${c.title}: ${c.score}/${c.weight} ${c.passed ? '✓' : '⚠'}`);
        });
      }
      console.log(`    📦 Workflow File: ${path.join(res.targetDir, 'workflow.json')}`);
      console.log(`    ⏱️ Duration: ${res.durationMs}ms\n`);
    }

    // Verify diversity and non-repetition across concepts
    const themes = results.map((r) => r.concept.emotional_theme);
    const metaphors = results.map((r) => r.concept.central_metaphor);
    const subjects = results.map((r) => r.concept.main_visual_subject);
    const compositions = results.map((r) => r.concept.composition);

    const uniqueThemes = new Set(themes).size;
    const uniqueMetaphors = new Set(metaphors).size;
    const uniqueSubjects = new Set(subjects).size;
    const uniqueCompositions = new Set(compositions).size;

    console.log('================================================================');
    console.log('📋 Concept Diversity Verification:');
    console.log(`  - Unique Emotional Themes:      ${uniqueThemes} / 3`);
    console.log(`  - Unique Central Metaphors:     ${uniqueMetaphors} / 3`);
    console.log(`  - Unique Primary Subjects:      ${uniqueSubjects} / 3`);
    console.log(`  - Distinct Spatial Layouts:     ${uniqueCompositions} / 3`);
    console.log('================================================================');
    console.log(`🖼️ Exhibition Gallery compiled at:`);
    console.log(`   file:///${results[0].galleryPath.replace(/\\/g, '/')}\n`);
    return;
  }

  if (command === 'generate') {
    console.log('\n🚀 Attempting Real ComfyUI Artwork Generation...');
    const env = await checkEnvironment();
    const discovery = await discoverLocalCheckpoints(env.comfy?.endpoint);

    if (!discovery.available || discovery.checkpoints.length === 0) {
      console.log('❌ ComfyUI is offline or no local model checkpoint was detected.');
      console.log('   Please see living-canvas/OFFICE_PC_SETUP.md for GPU machine setup.');
      console.log('   Stopping at workflow validation as per Pass 2 requirements.\n');
      return;
    }

    console.log(`✅ ComfyUI detected with checkpoint: ${discovery.checkpoints[0]}`);
    console.log('Generating artwork for validation songs...');
    for (const song of VALIDATION_SONGS) {
      console.log(`Queuing: ${song.title}...`);
      await runLivingCanvasPipeline(song, { envInfo: env });
    }
    console.log('Generation completed.\n');
    return;
  }

  if (command === 'run') {
    const titleIdx = args.indexOf('--title');
    const artistIdx = args.indexOf('--artist');
    const lyricsIdx = args.indexOf('--lyrics');

    const title = titleIdx !== -1 ? args[titleIdx + 1] : 'Sample Track';
    const artist = artistIdx !== -1 ? args[artistIdx + 1] : 'Sample Artist';
    const lyrics = lyricsIdx !== -1 ? args[lyricsIdx + 1] : '';

    console.log(`\n🎨 Running Living Canvas Pass 2 for: "${title}" by ${artist}...`);
    const env = await checkEnvironment();
    const res = await runLivingCanvasPipeline({ title, artist, lyrics }, { envInfo: env });

    console.log(`\n✅ Validated Concept:`);
    console.log(`   Theme:    ${res.concept.emotional_theme}`);
    console.log(`   Metaphor: "${res.concept.central_metaphor}"`);
    console.log(`   Score:    ${res.qualityReport?.totalScore}/100`);
    console.log(`\n📁 Output:   ${res.targetDir}`);
    console.log(`🖼️ Gallery:  file:///${res.galleryPath.replace(/\\/g, '/')}\n`);
    return;
  }

  if (command === 'gallery') {
    const galleryPath = buildExhibitionGallery();
    console.log(`\n🖼️ Exhibition Gallery refreshed: file:///${galleryPath.replace(/\\/g, '/')}\n`);
    return;
  }

  console.log(`
Living Canvas (Pass 2) — CLI
Usage:
  node living-canvas/cli.js check                 Probe hardware & discover ComfyUI checkpoints
  node living-canvas/cli.js validate              Run Pass 2 quality validation on 3 song archetypes
  node living-canvas/cli.js generate              Run live ComfyUI generation (requires GPU & checkpoint)
  node living-canvas/cli.js run --title "..."     Validate workflow for custom song
  node living-canvas/cli.js gallery               Rebuild HTML gallery
`);
}

main().catch((err) => {
  console.error('\n❌ Error in Living Canvas CLI:', err);
  process.exit(1);
});
