const { parseTtml, parseLrc, isValidWordTiming } = require('../../src/lib/lyrics/lyrics.js');

function parseYamlLyrics(yamlText) {
  if (!yamlText || typeof yamlText !== 'string') return [];
  const rawLines = yamlText.split(/\r?\n/);
  const parsed = [];

  let currentLine = null;
  let currentWord = null;

  const cleanVal = (val) => {
    let v = val.trim();
    if ((v.startsWith("'") && v.endsWith("'")) || (v.startsWith('"') && v.endsWith('"'))) {
      v = v.slice(1, -1);
    }
    return v.replace(/''/g, "'");
  };

  for (let i = 0; i < rawLines.length; i++) {
    const raw = rawLines[i];
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const lineTextMatch = raw.match(/^- text:\s*(.*)$/);
    if (lineTextMatch) {
      if (currentLine) {
        if (currentWord && currentLine.words) {
          currentLine.words.push(currentWord);
          currentWord = null;
        }
        parsed.push(currentLine);
      }
      currentLine = {
        id: `yaml-${parsed.length}`,
        text: cleanVal(lineTextMatch[1]),
        timeMs: 0,
        endMs: 0,
        words: [],
      };
      currentWord = null;
      continue;
    }

    if (!currentLine) continue;

    const wordTextMatch = raw.match(/^\s{2,}-\s*text:\s*(.*)$/);
    if (wordTextMatch) {
      if (currentWord) {
        currentLine.words.push(currentWord);
      }
      currentWord = {
        text: cleanVal(wordTextMatch[1]),
        startMs: 0,
        endMs: 0,
        durationMs: 0,
      };
      continue;
    }

    const startMsMatch = trimmed.match(/^start_ms:\s*(\d+)/);
    if (startMsMatch) {
      const ms = parseInt(startMsMatch[1], 10);
      if (currentWord) {
        currentWord.startMs = ms;
      } else {
        currentLine.timeMs = ms;
      }
      continue;
    }

    const endMsMatch = trimmed.match(/^end_ms:\s*(\d+)/);
    if (endMsMatch) {
      const ms = parseInt(endMsMatch[1], 10);
      if (currentWord) {
        currentWord.endMs = ms;
        currentWord.durationMs = Math.max(50, currentWord.endMs - currentWord.startMs);
      } else {
        currentLine.endMs = ms;
      }
      continue;
    }
  }

  if (currentLine) {
    if (currentWord && currentLine.words) {
      currentLine.words.push(currentWord);
    }
    parsed.push(currentLine);
  }

  return parsed;
}

function findActiveLyricIndexFixed(lines, positionMs) {
  if (!lines || lines.length === 0 || typeof positionMs !== 'number' || isNaN(positionMs)) {
    return -1;
  }

  const firstTimedIdx = lines.findIndex((l) => typeof l.timeMs === 'number' && !isNaN(l.timeMs));
  if (firstTimedIdx === -1) {
    return -1;
  }

  const firstLine = lines[firstTimedIdx];
  if (positionMs < firstLine.timeMs) {
    return -1;
  }

  let low = firstTimedIdx;
  let high = lines.length - 1;
  let activeIdx = -1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const line = lines[mid];

    if (typeof line.timeMs === 'number' && !isNaN(line.timeMs)) {
      if (line.timeMs <= positionMs) {
        activeIdx = mid;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    } else {
      high = mid - 1;
    }
  }

  return activeIdx;
}

// Test on Joy Crookes YAML
const fs = require('fs');
const joyYaml = fs.readFileSync('test/harness/joy-crookes-yaml.txt', 'utf8');
const joyLines = parseYamlLyrics(joyYaml);

console.log('Joy Crookes YAML lines parsed:', joyLines.length);
console.log('Testing Joy Crookes timeline with fixed findActiveLyricIndex:');
[0, 5, 8, 9, 12, 14, 20, 60, 120, 194, 196].forEach((s) => {
  const ms = s * 1000;
  const idx = findActiveLyricIndexFixed(joyLines, ms);
  const line = idx >= 0 ? joyLines[idx] : null;
  console.log(`  t=${s}s (${ms}ms) -> idx=${idx} [${line ? `${(line.timeMs / 1000).toFixed(1)}s: "${line.text.slice(0, 30)}"` : 'none (intro)'}]`);
});
