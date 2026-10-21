'use strict';

const fs = require('fs');
const path = require('path');
const config = require('./config');

/**
 * Sanitizes title and artist into a clean directory slug
 */
function createSongSlug(title = 'untitled', artist = 'artist') {
  const clean = (str) =>
    str
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'track';

  return `${clean(artist)}_${clean(title)}`;
}

/**
 * Ensures directory exists
 */
function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * Saves a living canvas result or validation artifact to disk.
 */
function saveResult(songMeta, concept, generationResult, envInfo = {}) {
  const slug = createSongSlug(songMeta.title, songMeta.artist);
  const targetDir = path.join(config.outputDir, slug);
  ensureDir(targetDir);

  const timestamp = new Date().toISOString();

  // 1. Save Structured Visual Concept
  const conceptFile = path.join(targetDir, 'concept.json');
  fs.writeFileSync(conceptFile, JSON.stringify(concept, null, 2), 'utf8');

  // 2. Save Prompt Specs
  const promptPayload = {
    song: songMeta,
    prompts: generationResult.prompts,
    createdAt: timestamp,
  };
  const promptFile = path.join(targetDir, 'prompt.json');
  fs.writeFileSync(promptFile, JSON.stringify(promptPayload, null, 2), 'utf8');

  // 3. Save Standalone Portable ComfyUI Workflow JSON
  const workflowFile = path.join(targetDir, 'workflow.json');
  if (generationResult.workflow) {
    fs.writeFileSync(workflowFile, JSON.stringify(generationResult.workflow, null, 2), 'utf8');
  }

  // 4. Save Quality Evaluation Report
  if (generationResult.qualityReport) {
    const evalFile = path.join(targetDir, 'evaluation.json');
    fs.writeFileSync(evalFile, JSON.stringify(generationResult.qualityReport, null, 2), 'utf8');
  }

  // 5. Save Artwork File (Only if genuine raster PNG buffer was generated)
  let artworkFilename = null;
  if (generationResult.format === 'png' && generationResult.buffer) {
    artworkFilename = 'artwork.png';
    fs.writeFileSync(path.join(targetDir, artworkFilename), generationResult.buffer);
  } else if (generationResult.placeholderContent) {
    artworkFilename = 'placeholder.svg';
    fs.writeFileSync(path.join(targetDir, artworkFilename), generationResult.placeholderContent, 'utf8');
  }

  // 6. Save Run Manifest
  const manifest = {
    slug,
    song: songMeta,
    createdAt: timestamp,
    status: generationResult.status || 'workflow_validated',
    generator: {
      status: generationResult.status || 'workflow_validated',
      format: generationResult.format || 'workflow_json',
      source: concept.source || 'interpreter',
      model: concept.model || 'rule-based-art-director',
      checkpoint: generationResult.checkpoint || 'none',
      notes: generationResult.notes || null,
    },
    qualityScore: generationResult.qualityReport?.totalScore || null,
    files: {
      concept: 'concept.json',
      prompt: 'prompt.json',
      workflow: 'workflow.json',
      evaluation: generationResult.qualityReport ? 'evaluation.json' : null,
      artwork: artworkFilename,
    },
    hardware: envInfo.hardware || null,
  };

  const manifestFile = path.join(targetDir, 'manifest.json');
  fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2), 'utf8');

  // 7. Update Master Manifests Catalog
  updateMasterManifest(manifest);

  return {
    slug,
    targetDir,
    manifest,
  };
}

/**
 * Updates root master manifests index
 */
function updateMasterManifest(newManifest) {
  ensureDir(config.outputDir);
  const masterFile = path.join(config.outputDir, 'manifests.json');
  let list = [];
  if (fs.existsSync(masterFile)) {
    try {
      list = JSON.parse(fs.readFileSync(masterFile, 'utf8'));
      if (!Array.isArray(list)) list = [];
    } catch {
      list = [];
    }
  }

  const idx = list.findIndex((m) => m.slug === newManifest.slug);
  if (idx >= 0) {
    list[idx] = newManifest;
  } else {
    list.push(newManifest);
  }

  fs.writeFileSync(masterFile, JSON.stringify(list, null, 2), 'utf8');
}

/**
 * Reads all stored manifests
 */
function getAllManifests() {
  const masterFile = path.join(config.outputDir, 'manifests.json');
  if (!fs.existsSync(masterFile)) return [];
  try {
    const list = JSON.parse(fs.readFileSync(masterFile, 'utf8'));
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

module.exports = {
  createSongSlug,
  saveResult,
  getAllManifests,
};
