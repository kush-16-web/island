'use strict';

const { checkEnvironment } = require('./env-check');
const { interpretSong } = require('./interpreter');
const { generateArtwork } = require('./comfy-adapter');
const { saveResult } = require('./store');
const { buildExhibitionGallery } = require('./gallery');

/**
 * End-to-end execution of Living Canvas pipeline for a single song
 */
async function runLivingCanvasPipeline(songMeta, options = {}) {
  const startTime = Date.now();

  if (!songMeta || !songMeta.title) {
    throw new Error('Song metadata must include at least "title"');
  }

  // 1. Inspect environment if not supplied
  const envInfo = options.envInfo || (await checkEnvironment());
  const forceMock = options.forceMock ?? (envInfo.recommendedMode === 'mock');

  // 2. Interpret song's emotional core into structured visual concept
  const interpretationResult = await interpretSong(songMeta, {
    forceMock,
    ollamaUrl: options.ollamaUrl,
    model: options.ollamaModel,
  });

  const concept = interpretationResult.concept;

  // 3. Generate artwork via ComfyUI or high-fidelity SVG poster
  const artworkResult = await generateArtwork(songMeta, concept, {
    forceMock,
    comfyUrl: options.comfyUrl,
  });

  // 4. Save results to local file store
  const saved = saveResult(songMeta, concept, artworkResult, envInfo);

  // 5. Update exhibition gallery HTML
  const galleryPath = buildExhibitionGallery();

  const durationMs = Date.now() - startTime;

  return {
    ok: true,
    slug: saved.slug,
    targetDir: saved.targetDir,
    concept,
    prompts: artworkResult.prompts,
    generatorMode: artworkResult.mode,
    galleryPath,
    durationMs,
    manifest: saved.manifest,
  };
}

module.exports = {
  runLivingCanvasPipeline,
};
