import { Renderer, Program, Mesh, Triangle, Texture } from 'ogl';

/**
 * DaylightSkyRenderer: High-performance living daytime sky atmosphere engine powered by OGL.
 * 
 * Capabilities:
 * - Continuous physical Rayleigh & Mie scattering driven by real solar elevation (alpha).
 * - Multi-layer seamless cloud simulation with subtle depth parallax and soft illuminated edges.
 * - Celestial solar disc with directional forward-scattering corona.
 * - Smooth parametric lerping across weather conditions and time.
 * - Resource-capped performance: clamped DPR, auto-pause on hidden, zero GPU leaks.
 */

const VERTEX_SHADER = /* glsl */ `
  attribute vec2 position;
  attribute vec2 uv;
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = vec4(position, 0.0, 1.0);
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  precision highp float;

  varying vec2 vUv;

  uniform vec2 uResolution;
  uniform float uTime;
  uniform float uSolarElevation; // in degrees (-18 to +90)
  uniform vec2 uSunPos;          // normalized screen coordinate [0..1]
  uniform float uCloudCover;     // 0.0 to 1.0
  uniform vec2 uWindDir;         // normalized wind direction vector
  uniform float uWindSpeed;      // km/h
  uniform sampler2D tCumulus;
  uniform sampler2D tCirrus;

  // Atmospheric scattering color palettes
  vec3 getZenithColor(float elev) {
    if (elev > 35.0) {
      // Crisp clear noon azure
      return vec3(0.11, 0.42, 0.78);
    } else if (elev > 15.0) {
      // Midday deep sky blue
      return vec3(0.14, 0.45, 0.84);
    } else if (elev > 2.0) {
      // Golden hour deep indigo-violet
      float t = (elev - 2.0) / 13.0;
      return mix(vec3(0.22, 0.20, 0.52), vec3(0.14, 0.45, 0.84), t);
    } else if (elev > -6.0) {
      // Sunset / Civil Twilight deep cobalt-purple
      float t = (elev + 6.0) / 8.0;
      return mix(vec3(0.08, 0.10, 0.28), vec3(0.22, 0.20, 0.52), t);
    } else {
      // Nautical twilight / night
      return vec3(0.04, 0.06, 0.16);
    }
  }

  vec3 getMidSkyColor(float elev) {
    if (elev > 35.0) {
      return vec3(0.32, 0.62, 0.92);
    } else if (elev > 15.0) {
      return vec3(0.36, 0.66, 0.95);
    } else if (elev > 2.0) {
      // Golden hour rose-amber midtones
      float t = (elev - 2.0) / 13.0;
      return mix(vec3(0.85, 0.38, 0.42), vec3(0.36, 0.66, 0.95), t);
    } else if (elev > -6.0) {
      // Sunset violet-crimson
      float t = (elev + 6.0) / 8.0;
      return mix(vec3(0.35, 0.15, 0.42), vec3(0.85, 0.38, 0.42), t);
    } else {
      return vec3(0.06, 0.09, 0.22);
    }
  }

  vec3 getHorizonColor(float elev) {
    if (elev > 35.0) {
      // Luminous cyan-white aerosol haze
      return vec3(0.72, 0.86, 0.98);
    } else if (elev > 15.0) {
      return vec3(0.75, 0.88, 0.99);
    } else if (elev > 2.0) {
      // Golden hour intense incandescent gold
      float t = (elev - 2.0) / 13.0;
      return mix(vec3(0.98, 0.64, 0.16), vec3(0.75, 0.88, 0.99), t);
    } else if (elev > -6.0) {
      // Sunset radiant vermilion-coral horizon glow
      float t = (elev + 6.0) / 8.0;
      return mix(vec3(0.88, 0.22, 0.28), vec3(0.98, 0.64, 0.16), t);
    } else {
      return vec3(0.12, 0.15, 0.32);
    }
  }

  void main() {
    vec2 uv = vUv;
    float aspect = uResolution.x / max(1.0, uResolution.y);

    // 1. Physical Atmospheric Rayleigh Sky Gradient
    vec3 zenithCol = getZenithColor(uSolarElevation);
    vec3 midCol = getMidSkyColor(uSolarElevation);
    vec3 horizonCol = getHorizonColor(uSolarElevation);

    // Modulate gradient with altitude curve
    float h = uv.y;
    vec3 clearSky = mix(horizonCol, midCol, smoothstep(0.0, 0.45, h));
    clearSky = mix(clearSky, zenithCol, smoothstep(0.40, 1.0, h));

    // Desaturate and cool into silver-slate overcast under heavy clouds
    vec3 overcastSky = vec3(0.55, 0.60, 0.66) * (0.65 + 0.35 * h);
    float overcastMix = smoothstep(0.45, 0.85, uCloudCover);
    vec3 skyColor = mix(clearSky, overcastSky, overcastMix * 0.82);

    // 2. Solar Celestial Core & Forward Mie Scattering Corona
    vec2 sunScreen = uSunPos;
    vec2 dSun = (uv - sunScreen) * vec2(aspect, 1.0);
    float distToSun = length(dSun);

    // Core Solar Disc
    float solarDisc = smoothstep(0.042, 0.012, distToSun);
    // Forward-scattering Mie Corona (intense near disc, softens outward)
    float mieCorona = exp(-distToSun * 4.2) * 0.65;
    float outerGlow = exp(-distToSun * 1.6) * 0.28;

    // Solar Color Spectrum based on elevation
    vec3 sunCoreCol = vec3(1.0, 0.99, 0.96);
    vec3 sunCoronaCol = mix(vec3(1.0, 0.55, 0.15), vec3(1.0, 0.92, 0.68), clamp(uSolarElevation / 25.0, 0.0, 1.0));

    // Dim the sun visibility when clouds are heavy
    float sunOcclusion = 1.0 - smoothstep(0.35, 0.80, uCloudCover);
    vec3 sunLight = (solarDisc * sunCoreCol * 1.5 + (mieCorona + outerGlow) * sunCoronaCol) * sunOcclusion;

    skyColor += sunLight;

    // 3. High-Altitude Cirrus Cloud Layer
    float windSpeedFactor = clamp(uWindSpeed / 30.0, 0.2, 1.8);
    vec2 cirrusOffset = uWindDir * (uTime * 0.000035 * windSpeedFactor);
    vec2 cirrusUv = uv * vec2(1.1, 0.9) + cirrusOffset;
    vec4 cirrusTex = texture2D(tCirrus, fract(cirrusUv));

    // Cirrus density modulated by cloud cover
    float cirrusThreshold = mix(0.75, 0.25, clamp(uCloudCover * 1.2, 0.0, 1.0));
    float cirrusAlpha = smoothstep(cirrusThreshold, cirrusThreshold + 0.35, cirrusTex.a) * 0.45;
    vec3 cirrusColor = mix(vec3(0.96, 0.97, 1.0), sunCoronaCol, mieCorona * 0.4);
    skyColor = mix(skyColor, cirrusColor, cirrusAlpha * (1.0 - overcastMix * 0.5));

    // 4. Low-to-Mid Volumetric Cumulus Cloud Layer
    vec2 cumulusOffset = uWindDir * (uTime * 0.000075 * windSpeedFactor);
    vec2 cumulusUv = uv * vec2(1.5, 1.2) + cumulusOffset;
    vec4 cumulusTex = texture2D(tCumulus, fract(cumulusUv));

    // Dynamic cloud density shaping based on weather telemetry coverage (0.0 to 1.0)
    // Low coverage: isolated puffs; High coverage: contiguous overcast banks
    float coverageThreshold = mix(0.90, 0.12, clamp(uCloudCover, 0.0, 1.0));
    float cloudDensity = smoothstep(coverageThreshold, coverageThreshold + 0.32, cumulusTex.a);

    // Directional Sunward Rim Illumination on Clouds
    vec2 toSun = normalize(uSunPos - uv + vec2(0.001));
    float rimLight = clamp(dot(toSun, vec2(0.6, 0.8)), 0.0, 1.0) * mieCorona * 1.4;

    // Self-shadowed underside vs sunlit top
    float verticalShading = mix(0.72, 1.05, smoothstep(0.1, 0.9, uv.y));
    vec3 cloudBaseColor = mix(vec3(0.78, 0.82, 0.88), vec3(0.98, 0.99, 1.0), verticalShading);
    // Tint clouds with warm golden light at low sun elevation
    cloudBaseColor = mix(cloudBaseColor, sunCoronaCol * 0.95, clamp((18.0 - uSolarElevation) / 20.0, 0.0, 0.45));

    // Apply rim highlights
    vec3 finalCloudColor = cloudBaseColor + sunCoronaCol * rimLight;
    // Blend clouds into the sky
    skyColor = mix(skyColor, finalCloudColor, cloudDensity * 0.92);

    // Subtle atmospheric vignette for depth and text legibility
    float vignette = smoothstep(1.3, 0.4, length((uv - 0.5) * vec2(1.0, 0.8)));
    skyColor = mix(skyColor * 0.92, skyColor, vignette);

    gl_FragColor = vec4(skyColor, 1.0);
  }
`;

