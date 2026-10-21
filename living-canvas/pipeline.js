'use strict';

const { checkEnvironment } = require('./env-check');
const { interpretSong } = require('./interpreter');
const { processComfyUIGeneration } = require('./comfy-adapter');
const { saveResult } = require('./store');
const { buildExhibitionGallery } = require('./gallery');

/**
 * End-to-end execution of Living Canvas pipeline for a single song.
 * 
 * Supports two operational modes:
 * 1. 'validate' (Default when ComfyUI is offline):
 *    Interprets concept, compiles improved prompts, generates portable workflow.json,
 *    runs quality evaluation checklist, and stops cleanly at workflow validation without
 *    generating repetitive mock curves.
 * 2. 'generate' (When ComfyUI is online with an installed checkpoint):
 *    Executes local GPU inference and saves actual AI generated PNG raster.
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

  // 3. Process ComfyUI generation or workflow validation
  const generationResult = await processComfyUIGeneration(songMeta, concept, {
    comfyUrl: options.comfyUrl,
    checkpointOverride: options.checkpoint,
  });

  // 4. Save results to local file store
  const saved = saveResult(songMeta, concept, generationResult, envInfo);

  // 5. Update exhibition gallery HTML
  const galleryPath = buildExhibitionGallery();

  const durationMs = Date.now() - startTime;

  return {
    ok: true,
    slug: saved.slug,
    targetDir: saved.targetDir,
    concept,
    prompts: generationResult.prompts,
    workflow: generationResult.workflow,
    qualityReport: generationResult.qualityReport,
    status: generationResult.status,
    checkpoint: generationResult.checkpoint,
    galleryPath,
    durationMs,
    manifest: saved.manifest,
  };
}

module.exports = {
  runLivingCanvasPipeline,
};
