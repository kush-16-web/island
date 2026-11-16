const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const ARTIFACT_DIR = path.resolve('C:/Users/harsh/.gemini/antigravity/brain/00486437-adb7-44d3-9fef-0bfc4c041cc3');

async function buildHotfixMatrix() {
  const items = [
    {
      file: 'gate_b_hotfix_a_music_playing_pause.png',
      label: 'A. Music Playing — Authoritative Pause Icon Visible (520x276)',
      desc: 'Borderline by Tame Impala actively playing. Button shows Pause icon. Tightened 276px vertical frame.',
    },
    {
      file: 'gate_b_hotfix_b_music_paused_play.png',
      label: 'B. Music Paused — Responsive Play Icon Visible (520x276)',
      desc: 'Clicking Pause sends playpause, transitions authoritative playback state to paused and updates icon to Play.',
    },
    {
      file: 'gate_b_hotfix_c_dynamic_frosted_tiles.png',
      label: 'C. Dynamic Frosted — Album-Reactive Translucent Tiles',
      desc: 'Tiles use color-mix tint with backdrop-filter blur(16px), eliminating opaque charcoal brick clash.',
    },
    {
      file: 'gate_b_hotfix_d_pitch_black_utilities.png',
      label: 'D. No Track — Pitch-Black Utilities with Natural Dark Tiles (520x240)',
      desc: 'When no media is playing, notch returns to #000000 pitch-black with natural #18191c dark tiles.',
    },
    {
      file: 'gate_b_hotfix_e_root_no_chevron.png',
      label: 'E. Root Utilities — Little Island Title with Zero Chevrons',
      desc: 'Header left shows pure Little Island title. Misleading right-facing chevron completely removed.',
    },
    {
      file: 'gate_b_hotfix_f_timer_back_arrow.png',
      label: 'F. Detail Screen — Left-Pointing Back Arrow (m15 18-6-6 6-6)',
      desc: 'Navigating into Timer/Alarm displays dedicated unrotated left chevron back button.',
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
      <text x="30" y="38" font-family="Segoe UI, sans-serif" font-size="20" font-weight="bold" fill="#ffffff">ISLAND AI — PHASE 1B.3 / GATE B HOTFIX VERIFICATION MATRIX</text>
      <text x="30" y="66" font-family="Segoe UI, sans-serif" font-size="13" fill="#9ca3af">Live Playback Authority · Dynamic Frosted Glass Coordinated Tiles · Zero Root Chevron · Compact 276px/240px Layout</text>
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
    .toFile(path.join(ARTIFACT_DIR, 'gate_b_hotfix_matrix.png'));

  console.log('[Matrix] Successfully generated gate_b_hotfix_matrix.png');
}

buildHotfixMatrix().catch(console.error);

