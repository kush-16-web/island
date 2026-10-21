'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const { generateDeterministicMockConcept } = require('../living-canvas/interpreter');
const { buildEditorialPrompts } = require('../living-canvas/prompt-engine');
const { evaluateConceptQuality, QUALITY_CRITERIA } = require('../living-canvas/evaluator');
const { createPortableWorkflow, validateWorkflowStructure } = require('../living-canvas/comfy-adapter');
const { runLivingCanvasPipeline } = require('../living-canvas/pipeline');

test('Pass 2: Prompt Engine constructs weighted visual anchors without prefix clutter', () => {
  const concept = generateDeterministicMockConcept({
    title: 'Midnight Rain',
    artist: 'The Lumineers',
  });

  const prompts = buildEditorialPrompts(concept);

  // Must not have label prefixes like "subject:" or "central metaphor:" at start of positive prompt
  assert.ok(!prompts.positivePrompt.startsWith('subject:'));
  assert.ok(!prompts.positivePrompt.includes('central metaphor:'));

  // Must contain weighted primary subject
  assert.ok(prompts.positivePrompt.includes(':1.25)'));

  // Must include negative space and editorial art medium keywords
  assert.ok(prompts.positivePrompt.includes('editorial art poster'));
  assert.ok(prompts.positivePrompt.includes('negative space'));

  // Negative prompt must explicitly forbid 3D, CGI, clutter, and broken lines
  assert.ok(prompts.negativePrompt.includes('3d render'));
  assert.ok(prompts.negativePrompt.includes('broken scratchy lines'));
  assert.ok(prompts.negativePrompt.includes('clutter'));
});

test('Pass 2: Quality Evaluation Checklist accurately scores concept criteria', () => {
  const concept = generateDeterministicMockConcept({
    title: 'Wooden Porch Echoes',
    artist: 'Iron & Pine',
  });
  const prompts = buildEditorialPrompts(concept);

  const report = evaluateConceptQuality(concept, prompts);

  assert.equal(report.maxScore, 100);
  assert.ok(report.totalScore >= 75, `Total score ${report.totalScore} should meet threshold 75`);
  assert.equal(report.criteria.length, 5);

  const ids = report.criteria.map((c) => c.id);
  assert.ok(ids.includes('subject_recognition'));
  assert.ok(ids.includes('metaphor_communication'));
  assert.ok(ids.includes('emotional_resonance'));
  assert.ok(ids.includes('expressive_linework'));
  assert.ok(ids.includes('compositional_distinctiveness'));
});

test('Pass 2: ComfyUI Portable Workflow produces valid SDXL graph topology', () => {
  const workflow = createPortableWorkflow('positive test', 'negative test', {
    architecture: 'sdxl',
    checkpoint: 'sd_xl_base_1.0.safetensors',
  });

  assert.doesNotThrow(() => validateWorkflowStructure(workflow));

  const nodes = workflow.prompt;
  assert.equal(nodes['5'].inputs.width, 832);
  assert.equal(nodes['5'].inputs.height, 1216);
  assert.equal(nodes['4'].inputs.ckpt_name, 'sd_xl_base_1.0.safetensors');
  assert.equal(nodes['6'].inputs.text, 'positive test');
  assert.equal(nodes['7'].inputs.text, 'negative test');
});

test('Pass 2: Concept Diversity guarantees distinct visual compositions across songs', () => {
  const s1 = generateDeterministicMockConcept({ title: 'Midnight Rain' });
  const s2 = generateDeterministicMockConcept({ title: 'Solar Flare' });
  const s3 = generateDeterministicMockConcept({ title: 'Wooden Porch' });

  // Verify non-identical subjects
  assert.notEqual(s1.main_visual_subject, s2.main_visual_subject);
  assert.notEqual(s2.main_visual_subject, s3.main_visual_subject);

  // Verify non-identical compositions
  assert.notEqual(s1.composition, s2.composition);
  assert.notEqual(s2.composition, s3.composition);

  // Verify distinct color backgrounds
  assert.notEqual(s1.color_palette.background, s2.color_palette.background);
  assert.notEqual(s2.color_palette.background, s3.color_palette.background);
});

test('Pass 2: Pipeline stops cleanly at Workflow Validation when GPU worker is offline', async () => {
  const song = {
    title: 'Silent Northern Aurora',
    artist: 'Fjord Lights',
  };

  const result = await runLivingCanvasPipeline(song);

  assert.ok(result.ok);
  assert.equal(result.status, 'workflow_validated');

  // Must have generated workflow.json and evaluation.json
  assert.ok(fs.existsSync(path.join(result.targetDir, 'workflow.json')));
  assert.ok(fs.existsSync(path.join(result.targetDir, 'evaluation.json')));
  assert.ok(fs.existsSync(path.join(result.targetDir, 'concept.json')));
  assert.ok(fs.existsSync(path.join(result.targetDir, 'prompt.json')));

  // Must NOT claim fake AI raster generation
  assert.equal(result.manifest.generator.status, 'workflow_validated');
});
