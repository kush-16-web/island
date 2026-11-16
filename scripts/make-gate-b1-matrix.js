const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const ARTIFACT_DIR = path.resolve('C:/Users/harsh/.gemini/antigravity/brain/00486437-adb7-44d3-9fef-0bfc4c041cc3');

async function buildMatrix() {
  const items = [
    {
      file: 'gate_b1_e_idle_notch.png',
      label: 'E. Pitch-Black Idle Notch (200x36)',
      desc: 'Resting pitch-black notch #000000 with centered companion eyes and zero album bleed.',
    },
    {
      file: 'gate_b1_a1_utilities_root.png',
      label: 'A1. Utilities Root Surface (520x276)',
      desc: 'Root 2x2 grid and now-playing widget. Clean header with Little Island and no stray chevron.',
    },
    {
      file: 'gate_b1_a2_timer_morph_mid.png',
      label: 'A2. Shared Surface Morph — Midpoint (130ms)',
      desc: 'Timer tile expands seamlessly across the physical surface while other tiles smoothly fade.',
    },
    {
      file: 'gate_b1_a3_timer_morph_complete.png',
      label: 'A3. Timer Detail Complete with Left Back Arrow',
      desc: 'Surface expanded into Timer view. Left arrow and title ready for interaction.',
    },
    {
      file: 'gate_b1_f_timer_wheel_picker.png',
      label: 'F. Proper iOS Wheel Picker (HH:MM:SS Cylinders)',
      desc: '3-cylinder @ncdai/react-wheel-picker with 3D perspective, inertia scroll and highlighted band.',
    },
    {
      file: 'gate_b1_g_timer_running_rolling_digits.png',
      label: 'G. Running Timer with Animated Rolling Digits',
      desc: 'RollingTimeDisplay with animated RollingDigit boxes (popLayout, no layout shift).',
    },
    {
      file: 'gate_b1_c2_alarms_mode.png',
      label: 'C. Countdown to Alarms Segmented Transition',
      desc: 'Smooth horizontal slide and fade inside same surface without height pop or unmount flash.',
    },
    {
      file: 'gate_b1_b_weather_morph.png',
      label: 'B. Connected Weather Utility Surface',
      desc: 'Uniform morphing architecture applied across all utility surfaces with stable outer window.',
    },
    {
      file: 'gate_b1_h_expanded_music_short_title.png',
      label: 'H. Expanded Music — Short Title Centered (572x304)',
      desc: 'Borderline and Tame Impala centered under album artwork using measured scrollWidth.',
    },
    {
      file: 'gate_b1_i_expanded_music_long_title.png',
      label: 'I. Expanded Music — Long Title Smooth Marquee',
      desc: 'Overflowing title left-aligned with calm pause-travel-pause-return marquee animation.',
    },
    {
      file: 'gate_b1_j_music_centered_controls.png',
      label: 'J. Playback Controls — Centered Cluster (No Stretch)',
      desc: 'Centered flex cluster: 28px secondary buttons, 36px primary Play/Pause, 6px gaps.',
    },
    {
      file: 'gate_b1_a4_back_to_utilities.png',
      label: 'A4. Reverse Morph — Contracted to Utilities',
      desc: 'Detail contracts smoothly back into its 2x2 grid tile while sibling tiles reappear.',
    },
  ];

  const cellWidth = 580;
  const cellHeight = 360;
  const cols = 2;
  const rows = Math.ceil(items.length / cols);

  const canvasWidth = cols * cellWidth + 60;
  const canvasHeight = rows * cellHeight + 110;

  const composites = [];

  // Header banner
  const svgHeader = `
    <svg width="${canvasWidth}" height="90" xmlns="http://www.w3.org/2000/svg">
      <rect width="${canvasWidth}" height="90" fill="#0c0d12"/>
      <text x="30" y="38" font-family="Segoe UI, sans-serif" font-size="20" font-weight="bold" fill="#ffffff">ISLAND AI — PHASE 1B.3 / GATE B.1 VERIFICATION MATRIX</text>
      <text x="30" y="66" font-family="Segoe UI, sans-serif" font-size="13" fill="#9ca3af">Connected Surface Morphing · iOS Wheel Picker · Rolling Digits · Centered Controls and Smart Title Alignment</text>
    </svg>
  `;
  composites.push({
    input: Buffer.from(svgHeader),
    top: 0,
    left: 0,
  });

  for (let i = 0; i < items.length; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const item = items[i];
    const filePath = path.join(ARTIFACT_DIR, item.file);

    const left = 30 + col * (cellWidth + 10);
    const top = 100 + row * cellHeight;

    const cardSvg = `
      <svg width="${cellWidth}" height="${cellHeight - 16}" xmlns="http://www.w3.org/2000/svg">
        <rect width="${cellWidth}" height="${cellHeight - 16}" rx="12" fill="#14151a" stroke="#232630" stroke-width="1"/>
        <text x="16" y="24" font-family="Segoe UI, sans-serif" font-size="12" font-weight="600" fill="#e2e8f0">${item.label}</text>
        <text x="16" y="42" font-family="Segoe UI, sans-serif" font-size="10.5" fill="#94a3b8">${item.desc}</text>
      </svg>
    `;
    composites.push({
      input: Buffer.from(cardSvg),
      top: top,
      left: left,
    });

    if (fs.existsSync(filePath)) {
      const imgBuffer = await sharp(filePath)
        .resize({ width: cellWidth - 32, height: cellHeight - 74, fit: 'inside' })
        .toBuffer();

      const meta = await sharp(imgBuffer).metadata();
      const imgLeft = left + Math.round((cellWidth - meta.width) / 2);
      const imgTop = top + 52 + Math.round((cellHeight - 68 - meta.height) / 2);

      composites.push({
        input: imgBuffer,
        top: imgTop,
        left: imgLeft,
      });
    }
  }

  await sharp({
    create: {
      width: canvasWidth,
      height: canvasHeight,
      channels: 4,
      background: { r: 12, g: 13, b: 18, alpha: 1 },
    },
  })
    .composite(composites)
    .png()
    .toFile(path.join(ARTIFACT_DIR, 'gate_b1_verification_matrix.png'));

  console.log('[Matrix] Successfully generated gate_b1_verification_matrix.png');
}

buildMatrix().catch(console.error);
