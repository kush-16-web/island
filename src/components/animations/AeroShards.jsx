import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import './AeroShards.css';

/**
 * AeroShards — Official ReactBits 3D Folded Chrome Foil Ribbon Engine
 *
 * Dual-stream wind sculpture of folded metallic foil shards:
 * - Ribbon 0 (Foreground): Bold, gleaming chrome stream swooping across mid/lower deck
 * - Ribbon 1 (Background): Delicate miniature stream weaving high in the upper void
 * - Soft, visible 3D floating constellation bokeh orbs with gentle sub-bass breath
 * - Asymmetrical chiseled chrome shard geometry with punchy acoustic note flutter (fast attack, smooth decay)
 * - Dynamic album color integration with real-time musical audio-reactivity
 */

const SHARD_COUNT = 340;
const FOREGROUND_COUNT = 210;
const DOT_COUNT = 65;

const toRgb = (color) => {
  if (!color) return [0.75, 0.45, 0.2];
  const s = String(color).trim();

  if (s.startsWith('#') || /^[0-9a-f]{3,6}$/i.test(s)) {
    let hex = s.replace('#', '');
    if (hex.length === 3) hex = hex.replace(/./g, (c) => c + c);
    if (/^[0-9a-f]{6}/i.test(hex)) {
      return [0, 2, 4].map((index) => parseInt(hex.slice(index, index + 2), 16) / 255);
    }
  }

  if (typeof document !== 'undefined') {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 1;
      canvas.height = 1;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (ctx) {
        ctx.fillStyle = s;
        ctx.fillRect(0, 0, 1, 1);
        const data = ctx.getImageData(0, 0, 1, 1).data;
        if (data && data.length >= 3) {
          return [data[0] / 255, data[1] / 255, data[2] / 255];
        }
      }
    } catch {}
  }

  return [0.75, 0.45, 0.2];
};

// Procedural 4-facet chiseled fractured foil geometry:
// Sharp nose, offset tail, crease ridge, and two asymmetric beveled wings
function createChiseledFoilGeometry() {
  const geom = new THREE.BufferGeometry();

  const NOSE = [0.60, 0.04, 0.0];
  const TAIL = [-0.52, -0.04, 0.0];
  const CREASE = [0.02, 0.0, 0.07]; // Crease ridge peak
  const WING_TOP = [0.08, 0.32, -0.02];
  const WING_BOT = [-0.06, -0.28, -0.02];

  // 4 distinct planar facets forming a chiseled fractured chrome chip
  const vertices = new Float32Array([
    // Facet 1: Front top
    ...NOSE, ...WING_TOP, ...CREASE,
    // Facet 2: Back top
    ...TAIL, ...CREASE, ...WING_TOP,
    // Facet 3: Front bottom
    ...NOSE, ...CREASE, ...WING_BOT,
    // Facet 4: Back bottom
    ...TAIL, ...WING_BOT, ...CREASE,
  ]);

  geom.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
  geom.computeVertexNormals();
  return geom;
}

// 3D Background Constellation Bokeh Dots (markers=dots) in visible midground
function createDotsGeometry() {
  const geom = new THREE.BufferGeometry();
  const positions = new Float32Array(DOT_COUNT * 3);

  for (let i = 0; i < DOT_COUNT; i++) {
    positions[i * 3 + 0] = (Math.random() - 0.5) * 35.0;
    positions[i * 3 + 1] = (Math.random() - 0.5) * 13.0;
    positions[i * 3 + 2] = -2.0 - Math.random() * 3.0; // Visible midground (-2.0 to -5.0)
  }

  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  return geom;
}

// Shaders for Chrome Foil Shards with punchy musical note flutter & depth attenuation
const SHARD_VERTEX_SHADER = `
attribute vec4 aSeed;

varying vec3 vNormal;
varying vec3 vViewPosition;
varying vec4 vSeed;

uniform float uTime;
uniform float uBeat;

void main() {
  vSeed = aSeed;

  vec3 pos = position;

  // Asymmetrical shape variation per shard (fractured look)
  pos.y *= (0.80 + aSeed.x * 0.45);
  pos.x *= (0.85 + aSeed.y * 0.35);
  if (pos.y > 0.0) {
    pos.x += aSeed.x * 0.15 * pos.y;
  }

  // Punchy acoustic note flutter (Traveling ripple down stream)
  float notePhase = aSeed.w * 6.28 - uTime * 5.0;
  float noteFlutter = sin(notePhase) * uBeat * aSeed.z;
  
  // Aerodynamic wing curvature with punchy flutter
  float wingSide = (abs(pos.y) > 0.04) ? sign(pos.y) : (pos.y / 0.04);
  pos.z += noteFlutter * 0.30 * wingSide;

  #include <beginnormal_vertex>
  #include <defaultnormal_vertex>
  vNormal = normalize(transformedNormal);

  vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(pos, 1.0);
  vViewPosition = -mvPosition.xyz;
  gl_Position = projectionMatrix * mvPosition;
}
`;

