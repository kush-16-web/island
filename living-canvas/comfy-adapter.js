'use strict';

const config = require('./config');
const { buildEditorialPrompts } = require('./prompt-engine');
const { evaluateConceptQuality } = require('./evaluator');

/**
 * Creates a portable ComfyUI workflow graph.
 * Supports SDXL (832x1216 portrait) or SD1.5 (512x768 portrait).
 */
function createPortableWorkflow(positivePrompt, negativePrompt, options = {}) {
  const isSDXL = options.architecture !== 'sd15';
  const width = options.width || (isSDXL ? 832 : 512);
  const height = options.height || (isSDXL ? 1216 : 768);
  const steps = options.steps || (isSDXL ? 30 : 25);
  const cfg = options.cfg || 7.0;
  const sampler = options.sampler || 'euler_ancestral';
  const scheduler = options.scheduler || 'karras';
  const checkpoint = options.checkpoint || (isSDXL ? 'sd_xl_base_1.0.safetensors' : config.comfy.defaultCheckpoint);
  const seed = options.seed || Math.floor(Math.random() * 1000000000);

  return {
    client_id: 'island-living-canvas',
    prompt: {
      '3': {
        class_type: 'KSampler',
        inputs: {
          cfg,
          denoise: 1,
          latent_image: ['5', 0],
          model: ['4', 0],
          negative: ['7', 0],
          positive: ['6', 0],
          sampler_name: sampler,
          scheduler,
          seed,
          steps,
        },
      },
      '4': {
        class_type: 'CheckpointLoaderSimple',
        inputs: {
          ckpt_name: checkpoint,
        },
      },
      '5': {
        class_type: 'EmptyLatentImage',
        inputs: {
          batch_size: 1,
          height,
          width,
        },
      },
      '6': {
        class_type: 'CLIPTextEncode',
        inputs: {
          clip: ['4', 1],
          text: positivePrompt,
        },
      },
      '7': {
        class_type: 'CLIPTextEncode',
        inputs: {
          clip: ['4', 1],
          text: negativePrompt,
        },
      },
      '8': {
        class_type: 'VAEDecode',
        inputs: {
          samples: ['3', 0],
          vae: ['4', 2],
        },
      },
      '9': {
        class_type: 'SaveImage',
        inputs: {
          filename_prefix: 'LivingCanvas_Pass2',
          images: ['8', 0],
        },
      },
    },
  };
}

/**
 * Probes ComfyUI for locally installed model checkpoints.
 * Never downloads models automatically.
 */
async function discoverLocalCheckpoints(comfyUrl = config.comfy.url, timeoutMs = 3000) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(`${comfyUrl}/object_info/CheckpointLoaderSimple`, { signal: controller.signal });
    clearTimeout(timer);

    if (!res.ok) {
      return { available: false, error: `HTTP ${res.status}`, checkpoints: [] };
    }

    const data = await res.json();
    const list = data?.CheckpointLoaderSimple?.input?.required?.ckpt_name?.[0] || [];
    return {
      available: true,
      checkpoints: Array.isArray(list) ? list : [],
    };
  } catch (err) {
    return { available: false, error: err.message, checkpoints: [] };
  }
}

/**
 * Validates a ComfyUI workflow graph structure.
 */
function validateWorkflowStructure(workflow) {
  if (!workflow || !workflow.prompt) {
    throw new Error('Workflow must contain a root "prompt" graph object');
  }
  const nodes = workflow.prompt;
  const requiredNodeTypes = ['KSampler', 'CheckpointLoaderSimple', 'EmptyLatentImage', 'CLIPTextEncode', 'VAEDecode', 'SaveImage'];
  const presentTypes = Object.values(nodes).map((n) => n.class_type);

  for (const t of requiredNodeTypes) {
    if (!presentTypes.includes(t)) {
      throw new Error(`Workflow graph missing required node type: ${t}`);
    }
  }

  return true;
}

/**
 * Handles artwork generation or workflow validation.
 * 
 * In Pass 2:
 * - If ComfyUI is offline or no checkpoint is loaded:
 *   Stops at Workflow Validation. Generates and validates prompts + workflow JSON.
 *   Does NOT render repetitive mock curves or claim artwork generation.
 * - If ComfyUI is online and has an active checkpoint:
 *   Submits workflow, polls history, and retrieves actual generated PNG raster.
 */
