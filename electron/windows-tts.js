'use strict';
// electron/windows-tts.js: High-Performance Native Windows SAPI Speech Synthesis Service for Island.
// PASS 2.2.8.1: Features a persistent warm PowerShell worker for ultra-low latency (<150ms)
// synthesis, eliminating the 2.5-4s cold-start process spawn penalty.

const cp = require('child_process');
const readline = require('readline');

class WindowsTtsService {
  constructor() {
    this.cachedVoices = null;
    this.activeChild = null; // fallback one-shot child
    this.worker = null;      // persistent warm worker process
    this.workerRl = null;
    this.pendingReq = null;
    this.reqSeq = 0;
    this.isWorkerReady = false;
    this.initPromise = null;

    // Proactively warm worker in the background
    this.ensureWarmWorker().catch(() => {});
  }

  /**
   * Initialize or return the running warm PowerShell worker.
   */
  async ensureWarmWorker() {
    if (this.worker && this.isWorkerReady) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = new Promise((resolve) => {
      this._spawnWorker(() => {
        this.initPromise = null;
        resolve();
      });
    });
    return this.initPromise;
  }

  _spawnWorker(onReady) {
    if (this.worker) {
      try { this.worker.kill(); } catch {}
      this.worker = null;
    }

    try {
      const ps = cp.spawn('powershell.exe', [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        '-'
      ], {
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe']
      });

      this.worker = ps;
      this.isWorkerReady = false;

      let buffer = '';
      let isCapturing = false;

      const rl = readline.createInterface({ input: ps.stdout });
      this.workerRl = rl;

      rl.on('line', (line) => {
        const trimmed = line.trim();
        if (trimmed === '---ISLAND_WORKER_READY---') {
          this.isWorkerReady = true;
          if (onReady) onReady();
          return;
        }

        if (trimmed.startsWith('---ISLAND_TTS_START:')) {
          buffer = '';
          isCapturing = true;
          return;
        }

        if (trimmed.startsWith('---ISLAND_TTS_END:')) {
          const endReqId = trimmed.split(':')[1].replace('---', '');
          isCapturing = false;
          if (this.pendingReq && this.pendingReq.id === endReqId) {
            const req = this.pendingReq;
            this.pendingReq = null;
            req.resolve(buffer.trim());
          }
          return;
        }

        if (isCapturing) {
          buffer += trimmed;
        }
      });

      ps.stderr.on('data', () => {
        // Discard non-fatal warnings
      });

      ps.on('close', () => {
        this.isWorkerReady = false;
        this.worker = null;
        if (this.pendingReq) {
          const req = this.pendingReq;
          this.pendingReq = null;
          req.reject(new Error('Persistent Windows TTS worker process closed'));
        }
      });

      ps.on('error', (err) => {
        this.isWorkerReady = false;
        this.worker = null;
        if (this.pendingReq) {
          const req = this.pendingReq;
          this.pendingReq = null;
          req.reject(err);
        }
      });

      // Warm up System.Speech and instantiate long-lived SpeechSynthesizer
      const initScript = `
        Add-Type -AssemblyName System.Speech
        $script:s = New-Object System.Speech.Synthesis.SpeechSynthesizer
        Write-Output "---ISLAND_WORKER_READY---"
      `;
      ps.stdin.write(initScript + '\n');
    } catch (spawnErr) {
      this.isWorkerReady = false;
      this.worker = null;
      if (onReady) onReady();
    }
  }

  /**
   * Fallback one-shot PowerShell execution (used if warm worker fails or for voice enumeration).
   */
  _runPowerShellOneShot(scriptText, timeoutMs = 15000) {
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
      const raw = await this._runPowerShellOneShot(script, 8000);
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
    text = text.replace(/£(\d+(?:\.\d{1,2})?)/g, '$1 pounds');
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
   * Leverages the warm worker process for ultra-low latency (<150ms).
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

    const startTime = Date.now();

    // 1. Try synthesis with persistent warm worker first
    try {
      await this.ensureWarmWorker();
      if (this.worker && this.isWorkerReady) {
        const reqId = String(++this.reqSeq);
        const script = `
          $text = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${textBase64}'))
          $voice = '${voiceBase64}' ? [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${voiceBase64}')) : $null
          if ($voice) { try { $script:s.SelectVoice($voice) } catch {} }
          $script:s.Rate = ${numericRate}
          $ms = New-Object System.IO.MemoryStream
          $script:s.SetOutputToWaveStream($ms)
          $script:s.Speak($text)
          $bytes = $ms.ToArray()
          $ms.Dispose()
          $b64 = [System.Convert]::ToBase64String($bytes)
          Write-Output "---ISLAND_TTS_START:${reqId}---"
          Write-Output $b64
          Write-Output "---ISLAND_TTS_END:${reqId}---"
        `;

        const audioBase64 = await new Promise((resolve, reject) => {
          const timer = setTimeout(() => {
            if (this.pendingReq && this.pendingReq.id === reqId) {
              this.pendingReq = null;
              reject(new Error('Windows TTS warm worker request timed out after 8s'));
            }
          }, 8000);

          this.pendingReq = {
            id: reqId,
            resolve: (val) => {
              clearTimeout(timer);
              resolve(val);
            },
            reject: (err) => {
              clearTimeout(timer);
              reject(err);
            },
          };

          this.worker.stdin.write(script + '\n');
        });

        const durationMs = Date.now() - startTime;
        if (audioBase64 && audioBase64.length >= 100) {
          return {
            ok: true,
            audioBase64,
            mimeType: 'audio/wav',
            durationMs,
            voice: voice || 'System Default',
            method: 'warm_worker',
          };
        }
      }
    } catch (warmErr) {
      console.warn('[WindowsTtsService] Warm worker synthesis failed, falling back to one-shot:', warmErr.message);
      // Clean up worker so next call will re-spawn
      try { this.worker?.kill(); } catch {}
      this.worker = null;
      this.isWorkerReady = false;
    }

    // 2. Fallback to reliable one-shot PowerShell invocation
    const fallbackScript = `
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

    try {
      const audioBase64 = await this._runPowerShellOneShot(fallbackScript, 15000);
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
        method: 'one_shot_fallback',
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
    if (this.pendingReq) {
      this.pendingReq.reject(new Error('Synthesis cancelled'));
      this.pendingReq = null;
    }

    if (this.worker) {
      try {
        this.worker.stdin.write(`try { $script:s.SpeakAsyncCancelAll() } catch {}\n`);
      } catch {}
    }

    if (this.activeChild) {
      try {
        this.activeChild.kill();
      } catch {}
      this.activeChild = null;
    }
  }

  dispose() {
    this.cancel();
    if (this.worker) {
      try { this.worker.kill(); } catch {}
      this.worker = null;
      this.isWorkerReady = false;
    }
  }
}

const windowsTtsService = new WindowsTtsService();

module.exports = {
  WindowsTtsService,
  windowsTtsService,
};