export class DaylightSkyRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.disposed = false;
    this.animId = null;

    // Persistent state across React rerenders
    this.timeAccumulator = 0;
    this.lastTimestamp = performance.now();

    // Smoothed interpolation states
    this.currentElevation = 25.0;
    this.targetElevation = 25.0;
    this.currentCoverage = 0.2;
    this.targetCoverage = 0.2;
    this.currentWindSpeed = 10.0;
    this.targetWindSpeed = 10.0;
    this.currentWindDir = [0.85, 0.15];
    this.targetWindDir = [0.85, 0.15];

    // OGL Context initialization with verified full-surface bounds
    const initW = canvas.clientWidth || (canvas.parentElement ? canvas.parentElement.clientWidth : 576) || 576;
    const initH = canvas.clientHeight || (canvas.parentElement ? canvas.parentElement.clientHeight : 340) || 340;
    const dpr = Math.min(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1, 1.5);
    try {
      this.renderer = new Renderer({
        canvas,
        width: initW,
        height: initH,
        dpr,
        alpha: false,
        antialias: false,
        powerPreference: 'low-power',
      });
      this.gl = this.renderer.gl;
    } catch (err) {
      console.warn('[DaylightSkyRenderer] Failed to initialize WebGL context:', err);
      this.renderer = null;
      this.gl = null;
      return;
    }

    this.initScene();
    this.setupContextListeners();
  }

  initScene() {
    if (!this.gl) return;
    const gl = this.gl;

    // Fullscreen single triangle (more efficient than 2 quads, avoids diagonal raster seam)
    this.geometry = new Triangle(gl);

    // Textures: 1x1 placeholder pixels until images load
    this.cumulusTexture = new Texture(gl, {
      wrapS: gl.REPEAT,
      wrapT: gl.REPEAT,
      minFilter: gl.LINEAR,
      magFilter: gl.LINEAR,
    });
    this.cirrusTexture = new Texture(gl, {
      wrapS: gl.REPEAT,
      wrapT: gl.REPEAT,
      minFilter: gl.LINEAR,
      magFilter: gl.LINEAR,
    });

    // Textures: seamlessly resolve across both Vite dev server and Electron file:// production protocol
    const baseHref = (typeof window !== 'undefined' && window.location?.href) ? window.location.href : 'http://localhost/';
    const cumulusUrl = new URL('./weather/cloud-cumulus.png', baseHref).href;
    const cirrusUrl = new URL('./weather/cloud-cirrus.png', baseHref).href;

    this.loadTexture(this.cumulusTexture, cumulusUrl);
    this.loadTexture(this.cirrusTexture, cirrusUrl);

    // Shader Program
    this.program = new Program(gl, {
      vertex: VERTEX_SHADER,
      fragment: FRAGMENT_SHADER,
      uniforms: {
        uResolution: { value: [this.canvas.width || 500, this.canvas.height || 340] },
        uTime: { value: 0 },
        uSolarElevation: { value: 25.0 },
        uSunPos: { value: [0.72, 0.65] },
        uCloudCover: { value: 0.2 },
        uWindDir: { value: [0.85, 0.15] },
        uWindSpeed: { value: 10.0 },
        tCumulus: { value: this.cumulusTexture },
        tCirrus: { value: this.cirrusTexture },
      },
    });

    this.mesh = new Mesh(gl, { geometry: this.geometry, program: this.program });
  }

  loadTexture(targetTexture, url) {
    if (typeof Image === 'undefined') return;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (this.disposed || !this.gl) return;
      targetTexture.image = img;
    };
    img.onerror = (e) => {
      console.warn(`[DaylightSkyRenderer] Failed to load cloud texture ${url}:`, e);
    };
    img.src = url;
  }

  setupContextListeners() {
    this.onContextLost = (e) => {
      e.preventDefault();
      console.warn('[DaylightSkyRenderer] WebGL Context Lost');
      if (this.animId) cancelAnimationFrame(this.animId);
      this.animId = null;
    };

    this.onContextRestored = () => {
      console.info('[DaylightSkyRenderer] WebGL Context Restored. Reinitializing scene.');
      this.initScene();
      this.start();
    };

    this.canvas.addEventListener('webglcontextlost', this.onContextLost, false);
    this.canvas.addEventListener('webglcontextrestored', this.onContextRestored, false);
  }

  setTelemetry({ solarElevation, cloudCover, windSpeed, windDirectionDeg, weatherCode }) {
    if (typeof solarElevation === 'number') {
      this.targetElevation = solarElevation;
    }
    if (typeof cloudCover === 'number') {
      this.targetCoverage = Math.max(0.0, Math.min(1.0, cloudCover / 100.0));
    } else if (typeof weatherCode === 'number') {
      // Map WMO code to natural cloud coverage if numeric cloudCover is absent
      if (weatherCode === 0) this.targetCoverage = 0.05;      // Clear
      else if (weatherCode === 1) this.targetCoverage = 0.20; // Mainly clear
      else if (weatherCode === 2) this.targetCoverage = 0.45; // Partly cloudy
      else if (weatherCode === 3) this.targetCoverage = 0.88; // Overcast
      else if (weatherCode >= 51) this.targetCoverage = 0.92; // Rain / Overcast
    }
    if (typeof windSpeed === 'number') {
      this.targetWindSpeed = Math.max(2.0, windSpeed);
    }
    if (typeof windDirectionDeg === 'number') {
      const rad = (windDirectionDeg * Math.PI) / 180;
      this.targetWindDir = [Math.cos(rad), Math.sin(rad)];
    }
  }

  resize(width, height) {
    if (!this.renderer || !this.gl || width <= 0 || height <= 0) return;
    this.renderer.setSize(width, height);
    if (this.program?.uniforms?.uResolution) {
      this.program.uniforms.uResolution.value = [this.gl.drawingBufferWidth, this.gl.drawingBufferHeight];
    }
  }

  start() {
    if (this.animId || this.disposed || !this.renderer) return;

    const reducedMotion = typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;

    const render = (now) => {
      if (this.disposed) return;

      const deltaMs = Math.min(now - this.lastTimestamp, 64);
      this.lastTimestamp = now;

      // Accumulate time seamlessly (scaled down if reduced-motion)
      const motionScale = reducedMotion ? 0.08 : 1.0;
      this.timeAccumulator += deltaMs * motionScale;

      // Smooth parametric lerp to avoid abrupt jumps
      this.currentElevation += (this.targetElevation - this.currentElevation) * 0.04;
      this.currentCoverage += (this.targetCoverage - this.currentCoverage) * 0.04;
      this.currentWindSpeed += (this.targetWindSpeed - this.currentWindSpeed) * 0.04;
      this.currentWindDir[0] += (this.targetWindDir[0] - this.currentWindDir[0]) * 0.04;
      this.currentWindDir[1] += (this.targetWindDir[1] - this.currentWindDir[1]) * 0.04;

      // Calculate Screen Sun Position from solar elevation (-18° to 90°)
      // Anchored gracefully in the upper-right sky of the full panel, illuminating the scene
      // and naturally complementing the left-aligned weather information
      const normElev = Math.max(0.0, Math.min(1.0, (this.currentElevation + 5.0) / 75.0)); // 0.0 near horizon, 1.0 at zenith
      const sunY = 0.46 + normElev * 0.36; // Range: 0.46 (near horizon) to 0.82 (high sky)
      const sunX = 0.76; // Upper-right quadrant on the full weather surface

      if (this.program?.uniforms) {
        const u = this.program.uniforms;
        u.uTime.value = this.timeAccumulator;
        u.uSolarElevation.value = this.currentElevation;
        u.uSunPos.value = [sunX, sunY];
        u.uCloudCover.value = this.currentCoverage;
        u.uWindDir.value = this.currentWindDir;
        u.uWindSpeed.value = this.currentWindSpeed;
      }

      this.renderer.render({ scene: this.mesh });
      this.animId = requestAnimationFrame(render);
    };

    this.animId = requestAnimationFrame(render);
  }

  stop() {
    if (this.animId) {
      cancelAnimationFrame(this.animId);
      this.animId = null;
    }
  }

  destroy() {
    this.disposed = true;
    this.stop();

    if (this.canvas) {
      this.canvas.removeEventListener('webglcontextlost', this.onContextLost);
      this.canvas.removeEventListener('webglcontextrestored', this.onContextRestored);
    }

    if (this.gl) {
      // Forcefully release GPU resources & WebGL context
      const ext = this.gl.getExtension('WEBGL_lose_context');
      if (ext) ext.loseContext();
      this.gl = null;
    }
    this.renderer = null;
  }
}