const SHARD_FRAGMENT_SHADER = `
precision highp float;

uniform vec3 uColor;
uniform float uBeat;
uniform float uTime;

varying vec3 vNormal;
varying vec3 vViewPosition;
varying vec4 vSeed;

void main() {
  vec3 viewDir = normalize(vViewPosition);
  vec3 normal = normalize(vNormal);

  // Depth atmospheric attenuation:
  // Foreground shards are brilliant and crisp; deep background shards are softer and deeper
  float depthFactor = clamp((vViewPosition.z + 5.5) / 5.0, 0.42, 1.0);

  // Sharp Fresnel rim reflection for polished chrome foil
  float NdotV = abs(dot(normal, viewDir));
  float fresnel = pow(1.0 - NdotV, 2.8);

  // Key light (overhead brilliant reflection) & Rim fill
  vec3 light1 = normalize(vec3(0.40, 0.90, 0.95));
  vec3 light2 = normalize(vec3(-0.70, -0.30, 0.65));

  float diff1 = max(0.0, dot(normal, light1));
  float spec1 = pow(max(0.0, dot(reflect(-light1, normal), viewDir)), 40.0);
  float spec2 = pow(max(0.0, dot(reflect(-light2, normal), viewDir)), 18.0);

  // Dark metallic chrome body reflecting the album's tint
  vec3 darkMetal = mix(vec3(0.03, 0.04, 0.07), uColor * 0.42, 0.50);
  vec3 midMetal = mix(darkMetal, uColor * 1.35, diff1 * 0.70);

  // Liquid chrome specular sheen on facets
  vec3 chromeSheen = (spec1 * 1.50 + spec2 * 0.42) * vec3(1.0, 0.99, 0.95);

  // Acoustic note ripple traveling along the stream:
  float noteRipple = max(0.0, sin(vSeed.w * 6.28 - uTime * 5.0));
  chromeSheen *= (1.0 + uBeat * 0.65 + noteRipple * uBeat * 0.70);

  vec3 finalColor = (midMetal + chromeSheen + (fresnel * uColor * 0.85)) * depthFactor;

  // Crisp metallic opacity with depth attenuation
  float alpha = clamp((0.82 + spec1 * 0.18 + fresnel * 0.12) * depthFactor, 0.0, 1.0);

  gl_FragColor = vec4(finalColor, alpha);
}
`;

// Shaders for Floating Constellation Bokeh Dots (markers=dots)
const DOT_VERTEX_SHADER = `
uniform float uTime;
uniform float uBeat;
varying float vAlpha;

void main() {
  vec3 pos = position;
  pos.x += sin(uTime * 0.20 + position.y * 0.5) * 0.30;
  pos.y += cos(uTime * 0.16 + position.x * 0.5) * 0.22;

  vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mvPosition;

  // Rich, visible glowing bokeh size (6px to 11px) with gentle sub-bass breath (+14%)
  float breath = 1.0 + uBeat * 0.14;
  gl_PointSize = clamp((85.0 / -mvPosition.z) * breath, 5.5, 12.0);
  vAlpha = clamp(0.55 + 0.30 * sin(uTime * 1.0 + position.x * 1.5 + position.y), 0.30, 0.90);
}
`;

const DOT_FRAGMENT_SHADER = `
precision highp float;
uniform vec3 uColor;
varying float vAlpha;

void main() {
  vec2 coord = gl_PointCoord - vec2(0.5);
  float dist = length(coord);
  if (dist > 0.5) discard;

  // Gorgeous glowing bokeh orb: smooth celestial outer halo + bright core
  float halo = smoothstep(0.5, 0.0, dist);
  float core = smoothstep(0.22, 0.0, dist) * 0.45;
  float intensity = halo + core;

  vec3 dotColor = mix(vec3(0.95, 0.98, 1.0), uColor, 0.32);
  gl_FragColor = vec4(dotColor, vAlpha * intensity * 0.80);
}
`;

