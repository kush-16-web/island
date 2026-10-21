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
 * Saves a living canvas result to disk
 */
function saveResult(songMeta, concept, artworkResult, envInfo = {}) {
  const slug = createSongSlug(songMeta.title, songMeta.artist);
  const targetDir = path.join(config.outputDir, slug);
  ensureDir(targetDir);

  const timestamp = new Date().toISOString();

  // 1. Save Structured Visual Concept
  const conceptFile = path.join(targetDir, 'concept.json');
  fs.writeFileSync(conceptFile, JSON.stringify(concept, null, 2), 'utf8');

  // 2. Save Prompt and Workflow
  const promptPayload = {
    song: songMeta,
    prompts: artworkResult.prompts,
    comfyWorkflow: artworkResult.comfyWorkflow,
    createdAt: timestamp,
  };
  const promptFile = path.join(targetDir, 'prompt.json');
  fs.writeFileSync(promptFile, JSON.stringify(promptPayload, null, 2), 'utf8');

  // 3. Save Artwork File
  let artworkFilename = 'artwork.svg';
  if (artworkResult.format === 'svg' && artworkResult.content) {
    fs.writeFileSync(path.join(targetDir, artworkFilename), artworkResult.content, 'utf8');
  } else if (artworkResult.buffer) {
    artworkFilename = 'artwork.png';
    fs.writeFileSync(path.join(targetDir, artworkFilename), artworkResult.buffer);
  }

  // 4. Save Run Manifest
  const manifest = {
    slug,
    song: songMeta,
    createdAt: timestamp,
    generator: {
      mode: artworkResult.mode,
      format: artworkResult.format,
      source: concept.source || 'interpreter',
      model: concept.model || 'rule-based-art-director',
      fallbackReason: artworkResult.fallbackReason || null,
    },
    files: {
      concept: 'concept.json',
      prompt: 'prompt.json',
      artwork: artworkFilename,
    },
    hardware: envInfo.hardware || null,
  };

  const manifestFile = path.join(targetDir, 'manifest.json');
  fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2), 'utf8');

  // 5. Update Master Manifests Catalog
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

  // Replace existing entry with same slug or push new
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
