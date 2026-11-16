const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const ARTIFACT_DIR = path.resolve('C:/Users/harsh/.gemini/antigravity/brain/00486437-adb7-44d3-9fef-0bfc4c041cc3');

async function buildMatrix() {
  const items = [
    { file: 'gate_b_1_idle_pitch_black.png', label: '1. Pitch-Black Idle Notch (200x36, #000000)' },
    { file: 'gate_b_2_utilities_no_music.png', label: '2. Root Utilities (No Music, Pitch Black 520x256)' },
    { file: 'gate_b_3_utilities_active_music.png', label: '3. Utilities + Active Music Widget (Dynamic Frosted 520x300)' },
    { file: 'gate_b_4_timer_countdown_picker.png', label: '4. Countdown Time Picker (HH:MM:SS Spinners and Chips)' },
    { file: 'gate_b_5_countdown_running.png', label: '5. Running Countdown (Live Remaining Display 520x280)' },
    { file: 'gate_b_6_countdown_paused.png', label: '6. Paused Countdown (Tactile Resume/Cancel Actions)' },
    { file: 'gate_b_7_alarms_list.png', label: '7. Alarms List View (Active Schedule and Switches)' },
    { file: 'gate_b_8_alarm_add_editor.png', label: '8. Dedicated Add Alarm Full-View Editor' },
    { file: 'gate_b_9_dynamic_frosted_album2.png', label: '9. Dynamic Frosted (Teal Album Palette 520x300)' },
    { file: 'gate_b_10_utilities_return_pitch_black.png', label: '10. Return to Pitch Black when Track Clears (#000000)' },
  ];

  const cellWidth = 560;
  const cellHeight = 350;
  const cols = 2;
  const rows = Math.ceil(items.length / cols);

  const canvasWidth = cols * cellWidth + 60;
  const canvasHeight = rows * cellHeight + 110;

  const composites = [];

  // Header background banner
  const svgHeader = `
    <svg width="${canvasWidth}" height="90" xmlns="http://www.w3.org/2000/svg">
      <rect width="${canvasWidth}" height="90" fill="#0c0d12"/>
      <text x="30" y="38" font-family="Segoe UI, sans-serif" font-size="20" font-weight="bold" fill="#ffffff">ISLAND AI — PHASE 1B.3 / GATE B VERIFICATION MATRIX</text>
      <text x="30" y="66" font-family="Segoe UI, sans-serif" font-size="13" fill="#9ca3af">Pitch-Black #000000 Idle Enforcement · Compact Utilities 2x2 Grid · Separated Countdown and Alarms · Real Electron Captures</text>
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

    // Card background & label
    const cardSvg = `
      <svg width="${cellWidth}" height="${cellHeight - 16}" xmlns="http://www.w3.org/2000/svg">
        <rect width="${cellWidth}" height="${cellHeight - 16}" rx="12" fill="#14151a" stroke="#232630" stroke-width="1"/>
        <text x="16" y="24" font-family="Segoe UI, sans-serif" font-size="12" font-weight="600" fill="#e2e8f0">${item.label}</text>
      </svg>
    `;
    composites.push({
      input: Buffer.from(cardSvg),
      top: top,
      left: left,
    });

    if (fs.existsSync(filePath)) {
      const imgBuffer = await sharp(filePath)
        .resize({ width: cellWidth - 32, height: cellHeight - 64, fit: 'inside' })
        .toBuffer();

      const meta = await sharp(imgBuffer).metadata();
      const imgLeft = left + Math.round((cellWidth - meta.width) / 2);
      const imgTop = top + 34 + Math.round((cellHeight - 50 - meta.height) / 2);

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
    .toFile(path.join(ARTIFACT_DIR, 'gate_b_verification_matrix.png'));

  console.log('[Matrix] Successfully generated gate_b_verification_matrix.png');
}

buildMatrix().catch(console.error);