export default function AeroShards({
  color = '#ca8a04',
  speed = 0.35,
  paused = false,
  beatPulse = 0,
  bloomPulse = 0,
  className = '',
  style = {},
}) {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const animRef = useRef(null);

  const stateRef = useRef({ color, speed, paused, beatPulse, bloomPulse });
  stateRef.current = { color, speed, paused, beatPulse, bloomPulse };

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 100);
    camera.position.set(0, 0, 10.5);

    const renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(container.clientWidth, container.clientHeight, false);

    const rgb = toRgb(color);

    // 1. Shard Mesh (Chiseled Chrome Foil)
    const foilGeometry = createChiseledFoilGeometry();

    // Assign per-instance seeds for asymmetrical shape & musical note ripple
    const seedArray = new Float32Array(SHARD_COUNT * 4);
    for (let i = 0; i < SHARD_COUNT; i++) {
      seedArray[i * 4 + 0] = Math.random(); // Asymmetry
      seedArray[i * 4 + 1] = Math.random(); // Aspect ratio
      seedArray[i * 4 + 2] = 0.7 + Math.random() * 0.8; // Music flutter sensitivity
      seedArray[i * 4 + 3] = i / SHARD_COUNT; // Phase offset along stream
    }
    foilGeometry.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seedArray, 4));

    const shardMaterial = new THREE.ShaderMaterial({
      vertexShader: SHARD_VERTEX_SHADER,
      fragmentShader: SHARD_FRAGMENT_SHADER,
      uniforms: {
        uColor: { value: new THREE.Vector3(rgb[0], rgb[1], rgb[2]) },
        uBeat: { value: 0 },
        uTime: { value: 0 },
      },
      transparent: true,
      side: THREE.DoubleSide,
      blending: THREE.NormalBlending,
    });

    const instMesh = new THREE.InstancedMesh(foilGeometry, shardMaterial, SHARD_COUNT);
    scene.add(instMesh);

    // 2. Dots Particle Field (markers=dots) in visible midground
    const dotsGeometry = createDotsGeometry();
    const dotsMaterial = new THREE.ShaderMaterial({
      vertexShader: DOT_VERTEX_SHADER,
      fragmentShader: DOT_FRAGMENT_SHADER,
      uniforms: {
        uColor: { value: new THREE.Vector3(rgb[0], rgb[1], rgb[2]) },
        uBeat: { value: 0 },
        uTime: { value: 0 },
      },
      transparent: true,
      blending: THREE.AdditiveBlending,
    });
    const dotsMesh = new THREE.Points(dotsGeometry, dotsMaterial);
    scene.add(dotsMesh);

    // Procedural distribution along two distinct 3D serpentine ribbon streams:
    // Ribbon 0: Primary foreground ribbon swooping boldly across mid/lower deck
    // Ribbon 1: Distant miniature counterpoint ribbon weaving high in the upper void
    const shards = [];
    for (let i = 0; i < SHARD_COUNT; i++) {
      const isForeground = i < FOREGROUND_COUNT;
      const ribbonId = isForeground ? 0 : 1;
      const progress = isForeground ? (i / FOREGROUND_COUNT) : ((i - FOREGROUND_COUNT) / (SHARD_COUNT - FOREGROUND_COUNT));

      // Radial cluster around ribbon spine
      const clusterAngle = Math.random() * Math.PI * 2;
      const clusterRadius = ribbonId === 0 ? 0.30 + Math.random() * 0.50 : 0.20 + Math.random() * 0.35;

      shards.push({
        ribbonId,
        progress: progress + (Math.random() * 0.04),
        speedMult: ribbonId === 0 ? 0.20 + Math.random() * 0.06 : 0.16 + Math.random() * 0.05,
        clusterRadius,
        clusterAngle,
        scale: ribbonId === 0 ? 0.72 + Math.random() * 0.38 : 0.34 + Math.random() * 0.16,
        rotSpeedX: (Math.random() - 0.5) * 2.2,
        rotSpeedY: (Math.random() - 0.5) * 2.8,
        rotSpeedZ: (Math.random() - 0.5) * 1.8,
        rotX: Math.random() * Math.PI * 2,
        rotY: Math.random() * Math.PI * 2,
        rotZ: Math.random() * Math.PI * 2,
      });
    }

    const dummy = new THREE.Object3D();
    let clock = 0;
    let last = 0;
    let smoothBeat = 0;

    const render = (now) => {
      animRef.current = requestAnimationFrame(render);
      const dt = Math.min(0.05, last ? (now - last) / 1000 : 1 / 60);
      last = now;

      const { color: curCol, speed: curSpd, paused: isPaused, beatPulse: curBeat } = stateRef.current;

      // Fast Attack, Smooth Decay:
      // Catches 100% of the punch of drum kicks instantly, then decays smoothly!
      const targetBeat = curBeat || 0;
      if (targetBeat > smoothBeat) {
        smoothBeat = targetBeat;
      } else {
        smoothBeat += (targetBeat - smoothBeat) * Math.min(1.0, dt * 7.5);
      }

      const primary = toRgb(curCol);
      shardMaterial.uniforms.uColor.value.set(primary[0], primary[1], primary[2]);
      shardMaterial.uniforms.uBeat.value = smoothBeat;
      shardMaterial.uniforms.uTime.value = clock;
      dotsMaterial.uniforms.uColor.value.set(primary[0], primary[1], primary[2]);
      dotsMaterial.uniforms.uBeat.value = smoothBeat;
      dotsMaterial.uniforms.uTime.value = clock;

      if (!isPaused) {
        clock += dt;
        const flowSpd = (curSpd || 0.35) * (1.0 + smoothBeat * 0.50);

        for (let i = 0; i < SHARD_COUNT; i++) {
          const s = shards[i];
          s.progress += dt * s.speedMult * flowSpd;
          if (s.progress >= 1.0) {
            s.progress -= 1.0;
            s.clusterAngle = Math.random() * Math.PI * 2;
          }

          const t = s.progress;
          // Spline position from -18.0 to +18.0
          const x = -18.0 + t * 36.0;

          // 3D serpentine curve math:
          let spineY = 0;
          let spineZ = 0;
          let slopeY = 0;

          if (s.ribbonId === 0) {
            // Main foreground ribbon: sweeping S-curve across mid/lower deck
            const phase = t * Math.PI * 2.6 + clock * 0.65;
            spineY = Math.sin(phase) * 1.30 - 0.40;
            spineZ = 0.2 + Math.cos(phase * 0.85) * 1.20;
            slopeY = Math.cos(phase) * 1.30 * (2.6 * Math.PI / 36.0);
          } else {
            // Secondary background ribbon: weaves high in upper void at deep Z
            const phase = t * Math.PI * 2.2 + 1.8 + clock * 0.50;
            spineY = 1.70 + Math.sin(phase) * 0.90;
            spineZ = -3.8 + Math.cos(phase * 0.75) * 0.80;
            slopeY = Math.cos(phase) * 0.90 * (2.2 * Math.PI / 36.0);
          }

          // Apply tight radial clustering along ribbon spine with musical beat breathing
          const clusterSwelling = 1.0 + smoothBeat * 0.26;
          const offY = Math.sin(s.clusterAngle) * s.clusterRadius * clusterSwelling;
          const offZ = Math.cos(s.clusterAngle) * s.clusterRadius * clusterSwelling;

          const posX = x;
          const posY = spineY + offY;
          const posZ = spineZ + offZ;

          dummy.position.set(posX, posY, posZ);

          // Aerodynamic ribbon tangent alignment + fast tumbling on facets
          const pitchAngle = Math.atan2(slopeY, 1.0);
          s.rotX += dt * s.rotSpeedX;
          s.rotY += dt * s.rotSpeedY;
          s.rotZ += dt * s.rotSpeedZ;

          dummy.rotation.set(
            s.rotX * 0.45,
            s.rotY * 0.65,
            pitchAngle + s.rotZ * 0.35
          );

          // Seamless edge fade on left and right borders
          const edgeFade = Math.sin(Math.min(1.0, Math.max(0.0, t)) * Math.PI);
          const sc = s.scale * Math.pow(edgeFade, 0.4) * (1.0 + smoothBeat * 0.25);
          dummy.scale.set(sc, sc, sc);

          dummy.updateMatrix();
          instMesh.setMatrixAt(i, dummy.matrix);
        }
        instMesh.instanceMatrix.needsUpdate = true;
      }

      renderer.render(scene, camera);
    };

    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w > 0 && h > 0) {
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h, false);
      }
    };

    const ro = new ResizeObserver(handleResize);
    ro.observe(container);
    handleResize();

    animRef.current = requestAnimationFrame(render);

    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
      ro.disconnect();
      foilGeometry.dispose();
      dotsGeometry.dispose();
      shardMaterial.dispose();
      dotsMaterial.dispose();
      renderer.dispose();
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className={`aero-shards-container ${className}`.trim()}
      style={style}
      aria-hidden="true"
    >
      <canvas ref={canvasRef} className="aero-shards-canvas" />
    </div>
  );
}