async function processComfyUIGeneration(songMeta, concept, options = {}) {
  const { comfyUrl = config.comfy.url, checkpointOverride } = options;

  // 1. Build improved, un-prefixed editorial prompts
  const prompts = buildEditorialPrompts(concept);

  // 2. Run quality evaluation on concept & prompt
  const qualityReport = evaluateConceptQuality(concept, prompts);

  // 3. Probe ComfyUI for installed checkpoints
  const discovery = await discoverLocalCheckpoints(comfyUrl);
  let selectedCheckpoint = checkpointOverride;

  if (!selectedCheckpoint && discovery.available && discovery.checkpoints.length > 0) {
    // Prefer SDXL if available, otherwise first installed checkpoint
    selectedCheckpoint = discovery.checkpoints.find((c) => /sd_?xl/i.test(c)) || discovery.checkpoints[0];
  }

  const isSDXL = selectedCheckpoint ? /sd_?xl/i.test(selectedCheckpoint) : true;
  const workflow = createPortableWorkflow(prompts.positivePrompt, prompts.negativePrompt, {
    checkpoint: selectedCheckpoint || (isSDXL ? 'sd_xl_base_1.0.safetensors' : config.comfy.defaultCheckpoint),
    architecture: isSDXL ? 'sdxl' : 'sd15',
  });

  // Validate workflow graph integrity
  validateWorkflowStructure(workflow);

  // If ComfyUI is not available, return validated workflow artifact
  if (!discovery.available) {
    return {
      ok: true,
      status: 'workflow_validated',
      format: 'workflow_json',
      prompts,
      workflow,
      qualityReport,
      checkpoint: selectedCheckpoint || 'sd_xl_base_1.0.safetensors (required on Office PC)',
      notes: 'Local ComfyUI is offline. Workflow validated successfully. Ready for execution on GPU machine.',
    };
  }

  // ComfyUI is online: execute inference
  try {
    const postRes = await fetch(`${comfyUrl}/prompt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(workflow),
    });

    if (!postRes.ok) {
      throw new Error(`Failed to queue workflow: HTTP ${postRes.status}`);
    }

    const { prompt_id } = await postRes.json();

    // Poll for completion (up to 120s)
    let outputImage = null;
    const maxPolls = 60;
    for (let i = 0; i < maxPolls; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      const histRes = await fetch(`${comfyUrl}/history/${prompt_id}`);
      if (histRes.ok) {
        const histData = await histRes.json();
        const outputs = histData[prompt_id]?.outputs;
        if (outputs) {
          const saveNode = Object.values(outputs).find((o) => Array.isArray(o.images) && o.images.length > 0);
          if (saveNode && saveNode.images[0]) {
            outputImage = saveNode.images[0];
            break;
          }
        }
      }
    }

    if (outputImage) {
      // Fetch image buffer
      const viewUrl = `${comfyUrl}/view?filename=${encodeURIComponent(outputImage.filename)}&subfolder=${encodeURIComponent(outputImage.subfolder || '')}&type=${encodeURIComponent(outputImage.type || 'output')}`;
      const imgRes = await fetch(viewUrl);
      if (imgRes.ok) {
        const buffer = Buffer.from(await imgRes.arrayBuffer());
        return {
          ok: true,
          status: 'generated_ai_raster',
          format: 'png',
          buffer,
          prompts,
          workflow,
          qualityReport,
          checkpoint: selectedCheckpoint,
          promptId: prompt_id,
        };
      }
    }

    return {
      ok: true,
      status: 'workflow_queued',
      format: 'workflow_json',
      prompts,
      workflow,
      qualityReport,
      checkpoint: selectedCheckpoint,
      promptId: prompt_id,
      notes: 'Workflow queued on local ComfyUI. Polling timed out.',
    };
  } catch (err) {
    return {
      ok: true,
      status: 'workflow_validated',
      format: 'workflow_json',
      prompts,
      workflow,
      qualityReport,
      checkpoint: selectedCheckpoint,
      error: err.message,
      notes: `Inference dispatch error (${err.message}). Stored validated workflow for manual or LAN execution.`,
    };
  }
}

module.exports = {
  createPortableWorkflow,
  discoverLocalCheckpoints,
  validateWorkflowStructure,
  processComfyUIGeneration,
  // Backward-compatible test aliases
  buildPromptsFromConcept: (concept, options) => {
    const res = buildEditorialPrompts(concept, options);
    return {
      positive_prompt: res.positivePrompt,
      negative_prompt: res.negativePrompt,
      ...res,
    };
  },
  createComfyWorkflow: createPortableWorkflow,
  generateArtwork: processComfyUIGeneration,
};

