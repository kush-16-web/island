'use strict';
// electron/windows-tts.js: Native Windows SAPI Speech Synthesis Service for Island.
// Solves Chromium/Electron lack of Web Speech synthesis on Windows by executing
// System.Speech.Synthesis.SpeechSynthesizer in the background and returning standard PCM WAV.

const cp = require('child_process');

class WindowsTtsService {
  constructor() {
    this.cachedVoices = null;
    this.activeChild = null;
  }

  /**
   * Helper to run PowerShell script via stdin to avoid command line argument mangling.
   */
  _runPowerShell(scriptText, timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
      const ps = cp.spawn('powershell.exe', [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        '-'
      ], {
        windowsHide: true,
      });

      this.activeChild = ps;

      let stdout = '';
      let stderr = '';
      let timer = null;

      if (timeoutMs > 0) {
        timer = setTimeout(() => {
          try {
            ps.kill();
          } catch {}
          reject(new Error(`Windows TTS timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      }

      ps.stdout.on('data', (chunk) => {
        stdout += chunk.toString();
      });

      ps.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });

      ps.on('close', (code) => {
        if (timer) clearTimeout(timer);
        if (this.activeChild === ps) {
          this.activeChild = null;
        }

        if (code !== 0) {
          reject(new Error(`PowerShell exit code ${code}: ${(stderr || stdout).trim()}`));
        } else {
          resolve(stdout.trim());
        }
      });

      ps.on('error', (err) => {
        if (timer) clearTimeout(timer);
        if (this.activeChild === ps) {
          this.activeChild = null;
        }
        reject(err);
      });

      try {
        ps.stdin.write(scriptText);
        ps.stdin.end();
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Enumerate installed SAPI Desktop voices on Windows.
   */
  async getVoices() {
    if (this.cachedVoices && this.cachedVoices.length > 0) {
      return { ok: true, voices: this.cachedVoices };
    }

    const script = `
      Add-Type -AssemblyName System.Speech
      $s = New-Object System.Speech.Synthesis.SpeechSynthesizer
      $voices = @($s.GetInstalledVoices() | ForEach-Object {
        [PSCustomObject]@{
          name = $_.VoiceInfo.Name
          culture = $_.VoiceInfo.Culture.Name
          gender = $_.VoiceInfo.Gender.ToString()
          age = $_.VoiceInfo.Age.ToString()
          enabled = $_.Enabled
        }
      })
      $s.Dispose()
      $voices | ConvertTo-Json -Compress
    `;

    try {
      const raw = await this._runPowerShell(script, 8000);
      let parsed = [];
      try {
        const data = JSON.parse(raw);
        parsed = Array.isArray(data) ? data : [data];
      } catch {
        parsed = [];
      }

      const formatted = parsed.map((v) => ({
        name: v.name,
        voiceURI: v.name,
        lang: v.culture || 'en-US',
        gender: v.gender || 'Unknown',
        enabled: Boolean(v.enabled),
        localService: true,
        default: v.name.includes('David') || false,
      }));

      this.cachedVoices = formatted;
      return { ok: true, voices: formatted };
    } catch (err) {
      return { ok: false, error: err.message, voices: [] };
    }
  }

  _cleanTextForSpeech(rawText) {
    if (!rawText || typeof rawText !== 'string') return '';
    let text = rawText.replace(/\[\[ACTION:[\s\S]*?\]\]/g, '');
    text = text.replace(/```[\w]*\n([\s\S]*?)```/g, 'a code snippet.');
    text = text.replace(/`([^`]+)`/g, '$1');
    text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
    text = text.replace(/https?:\/\/(?:www\.)?([a-zA-Z0-9.-]+)(?:\/[^\s]*)?/g, '$1');
    text = text.replace(/^[ \t]*#{1,6}[ \t]+([^\n]+)/gm, '$1.');
    text = text.replace(/^[ \t]*>[ \t]+([^\n]+)/gm, '$1');
    text = text.replace(/^[ \t]*(\d+)[.)][ \t]+([^\n]+)/gm, '$1, $2.');
    text = text.replace(/^[ \t]*[-*+•][ \t]+([^\n]+)/gm, '$1,');
    text = text.replace(/\*{1,3}([^*]+)\*{1,3}/g, '$1');
    text = text.replace(/_{1,3}([^_]+)_{1,3}/g, '$1');
    text = text.replace(/~{1,2}([^~]+)~{1,2}/g, '$1');
    text = text.replace(/(\d+(?:\.\d+)?)\s*°\s*[cC]\b/g, '$1 degrees Celsius');
    text = text.replace(/(\d+(?:\.\d+)?)\s*°\s*[fF]\b/g, '$1 degrees Fahrenheit');
    text = text.replace(/(\d+(?:\.\d+)?)\s*°\b/g, '$1 degrees');
    text = text.replace(/(\d+(?:\.\d+)?)\s*%/g, '$1 percent');
    text = text.replace(/\$(\d+(?:\.\d{1,2})?)/g, '$1 dollars');
    text = text.replace(/₹(\d+(?:\.\d{1,2})?)/g, '$1 rupees');
    text = text.replace(/€(\d+(?:\.\d{1,2})?)/g, '$1 euros');
    text = text.replace(/\s+&\s+/g, ' and ');
    text = text.replace(/(\w+)\/(\w+)/g, '$1 or $2');
    text = text.replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1FA00}-\u{1FAFF}]/gu, '');
    text = text.replace(/\s+,/g, ',');
    text = text.replace(/,\s*,+/g, ',');
    text = text.replace(/\.\s*\.+/g, '.');
    text = text.replace(/\s+/g, ' ').trim();
    return text;
  }

  /**
   * Synthesize text to 16-bit PCM WAV base64 using SAPI.
   */
  async synthesizeSpeech({ text, voice, rate = 0 }) {
    if (!text || typeof text !== 'string' || !text.trim()) {
      return { ok: false, error: 'Empty text to synthesize' };
    }

    const cleanText = this._cleanTextForSpeech(text);
    if (!cleanText) {
      return { ok: false, error: 'No clean text after stripping actions' };
    }

    const textBase64 = Buffer.from(cleanText, 'utf8').toString('base64');
    const voiceBase64 = voice ? Buffer.from(voice, 'utf8').toString('base64') : '';
    const numericRate = Math.max(-10, Math.min(10, Math.round(Number(rate) || 0)));

    const script = `
      Add-Type -AssemblyName System.Speech
      $text = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${textBase64}'))
      $voice = '${voiceBase64}' ? [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${voiceBase64}')) : $null
      $s = New-Object System.Speech.Synthesis.SpeechSynthesizer
      if ($voice) {
        try { $s.SelectVoice($voice) } catch {}
      }
      $s.Rate = ${numericRate}
      $ms = New-Object System.IO.MemoryStream
      $s.SetOutputToWaveStream($ms)
      $s.Speak($text)
      $bytes = $ms.ToArray()
      $s.Dispose()
      $ms.Dispose()
      [System.Convert]::ToBase64String($bytes)
    `;

    const startTime = Date.now();
    try {
      const audioBase64 = await this._runPowerShell(script, 15000);
      const durationMs = Date.now() - startTime;

      if (!audioBase64 || audioBase64.length < 100) {
        return { ok: false, error: 'Native speech synthesis returned empty audio data' };
      }

      return {
        ok: true,
        audioBase64,
        mimeType: 'audio/wav',
        durationMs,
        voice: voice || 'System Default',
      };
    } catch (err) {
      return {
        ok: false,
        error: err.message,
        durationMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Cancel active synthesis process.
   */
  cancel() {
    if (this.activeChild) {
      try {
        this.activeChild.kill();
      } catch {}
      this.activeChild = null;
    }
  }
}

const windowsTtsService = new WindowsTtsService();

module.exports = {
  WindowsTtsService,
  windowsTtsService,
};
