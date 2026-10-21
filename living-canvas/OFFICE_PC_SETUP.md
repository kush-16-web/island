# Living Canvas — Office PC Setup & Real Artwork Validation Guide

This guide details the hardware specifications, model recommendations, and exact execution steps to run real local AI image generation for Living Canvas on an office/workstation Windows PC with a dedicated GPU.

---

## 1. Hardware & System Requirements

| Component | Minimum Required | Recommended (Optimal Art Quality) |
| :--- | :--- | :--- |
| **GPU** | NVIDIA RTX 3060 / 4060 (8 GB VRAM) | NVIDIA RTX 4070 / 4080 / 3090 (12 GB – 24 GB VRAM) |
| **CUDA / Drivers** | NVIDIA Driver 535+ (CUDA 12.1+) | NVIDIA Driver 550+ |
| **System RAM** | 16 GB DDR4/DDR5 | 32 GB DDR5 |
| **Storage** | 30 GB free NVMe SSD space | 60 GB free NVMe SSD space |
| **Operating System** | Windows 10 / 11 64-bit | Windows 11 64-bit |

---

## 2. Model Recommendations (Editorial Fine-Art Line Posters)

Do **NOT** download models on the low-memory laptop. On the office PC, place one or more of the following checkpoints in `ComfyUI/models/checkpoints/`:

### Recommended Checkpoints:
1. **SDXL Base 1.0** (Recommended for 12GB+ VRAM):
   - File: `sd_xl_base_1.0.safetensors` (~6.6 GB)
   - Why: Superior comprehension of complex spatial composition, artistic negative space, and typographic lithograph aesthetics.
   - Native Resolution: 832 × 1216 (portrait poster aspect ratio).

2. **DreamShaper XL** or **Juggernaut XL**:
   - Files: `dreamshaperXL_v21TurboDPMSDE.safetensors` or `juggernautXL_v9.safetensors`
   - Why: Excellent fine-art line control, ink stroke definition, and crisp contrast.

3. **SD 1.5 Fine Art / Linocut** (Fallback for 8GB VRAM):
   - File: `v1-5-pruned-emaonly.safetensors` or `dreamshaper_8.safetensors` (~4 GB)
   - Resolution: 512 × 768.

---

## 3. Step-by-Step Setup on the Office PC

### Step 1: Install ComfyUI Portable
1. Download the official standalone release from [ComfyUI GitHub Releases](https://github.com/comfyanonymous/ComfyUI/releases) (`ComfyUI_windows_portable_nvidia_cu121_or_cpu.7z`).
2. Extract to `C:\AI\ComfyUI_windows_portable\`.
3. Place your chosen model checkpoint into:
   ```
   C:\AI\ComfyUI_windows_portable\ComfyUI\models\checkpoints\
   ```

### Step 2: Start ComfyUI with Network Listening
To allow Island running on your laptop or directly on the office PC to communicate with ComfyUI:
1. Edit or launch `run_nvidia_gpu.bat` with `--listen 0.0.0.0 --port 8188`:
   ```bat
   .\python_embeded\python.exe -s ComfyUI\main.py --windows-standalone-build --listen 0.0.0.0 --port 8188
   ```
2. Verify ComfyUI web UI opens at `http://127.0.0.1:8188` (or `http://<OFFICE_PC_IP>:8188`).

### Step 3: Run Living Canvas on the GPU
From the Island repository on the office PC (or pointed via LAN):

```powershell
# Set ComfyUI endpoint (defaults to http://127.0.0.1:8188)
$env:COMFYUI_URL="http://127.0.0.1:8188"

# 1. Probe the environment and verify GPU & checkpoints detected
node living-canvas/cli.js check

# 2. Run real image generation test on the 3 songs
node living-canvas/cli.js generate

# 3. View the generated PNG posters and quality checklist in the exhibition gallery
node living-canvas/cli.js gallery
```

---

## 4. Manual Web UI Test (Drag-and-Drop)

Each validated run produces a standalone [`workflow.json`](file:///d:/island/living-canvas/output/) in the song's output folder:
1. Open `http://127.0.0.1:8188` in your browser.
2. Drag and drop any generated `workflow.json` (e.g. from `living-canvas/output/the-lumineers_midnight-rain/workflow.json`) directly into the ComfyUI browser canvas.
3. ComfyUI will instantly load the exact node graph, prompts, seeds, and latent dimensions.
4. Click **Queue Prompt**.
5. The generated continuous-line artwork poster will render and appear in the `SaveImage` node.

---

## 5. What Is Validated vs. Still Untested

### What Is Fully Validated (Pass 2):
- **Concept Interpretation & Schema**: Generates distinct emotional themes, central metaphors, line logic, and color palettes for diverse song styles.
- **Improved Concept-to-Image Prompts**: Eliminates diffusion confusion by removing label prefixes and inserting weighted subject anchors, symbolic metamorphosis, and gallery lithograph descriptors.
- **Workflow Topology**: Verified that `workflow.json` adheres strictly to standard KSampler + CheckpointLoader + CLIPTextEncode + VAEDecode graphs.
- **Quality Evaluation Checklist**: Automated scoring of subject legibility, metaphor communication, emotional resonance, line expressiveness, and compositional asymmetry.
- **Zero Cloud AI**: No tokens consumed, no paid APIs used.

### What Is Still Untested (Pending Office PC GPU Run):
- **Visual Subject Legibility in Diffusion Weights**: How well a specific checkpoint (e.g. SDXL Base vs DreamShaper) isolates an unbroken continuous line without introducing stray shading.
- **Prompt Adherence for Abstract Metaphors**: Validating whether the model renders the transformation (e.g. origami crane wings becoming sunrays) as a coherent illustration rather than two separate elements.
- **Inference Latency on Target GPU**: Exact seconds per generation (expected: ~4–8 seconds on RTX 4070/4080 with SDXL).
