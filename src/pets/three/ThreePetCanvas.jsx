import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/**
 * ThreePetCanvas: Real 3D Desktop Pet Canvas.
 * Renders on a transparent WebGL canvas with soft desktop lighting.
 * Supports external GLB models (with GLTFLoader & AnimationMixer)
 * as well as a fully rigged, stylized 3D Chibi Kitten companion with
 * natural quadruped gait, 3D cursor tracking, fluid tail swish, and breathing.
 */
export default function ThreePetCanvas({
  state = 'sit',
  mood = 'normal',
  facing = 1,
  musicAccent = '#ff869a',
  scale = 100,
  onPet,
}) {
  const mountRef = useRef(null);
  const stateRef = useRef(state);
  const moodRef = useRef(mood);
  const facingRef = useRef(facing);
  const scaleRef = useRef(scale);
  const cursorRef = useRef({ x: 0, y: 0 });

  stateRef.current = state;
  moodRef.current = mood;
  facingRef.current = facing;
  scaleRef.current = scale;

  const [hearts, setHearts] = useState([]);

  // Track global cursor for 3D head-tracking
  useEffect(() => {
    const handlePointerMove = (e) => {
      const el = mountRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height * 0.45;
      cursorRef.current = {
        x: Math.max(-1, Math.min(1, (e.clientX - centerX) / 250)),
        y: Math.max(-1, Math.min(1, (e.clientY - centerY) / 200)),
      };
    };
    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    return () => window.removeEventListener('pointermove', handlePointerMove);
  }, []);

  const handleCanvasClick = (e) => {
    e.stopPropagation();
    onPet?.();
    const id = Date.now();
    setHearts((prev) => [...prev, id]);
    setTimeout(() => {
      setHearts((prev) => prev.filter((h) => h !== id));
    }, 1200);
  };

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = 140;
    const height = 120;

    // 1. Scene & Renderer
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(36, width / height, 0.1, 100);
    camera.position.set(0, 0.4, 3.8);
    camera.lookAt(0, 0.1, 0);

    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      powerPreference: 'low-power',
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.shadowMap.enabled = false; // lightweight for desktop companion
    container.appendChild(renderer.domElement);

    // 2. Lighting - Soft warm daylight + cool rim light for stylized character
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xfff7e8, 1.4);
    dirLight.position.set(2, 4, 3);
    scene.add(dirLight);

    const rimLight = new THREE.DirectionalLight(0xaad4ff, 0.7);
    rimLight.position.set(-3, 1, -2);
    scene.add(rimLight);

    // 3. Companion Rig Hierarchy
    const rootGroup = new THREE.Group();
    scene.add(rootGroup);

    let mixer = null;
    let customModel = null;

    // Shared references for procedural 3D kitten
    const proceduralRig = {
      head: null,
      eyes: [],
      ears: [],
      tail: null,
      legs: {},
      bell: null,
      body: null,
    };

    // Build stylized 3D Chibi Kitten
    const buildStylizedKitten = () => {
      const furMat = new THREE.MeshStandardMaterial({
        color: 0xffd9b3,
        roughness: 0.55,
        metalness: 0.05,
      });
      const furWhiteMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.5,
        metalness: 0.05,
      });
      const innerEarMat = new THREE.MeshStandardMaterial({
        color: 0xffa4b4,
        roughness: 0.6,
      });
      const eyeMat = new THREE.MeshStandardMaterial({
        color: 0x181a20,
        roughness: 0.2,
      });
      const collarMat = new THREE.MeshStandardMaterial({
        color: 0xef3b4e,
        roughness: 0.35,
      });
      const bellMat = new THREE.MeshStandardMaterial({
        color: 0xffc83b,
        metalness: 0.85,
        roughness: 0.2,
      });

      // Body (chibi plump egg shape)
      const bodyGeo = new THREE.SphereGeometry(0.55, 24, 20);
      bodyGeo.scale(1, 1.1, 1.15);
      const bodyMesh = new THREE.Mesh(bodyGeo, furMat);
      bodyMesh.position.set(0, 0, 0);
      rootGroup.add(bodyMesh);
      proceduralRig.body = bodyMesh;

      // Chest white bib patch
      const bibGeo = new THREE.SphereGeometry(0.35, 16, 16);
      bibGeo.scale(0.9, 1.1, 0.4);
      const bibMesh = new THREE.Mesh(bibGeo, furWhiteMat);
      bibMesh.position.set(0, 0.08, 0.45);
      bodyMesh.add(bibMesh);

      // Head Group
      const headGroup = new THREE.Group();
      headGroup.position.set(0, 0.62, 0.2);
      rootGroup.add(headGroup);
      proceduralRig.head = headGroup;

      const headGeo = new THREE.SphereGeometry(0.58, 28, 24);
      headGeo.scale(1.15, 1.0, 1.05);
      const headMesh = new THREE.Mesh(headGeo, furMat);
      headGroup.add(headMesh);

      // Muzzle / Snout white
      const muzzleGeo = new THREE.SphereGeometry(0.24, 16, 16);
      muzzleGeo.scale(1.2, 0.8, 0.9);
      const muzzleMesh = new THREE.Mesh(muzzleGeo, furWhiteMat);
      muzzleMesh.position.set(0, -0.15, 0.48);
      headGroup.add(muzzleMesh);

      // Cute Nose
      const noseGeo = new THREE.ConeGeometry(0.04, 0.05, 12);
      const noseMat = new THREE.MeshStandardMaterial({ color: 0xff8ca0, roughness: 0.4 });
      const noseMesh = new THREE.Mesh(noseGeo, noseMat);
      noseMesh.rotation.x = Math.PI;
      noseMesh.position.set(0, -0.09, 0.68);
      headGroup.add(noseMesh);

      // Big 3D Chibi Eyes
      [-0.26, 0.26].forEach((x) => {
        const eyeGeo = new THREE.SphereGeometry(0.12, 18, 18);
        eyeGeo.scale(0.85, 1.15, 0.65);
        const eyeMesh = new THREE.Mesh(eyeGeo, eyeMat);
        eyeMesh.position.set(x, 0.05, 0.52);

        // Highlight glint
        const glintGeo = new THREE.SphereGeometry(0.038, 10, 10);
        const glintMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
        const glint = new THREE.Mesh(glintGeo, glintMat);
        glint.position.set(x > 0 ? 0.03 : -0.03, 0.05, 0.1);
        eyeMesh.add(glint);

        headGroup.add(eyeMesh);
        proceduralRig.eyes.push(eyeMesh);
      });

      // Ears (Cute curved triangles)
      [-0.42, 0.42].forEach((x, idx) => {
        const earGroup = new THREE.Group();
        earGroup.position.set(x, 0.46, -0.05);
        earGroup.rotation.z = idx === 0 ? 0.35 : -0.35;

        const earGeo = new THREE.ConeGeometry(0.22, 0.38, 16);
        earGeo.scale(1, 1, 0.55);
        const earMesh = new THREE.Mesh(earGeo, furMat);
        earGroup.add(earMesh);

        const innerEarGeo = new THREE.ConeGeometry(0.14, 0.28, 12);
        innerEarGeo.scale(1, 1, 0.4);
        const innerEar = new THREE.Mesh(innerEarGeo, innerEarMat);
        innerEar.position.set(0, -0.02, 0.04);
        earGroup.add(innerEar);

        headGroup.add(earGroup);
        proceduralRig.ears.push(earGroup);
      });

      // Collar with iconic Bell
      const collarGeo = new THREE.TorusGeometry(0.46, 0.055, 12, 28);
      collarGeo.rotateX(Math.PI / 2);
      const collarMesh = new THREE.Mesh(collarGeo, collarMat);
      collarMesh.position.set(0, 0.25, 0.12);
      rootGroup.add(collarMesh);

      const bellGeo = new THREE.SphereGeometry(0.12, 16, 16);
      const bellMesh = new THREE.Mesh(bellGeo, bellMat);
      bellMesh.position.set(0, 0.15, 0.58);
      rootGroup.add(bellMesh);
      proceduralRig.bell = bellMesh;

      // 4 Articulated Quadruped Legs
      const legGeo = new THREE.CapsuleGeometry(0.12, 0.24, 12, 12);
      const legConfigs = {
        fl: { x: -0.28, y: -0.42, z: 0.32 },
        fr: { x: 0.28, y: -0.42, z: 0.32 },
        bl: { x: -0.32, y: -0.44, z: -0.3 },
        br: { x: 0.32, y: -0.44, z: -0.3 },
      };

      Object.entries(legConfigs).forEach(([key, pos]) => {
        const legGroup = new THREE.Group();
        legGroup.position.set(pos.x, pos.y, pos.z);

        const legMesh = new THREE.Mesh(legGeo, furWhiteMat);
        legMesh.position.set(0, -0.1, 0);
        legGroup.add(legMesh);

        rootGroup.add(legGroup);
        proceduralRig.legs[key] = legGroup;
      });

      // Expressive 3D Tail
      const tailCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, -0.1, -0.5),
        new THREE.Vector3(0, 0.18, -0.72),
        new THREE.Vector3(0.12, 0.45, -0.68),
        new THREE.Vector3(0.04, 0.62, -0.58),
      ]);
      const tailGeo = new THREE.TubeGeometry(tailCurve, 20, 0.065, 10, false);
      const tailMesh = new THREE.Mesh(tailGeo, furMat);
      rootGroup.add(tailMesh);
      proceduralRig.tail = tailMesh;
    };

    // Attempt to load user-supplied custom model if available in public/models/
    const loader = new GLTFLoader();
    loader.load(
      'models/chibi_kitten.glb',
      (gltf) => {
        customModel = gltf.scene;
        // Normalize size & center
        const box = new THREE.Box3().setFromObject(customModel);
        const size = box.getSize(new THREE.Vector3());
        const maxAxis = Math.max(size.x, size.y, size.z) || 1;
        const targetScale = 1.6 / maxAxis;
        customModel.scale.setScalar(targetScale);
        customModel.position.y = -0.35;

        if (gltf.animations && gltf.animations.length > 0) {
          mixer = new THREE.AnimationMixer(customModel);
          const clip = gltf.animations[0];
          const action = mixer.clipAction(clip);
          action.play();
        }

        rootGroup.add(customModel);
      },
      undefined,
      () => {
        // Fallback: load procedural stylized 3D Chibi Kitten
        buildStylizedKitten();
      }
    );

    // 4. Animation / Render Loop
    let animId = null;
    let clock = new THREE.Clock();
    let walkPhase = 0;
    let currentYRot = 0;

    const animate = () => {
      animId = requestAnimationFrame(animate);
      const delta = Math.min(clock.getDelta(), 0.1);
      const t = clock.getElapsedTime();

      if (mixer) {
        mixer.update(delta);
      }

      const currentState = stateRef.current;
      const currentFacing = facingRef.current;
      const currentScale = scaleRef.current / 100;

      // Smooth horizontal facing rotation
      const targetFacingAngle = currentFacing === -1 ? -Math.PI / 2 : Math.PI / 2;
      // Slight 3/4 angle toward screen for charming depth
      const targetRotY = currentFacing === -1 ? -Math.PI * 0.42 : Math.PI * 0.42;
      currentYRot += (targetRotY - currentYRot) * Math.min(1, delta * 6);
      rootGroup.rotation.y = currentYRot;

      // Scale
      rootGroup.scale.setScalar(currentScale * 0.88);

      // Procedural animations if using stylized model
      if (proceduralRig.head) {
        // Cursor-directed 3D head turning
        const targetHeadX = cursorRef.current.y * 0.28;
        const targetHeadY = cursorRef.current.x * 0.45;
        proceduralRig.head.rotation.x += (targetHeadX - proceduralRig.head.rotation.x) * 0.1;
        proceduralRig.head.rotation.y += (targetHeadY - proceduralRig.head.rotation.y) * 0.1;

        // Tail swishing
        if (proceduralRig.tail) {
          proceduralRig.tail.rotation.z = Math.sin(t * 2.6) * 0.22;
          proceduralRig.tail.rotation.y = Math.cos(t * 1.8) * 0.15;
        }

        // Bell gentle jingle
        if (proceduralRig.bell) {
          proceduralRig.bell.rotation.z = Math.sin(t * 3.2) * 0.1;
        }

        // State machine procedural gait & posture
        if (currentState === 'walk') {
          walkPhase += delta * 7.5;
          const legAmp = 0.55;

          if (proceduralRig.legs.fl) proceduralRig.legs.fl.rotation.x = Math.sin(walkPhase) * legAmp;
          if (proceduralRig.legs.fr) proceduralRig.legs.fr.rotation.x = -Math.sin(walkPhase) * legAmp;
          if (proceduralRig.legs.bl) proceduralRig.legs.bl.rotation.x = -Math.sin(walkPhase) * legAmp;
          if (proceduralRig.legs.br) proceduralRig.legs.br.rotation.x = Math.sin(walkPhase) * legAmp;

          // Body vertical bobbing
          proceduralRig.body.position.y = Math.abs(Math.sin(walkPhase)) * 0.05;
          proceduralRig.head.position.y = 0.62 + Math.sin(walkPhase * 2) * 0.03;
        } else if (currentState === 'sleep') {
          // Slow resting breathing
          const breath = Math.sin(t * 1.4) * 0.03;
          proceduralRig.body.scale.set(1.05, 0.95 + breath, 1.15);
          proceduralRig.head.position.y = 0.48;
          proceduralRig.head.rotation.z = -0.15;
          // Reset legs
          Object.values(proceduralRig.legs).forEach((leg) => {
            if (leg) leg.rotation.x = 0;
          });
        } else if (currentState === 'dance') {
          // Rhythm bounce
          const bounce = Math.abs(Math.sin(t * 6.5)) * 0.1;
          proceduralRig.body.position.y = bounce;
          proceduralRig.head.rotation.z = Math.sin(t * 6.5) * 0.18;
          if (proceduralRig.bell) proceduralRig.bell.rotation.x = Math.sin(t * 13) * 0.35;
        } else {
          // Idle / Sit: Gentle breathing
          const breathe = Math.sin(t * 2.2) * 0.025;
          proceduralRig.body.scale.set(1, 1.1 + breathe, 1.15);
          proceduralRig.body.position.y = 0;
          proceduralRig.head.position.y = 0.62 + breathe * 0.5;
          Object.values(proceduralRig.legs).forEach((leg) => {
            if (leg) leg.rotation.x = 0;
          });
        }
      }

      renderer.render(scene, camera);
    };

    animate();

    // 5. Cleanup on Unmount
    return () => {
      cancelAnimationFrame(animId);
      renderer.dispose();
      if (renderer.domElement && container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      scene.clear();
    };
  }, []);

  return (
    <div
      ref={mountRef}
      className="three-pet-canvas"
      onClick={handleCanvasClick}
      style={{
        width: 140,
        height: 120,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        cursor: 'pointer',
      }}
    >
      {hearts.map((id) => (
        <span key={id} className="pet-floating-heart" aria-hidden="true">
          ♥
        </span>
      ))}
    </div>
  );
}
