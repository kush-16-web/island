'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const { checkEnvironment } = require('../living-canvas/env-check');
const {
  validateConcept,
  generateDeterministicMockConcept,
  interpretSong,
} = require('../living-canvas/interpreter');
const {
  buildPromptsFromConcept,
  createComfyWorkflow,
  generateArtwork,
} = require('../living-canvas/comfy-adapter');
const { runLivingCanvasPipeline } = require('../living-canvas/pipeline');

test('Living Canvas Environment Check: probes system without crashing or external requests', async () => {
  const env = await checkEnvironment();
  assert.ok(env.hardware, 'hardware profile should be detected');
  assert.ok(env.hardware.cpuModel, 'CPU model should be detected');
  assert.ok(env.hardware.totalRamMB > 0, 'Total RAM should be detected');
  assert.ok(typeof env.ollama.available === 'boolean', 'Ollama availability must be boolean');
  assert.ok(typeof env.comfy.available === 'boolean', 'ComfyUI availability must be boolean');
  assert.ok(['live', 'mock'].includes(env.recommendedMode), 'Mode must be live or mock');
});

test('Living Canvas Schema Validation: validates required continuous-line editorial poster fields', () => {
  const mockConcept = generateDeterministicMockConcept({
    title: 'Rain on Pavement',
    artist: 'Solitary Artist',
    lyrics: 'Midnight raindrops falling in the street',
  });

  assert.doesNotThrow(() => validateConcept(mockConcept));
  assert.ok(mockConcept.emotional_theme.length > 10);
  assert.ok(mockConcept.central_metaphor.length > 10);
  assert.ok(mockConcept.main_visual_subject.length > 10);
  assert.ok(Array.isArray(mockConcept.supporting_symbols) && mockConcept.supporting_symbols.length > 0);
  assert.ok(mockConcept.color_palette.background.startsWith('#'));
  assert.ok(mockConcept.color_palette.line_color.startsWith('#'));
  assert.ok(mockConcept.color_palette.accent_color.startsWith('#'));
  assert.ok(mockConcept.continuous_line_instructions.length > 20);
  assert.ok(mockConcept.negative_prompt.length > 20);
});

test('Living Canvas Diversity: different song themes generate genuinely distinct visual concepts', () => {
  const song1 = generateDeterministicMockConcept({ title: 'Midnight Rain', artist: 'Artist A' });
  const song2 = generateDeterministicMockConcept({ title: 'Solar Flare', artist: 'Artist B' });
  const song3 = generateDeterministicMockConcept({ title: 'Wooden Porch', artist: 'Artist C' });

  // Verify none share the same metaphor
  assert.notEqual(song1.central_metaphor, song2.central_metaphor);
  assert.notEqual(song2.central_metaphor, song3.central_metaphor);
  assert.notEqual(song1.central_metaphor, song3.central_metaphor);

  // Verify none share the same background color
  assert.notEqual(song1.color_palette.background, song2.color_palette.background);
  assert.notEqual(song2.color_palette.background, song3.color_palette.background);
  assert.notEqual(song1.color_palette.background, song3.color_palette.background);

  // Verify continuous line instructions differ
  assert.notEqual(song1.continuous_line_instructions, song2.continuous_line_instructions);
  assert.notEqual(song2.continuous_line_instructions, song3.continuous_line_instructions);
});

test('Living Canvas ComfyUI Adapter: constructs valid workflow graph and positive/negative prompts', () => {
  const concept = generateDeterministicMockConcept({ title: 'Solar Flare' });
  const prompts = buildPromptsFromConcept(concept);

  assert.ok(prompts.positivePrompt.includes('continuous-line'));
  assert.ok(prompts.positivePrompt.includes(concept.central_metaphor));
  assert.ok(prompts.negativePrompt.includes('photorealism'));

  const workflow = createComfyWorkflow(prompts.positivePrompt, prompts.negativePrompt);
  assert.ok(workflow.prompt['3'], 'KSampler node exists');
  assert.ok(workflow.prompt['6'], 'CLIP positive text encode exists');
  assert.equal(workflow.prompt['6'].inputs.text, prompts.positivePrompt);
  assert.equal(workflow.prompt['7'].inputs.text, prompts.negativePrompt);
});

test('Living Canvas Pipeline E2E: generates offline vector poster and manifest', async () => {
  const song = {
    title: 'Test Melody',
    artist: 'Test Ensemble',
    lyrics: 'A quiet echo in the empty hall',
  };

  const result = await runLivingCanvasPipeline(song, { forceMock: true });

  assert.ok(result.ok);
  assert.ok(fs.existsSync(path.join(result.targetDir, 'concept.json')));
  assert.ok(fs.existsSync(path.join(result.targetDir, 'prompt.json')));
  assert.ok(fs.existsSync(path.join(result.targetDir, 'artwork.svg')));
  assert.ok(fs.existsSync(path.join(result.targetDir, 'manifest.json')));
  assert.ok(fs.existsSync(result.galleryPath));
});
