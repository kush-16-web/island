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
    // Unescape YAML escaped quotes
    return v.replace(/''/g, "'");
  };

  for (let i = 0; i < rawLines.length; i++) {
    const raw = rawLines[i];
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    // Line start: "- text: ..." at column 0
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

    // Word start inside words array: "  - text: ..."
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

    // start_ms: ...
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

    // end_ms: ...
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

const fs = require('fs');
const yamlContent = fs.readFileSync('test/harness/joy-crookes-yaml.txt', 'utf8');
const lines = parseYamlLyrics(yamlContent);
console.log('Parsed lines count:', lines.length);
console.log('Line 0:', JSON.stringify(lines[0], null, 2));
console.log('Line 1:', JSON.stringify(lines[1], null, 2));
console.log('Line 2:', JSON.stringify(lines[2], null, 2));
console.log('Last line:', JSON.stringify(lines[lines.length - 1], null, 2));
