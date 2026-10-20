import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/**
 * ThreePetCanvas: Authoritative 3D Desktop Pet Engine.
 * Loads the original Sketchfab Chibi Kitten model with genuine PBR materials.
 * Features natural quadruped gait, 3D cursor tracking, breathing, and performance optimizations.
 */
export default function ThreePetCanvas({
  state = 'sit',
  mood = 'normal',
  facing = 1,
  musicAccent = '#ff869a',
  scale = 100,
  isStudio = false,
  onPet,
}) {
  const mountRef = useRef(null);
  const stateRef = useRef(state);
  const moodRef = useRef(mood);
  const facingRef = useRef(facing);
  const scaleRef = useRef(scale);
  const musicAccentRef = useRef(musicAccent);
  const cursorRef = useRef({ x: 0, y: 0 });
  const isHiddenRef = useRef(false);

  stateRef.current = state;
  moodRef.current = mood;
  facingRef.current = facing;
  scaleRef.current = scale;
  musicAccentRef.current = musicAccent;

  const [hearts, setHearts] = useState([]);
  const [modelLoaded, setModelLoaded] = useState(false);

  // Track global cursor for 3D head/gaze tracking
  useEffect(() => {
    const handlePointerMove = (e) => {
      const el = mountRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height * 0.45;
      cursorRef.current = {
        x: Math.max(-1, Math.min(1, (e.clientX - centerX) / 300)),
        y: Math.max(-1, Math.min(1, (e.clientY - centerY) / 220)),
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

    const width = isStudio ? 130 : 180;
    const height = isStudio ? 110 : 160;

    // 1. Scene & Camera
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, width / height, 0.1, 50);
    camera.position.set(0, 0.65, 4.2);
    camera.lookAt(0, 0.55, 0);

    // 2. High-efficiency transparent WebGL Renderer
    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance',
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    container.appendChild(renderer.domElement);

    // 3. Three-point Soft Studio Lighting for PBR Fur & Golden Bell
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.25);
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xfff8ee, 1.6);
    keyLight.position.set(2.5, 4.0, 3.2);
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0xb4d8ff, 0.95);
    rimLight.position.set(-3.0, 2.0, -2.5);
    scene.add(rimLight);

    const fillLight = new THREE.DirectionalLight(0xffeede, 0.6);
    fillLight.position.set(0, 0.8, 3.0);
    scene.add(fillLight);

    // 4. Kinematic Motion Rig Hierarchy
    const rootGroup = new THREE.Group();
    scene.add(rootGroup);

    // Pivot group for orientation, ground contact, and walking sway
    const pivotGroup = new THREE.Group();
    rootGroup.add(pivotGroup);

    // Articulation groups
    const breatheGroup = new THREE.Group();
    pivotGroup.add(breatheGroup);

    const gazeGroup = new THREE.Group();
    breatheGroup.add(gazeGroup);

    // 4b. Sleek Glowing Headset Accessory (Active during music playback)
    const headsetGroup = new THREE.Group();
    headsetGroup.name = 'cat-headset';
    headsetGroup.visible = false;
    gazeGroup.add(headsetGroup);

    // Headband: Matte titanium curved band bridging ears over top of head
    const bandGeo = new THREE.TorusGeometry(0.51, 0.034, 16, 48, Math.PI);
    const bandMat = new THREE.MeshStandardMaterial({
      color: 0x1f2127,
      metalness: 0.85,
      roughness: 0.28,
    });
    const bandMesh = new THREE.Mesh(bandGeo, bandMat);
    bandMesh.position.set(0, 1.05, -0.115);
    bandMesh.rotation.z = 0;
    headsetGroup.add(bandMesh);

    // Ear Cups: Metallic cushions with glowing LED rings matching ear.L and ear.R
    const cupGeo = new THREE.CylinderGeometry(0.14, 0.14, 0.07, 32);
    const cupMat = new THREE.MeshStandardMaterial({
      color: 0x16181e,
      metalness: 0.8,
      roughness: 0.3,
    });
    const ringGeo = new THREE.TorusGeometry(0.125, 0.018, 16, 32);
    const headsetGlowMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(musicAccent || '#a855f7'),
      emissive: new THREE.Color(musicAccent || '#a855f7'),
      emissiveIntensity: 1.4,
      roughness: 0.15,
    });

    // Left Cup (ear.L side at x = +0.507)
    const leftCup = new THREE.Group();
    const leftMesh = new THREE.Mesh(cupGeo, cupMat);
    leftMesh.rotation.z = Math.PI / 2;
    const leftRing = new THREE.Mesh(ringGeo, headsetGlowMat);
    leftRing.rotation.y = Math.PI / 2;
    leftRing.position.x = 0.038;
    leftCup.add(leftMesh);
    leftCup.add(leftRing);
    leftCup.position.set(0.51, 1.05, -0.115);
    leftCup.rotation.y = -0.12;
    headsetGroup.add(leftCup);

    // Right Cup (ear.R side at x = -0.505)
    const rightCup = new THREE.Group();
    const rightMesh = new THREE.Mesh(cupGeo, cupMat);
    rightMesh.rotation.z = Math.PI / 2;
    const rightRing = new THREE.Mesh(ringGeo, headsetGlowMat);
    rightRing.rotation.y = Math.PI / 2;
    rightRing.position.x = -0.038;
    rightCup.add(rightMesh);
    rightCup.add(rightRing);
    rightCup.position.set(-0.51, 1.05, -0.115);
    rightCup.rotation.y = 0.12;
    headsetGroup.add(rightCup);

    // 4c. Interactive Toy Yarn Ball (for play, batting, chasing)
    const ballGroup = new THREE.Group();
    ballGroup.name = 'cat-toy-ball';
    ballGroup.visible = false;
    scene.add(ballGroup);

    const ballGeo = new THREE.SphereGeometry(0.13, 24, 24);
    const ballMat = new THREE.MeshStandardMaterial({
      color: 0xff477e,
      roughness: 0.7,
      metalness: 0.1,
    });
    const ballMesh = new THREE.Mesh(ballGeo, ballMat);
    ballGroup.add(ballMesh);

    const threadGeo = new THREE.TorusGeometry(0.132, 0.016, 12, 32);
    const threadMat = new THREE.MeshStandardMaterial({
      color: 0xffd166,
      roughness: 0.8,
    });
    const threadMesh = new THREE.Mesh(threadGeo, threadMat);
    threadMesh.rotation.x = Math.PI / 3;
    ballGroup.add(threadMesh);

    let kittenMesh = null;
    let baseMeshScale = 1;
    let mixer = null;
    let walkAction = null;
    let bonesMap = {};
    let initialBoneRotations = {};

    // 5. Load Rigged Animated Cat Model (featuring authentic skeletal locomotion)
    const loader = new GLTFLoader();
    const modelPaths = [
      'models/toon_cat_free.glb',
      'models/tabby_kitten.glb',
      'models/tabby_kitten/source/pool2319.glb',
      'models/chibi_kitten.glb',
    ];

    const tryLoad = (idx) => {
      if (idx >= modelPaths.length) return;
      loader.load(
        modelPaths[idx],
        (gltf) => {
          kittenMesh = gltf.scene;

          // Material preservation: enhance original PBR textures with zero reduction
          kittenMesh.traverse((child) => {
            if (child.isMesh) {
              child.castShadow = false;
              child.receiveShadow = false;
              if (child.material) {
                child.material.roughness = Math.min(child.material.roughness ?? 0.65, 0.75);
                child.material.metalness = Math.max(child.material.metalness ?? 0.05, 0.1);
                child.material.needsUpdate = true;
              }
            }
          });

          // AnimationMixer for models with embedded skeletal animation tracks
          if (gltf.animations && gltf.animations.length > 0) {
            mixer = new THREE.AnimationMixer(kittenMesh);
            walkAction = mixer.clipAction(gltf.animations[0]);
            walkAction.setLoop(THREE.LoopRepeat);
          }

          // Cache bone references & default rotations for procedural states
          bonesMap = {};
          initialBoneRotations = {};
          kittenMesh.traverse((child) => {
            if (child.isBone) {
              bonesMap[child.name] = child;
              initialBoneRotations[child.name] = child.rotation.clone();
            }
          });

          // Normalize bounding box & ground paws at y = 0
          const box = new THREE.Box3().setFromObject(kittenMesh);
          const size = box.getSize(new THREE.Vector3());
          const center = box.getCenter(new THREE.Vector3());

          // Center horizontally and ground paws at y = 0
          kittenMesh.position.set(-center.x, -box.min.y, -center.z);

          // Wrap mesh in group for proportional desktop scaling & orientation
          const meshWrapper = new THREE.Group();
          meshWrapper.add(kittenMesh);

          // Proportional desktop scale with complete visibility
          const targetHeight = isStudio ? 1.35 : 1.20;
          baseMeshScale = targetHeight / (size.y || 1);
          meshWrapper.scale.setScalar(baseMeshScale);
          meshWrapper.rotation.y = 0;

          gazeGroup.add(meshWrapper);

          // Firmly attach headset to cat's head bone so it stays locked with head movement
          const headBone = bonesMap['head_018'] || bonesMap['head'];
          if (headBone) {
            if (headsetGroup.parent) headsetGroup.parent.remove(headsetGroup);
            headBone.add(headsetGroup);
            headsetGroup.position.set(0, 0, 0);
            headsetGroup.rotation.set(0, 0, 0);
            headsetGroup.scale.set(1, 1, 1);
          }

          setModelLoaded(true);
        },
        undefined,
        () => {
          tryLoad(idx + 1);
        }
      );
    };

    tryLoad(0);

    // 6. Natural Animation & Locomotion Loop
    let animId = null;
    let clock = new THREE.Clock();
    let walkPhase = 0;
    let currentYRot = 0;
    let currentPitch = 0;
    let currentRoll = 0;

    // Fullscreen and visibility pausing for 0% idle CPU/GPU usage
    let isPaused = false;

    const handleVisibility = () => {
      isPaused = document.hidden || isHiddenRef.current;
    };
    document.addEventListener('visibilitychange', handleVisibility);

    let unsubFullscreen = null;
    if (window.island?.on) {
      unsubFullscreen = window.island.on('fullscreen:change', (isFs) => {
        isHiddenRef.current = isFs;
        isPaused = isFs || document.hidden;
        if (mountRef.current) {
          mountRef.current.style.display = isFs ? 'none' : 'block';
        }
      });
    }

    const animate = () => {
      animId = requestAnimationFrame(animate);
      if (isPaused) return;

      const delta = Math.min(clock.getDelta(), 0.1);
      const t = clock.getElapsedTime();

      const currentState = stateRef.current;
      const currentFacing = facingRef.current;
      const userScale = (scaleRef.current / 100) * (isStudio ? 0.95 : 1.0);

      // Smooth horizontal turn rotation (gentle 3/4 angle facing towards screen)
      const targetRotY = currentFacing === -1 ? -0.28 : 0.28;
      currentYRot += (targetRotY - currentYRot) * Math.min(1, delta * 7.5);
      rootGroup.rotation.y = currentYRot;
      rootGroup.scale.setScalar(userScale);

      // 3D Cursor Head & Gaze Tracking
      const targetPitch = cursorRef.current.y * 0.22;
      const targetRoll = -cursorRef.current.x * 0.24 * currentFacing;
      currentPitch += (targetPitch - currentPitch) * Math.min(1, delta * 5.0);
      currentRoll += (targetRoll - currentRoll) * Math.min(1, delta * 5.0);
      gazeGroup.rotation.x = currentPitch;
      gazeGroup.rotation.z = currentRoll;

      // Update Headset state and pulsing glow
      const isMusic = moodRef.current === 'music' || currentState === 'dance';
      headsetGroup.visible = isMusic;
      if (isMusic) {
        const pulse = 1.0 + Math.sin(t * 8.5) * 0.45;
        headsetGlowMat.emissiveIntensity = pulse;
        if (musicAccentRef.current) {
          try {
            headsetGlowMat.emissive.set(musicAccentRef.current);
            headsetGlowMat.color.set(musicAccentRef.current);
          } catch {}
        }
      }

      // Hide toy ball by default unless in 'play' state
      if (currentState !== 'play') {
        ballGroup.visible = false;
        pivotGroup.position.x = 0;
      }

      // Behavioral Kinematics, Skeletal Animation & Locomotion
      if (mixer) {
        if (currentState === 'walk') {
          if (!walkAction.isRunning()) {
            walkAction.reset().fadeIn(0.2).play();
          }
          walkAction.setEffectiveTimeScale(1.1);
          mixer.update(delta);
        } else if (currentState === 'run') {
          if (!walkAction.isRunning()) {
            walkAction.reset().fadeIn(0.15).play();
          }
          walkAction.setEffectiveTimeScale(1.9);
          mixer.update(delta);
        } else {
          if (walkAction && walkAction.isRunning()) {
            walkAction.fadeOut(0.2);
          }
          mixer.update(delta);
        }
      }

      // Natural quadruped leg locomotion and procedural feline articulation
      if (currentState === 'walk') {
        // Natural diagonal quadruped walk cycle
        walkPhase += delta * 7.5;
        const fl_angle = Math.sin(walkPhase) * 0.45;
        const fr_angle = Math.sin(walkPhase + Math.PI) * 0.45;
        const bl_angle = fr_angle; // Diagonal pairing: FL with BR, FR with BL
        const br_angle = fl_angle;

        // Front Left Leg
        if (bonesMap['leg.upper.F.L_014']) {
          const base = initialBoneRotations['leg.upper.F.L_014'] || { x: 0 };
          bonesMap['leg.upper.F.L_014'].rotation.x = base.x + fl_angle;
        }
        if (bonesMap['leg.lower.FL_015']) {
          const base = initialBoneRotations['leg.lower.FL_015'] || { x: 0 };
          bonesMap['leg.lower.FL_015'].rotation.x = base.x + Math.max(0, -fl_angle * 0.7);
        }

        // Front Right Leg
        if (bonesMap['leg.upper.F.R_024']) {
          const base = initialBoneRotations['leg.upper.F.R_024'] || { x: 0 };
          bonesMap['leg.upper.F.R_024'].rotation.x = base.x + fr_angle;
        }
        if (bonesMap['leg.lower.F.R_00']) {
          const base = initialBoneRotations['leg.lower.F.R_00'] || { x: 0 };
          bonesMap['leg.lower.F.R_00'].rotation.x = base.x + Math.max(0, -fr_angle * 0.7);
        }

        // Back Left Leg
        if (bonesMap['thigh.B.L_03']) {
          const base = initialBoneRotations['thigh.B.L_03'] || { x: 0 };
          bonesMap['thigh.B.L_03'].rotation.x = base.x + bl_angle;
        }
        if (bonesMap['leg.lower.B.L_05']) {
          const base = initialBoneRotations['leg.lower.B.L_05'] || { x: 0 };
          bonesMap['leg.lower.B.L_05'].rotation.x = base.x + Math.max(0, bl_angle * 0.6);
        }

        // Back Right Leg
        if (bonesMap['thigh.B.R_026']) {
          const base = initialBoneRotations['thigh.B.R_026'] || { x: 0 };
          bonesMap['thigh.B.R_026'].rotation.x = base.x + br_angle;
        }
        if (bonesMap['leg.lower.B.R_028']) {
          const base = initialBoneRotations['leg.lower.B.R_028'] || { x: 0 };
          bonesMap['leg.lower.B.R_028'].rotation.x = base.x + Math.max(0, br_angle * 0.6);
        }

        // Tail side swish & rhythmic body trot
        if (bonesMap['tail_07']) {
          const base = initialBoneRotations['tail_07'] || { y: 0 };
          bonesMap['tail_07'].rotation.y = base.y + Math.sin(walkPhase * 0.5) * 0.35;
        }
        if (bonesMap['spine.01_012']) {
          const base = initialBoneRotations['spine.01_012'] || { y: 0 };
          bonesMap['spine.01_012'].rotation.y = base.y + Math.sin(walkPhase) * 0.08;
        }

        const trotRoll = Math.sin(walkPhase) * 0.04;
        const trotPitch = Math.cos(walkPhase) * 0.035;
        const trotBob = Math.abs(Math.sin(walkPhase * 2)) * 0.035;

        pivotGroup.rotation.z = trotRoll;
        pivotGroup.rotation.x = trotPitch;
        pivotGroup.position.y = trotBob;
        breatheGroup.scale.set(1.0, 1.0, 1.0);
      } else if (currentState === 'run') {
        // High-energy quadruped gallop
        walkPhase += delta * 12.0;
        const gallopLead = Math.sin(walkPhase) * 0.65;
        const gallopFollow = Math.sin(walkPhase - 0.75) * 0.65;

        if (bonesMap['leg.upper.F.L_014']) {
          const base = initialBoneRotations['leg.upper.F.L_014'] || { x: 0 };
          bonesMap['leg.upper.F.L_014'].rotation.x = base.x + gallopLead;
        }
        if (bonesMap['leg.lower.FL_015']) {
          const base = initialBoneRotations['leg.lower.FL_015'] || { x: 0 };
          bonesMap['leg.lower.FL_015'].rotation.x = base.x + Math.max(0, -gallopLead * 0.85);
        }
        if (bonesMap['leg.upper.F.R_024']) {
          const base = initialBoneRotations['leg.upper.F.R_024'] || { x: 0 };
          bonesMap['leg.upper.F.R_024'].rotation.x = base.x + gallopFollow;
        }
        if (bonesMap['leg.lower.F.R_00']) {
          const base = initialBoneRotations['leg.lower.F.R_00'] || { x: 0 };
          bonesMap['leg.lower.F.R_00'].rotation.x = base.x + Math.max(0, -gallopFollow * 0.85);
        }

        if (bonesMap['thigh.B.L_03']) {
          const base = initialBoneRotations['thigh.B.L_03'] || { x: 0 };
          bonesMap['thigh.B.L_03'].rotation.x = base.x - gallopLead * 0.8;
        }
        if (bonesMap['thigh.B.R_026']) {
          const base = initialBoneRotations['thigh.B.R_026'] || { x: 0 };
          bonesMap['thigh.B.R_026'].rotation.x = base.x - gallopFollow * 0.8;
        }

        if (bonesMap['tail_07']) {
          const base = initialBoneRotations['tail_07'] || { x: 0 };
          bonesMap['tail_07'].rotation.x = base.x - 0.4 + Math.sin(walkPhase) * 0.25;
        }

        const gallopBob = Math.abs(Math.sin(walkPhase)) * 0.08;
        const gallopPitch = 0.10 + Math.cos(walkPhase) * 0.06;
        const gallopRoll = Math.sin(walkPhase) * 0.05;

        pivotGroup.position.y = gallopBob;
        pivotGroup.rotation.x = gallopPitch;
        pivotGroup.rotation.z = gallopRoll;
        breatheGroup.scale.set(0.96, 1.04, 0.96);
      } else {
        // Smoothly relax leg bones to idle resting posture when not running/walking
        for (const [name, bone] of Object.entries(bonesMap)) {
          if (name.includes('leg') || name.includes('thigh') || name.includes('foot')) {
            const initRot = initialBoneRotations[name];
            if (initRot) {
              bone.rotation.x += (initRot.x - bone.rotation.x) * Math.min(1, delta * 7.0);
              bone.rotation.y += (initRot.y - bone.rotation.y) * Math.min(1, delta * 7.0);
              bone.rotation.z += (initRot.z - bone.rotation.z) * Math.min(1, delta * 7.0);
            }
          }
        }
      }

      if (currentState === 'jump') {
        // Authentic 3-stage feline leap: crouch -> spring reach -> soft landing absorption
        const jumpTime = (t * 2.6) % Math.PI;
        const jumpHeight = Math.sin(jumpTime) * 0.44;
        const jumpTilt = Math.cos(jumpTime) * -0.28;

        pivotGroup.position.y = jumpHeight;
        pivotGroup.rotation.x = jumpTilt;
        pivotGroup.rotation.z = 0;

        if (jumpTime < 0.38) {
          // Stage 1: Crouch anticipation
          breatheGroup.scale.set(1.14, 0.78, 1.14);
          if (bonesMap['head_018']) bonesMap['head_018'].rotation.x = 0.2;
          if (bonesMap['thigh.B.L_03']) bonesMap['thigh.B.L_03'].rotation.x = -0.3;
          if (bonesMap['thigh.B.R_026']) bonesMap['thigh.B.R_026'].rotation.x = -0.3;
        } else if (jumpTime > Math.PI - 0.45) {
          // Stage 3: Soft paw landing
          breatheGroup.scale.set(1.12, 0.84, 1.12);
          if (bonesMap['head_018']) bonesMap['head_018'].rotation.x = 0.1;
          if (bonesMap['foot.F.L_016']) bonesMap['foot.F.L_016'].rotation.x = 0.25;
          if (bonesMap['foot.F.R_025']) bonesMap['foot.F.R_025'].rotation.x = 0.25;
        } else {
          // Stage 2: Mid-air spring reach
          breatheGroup.scale.set(0.92, 1.14, 0.92);
          if (bonesMap['head_018']) bonesMap['head_018'].rotation.x = -0.25;
          if (bonesMap['leg.upper.F.L_014']) bonesMap['leg.upper.F.L_014'].rotation.x = 0.45;
          if (bonesMap['leg.upper.F.R_024']) bonesMap['leg.upper.F.R_024'].rotation.x = 0.45;
          if (bonesMap['thigh.B.L_03']) bonesMap['thigh.B.L_03'].rotation.x = -0.55;
          if (bonesMap['thigh.B.R_026']) bonesMap['thigh.B.R_026'].rotation.x = -0.55;
          if (bonesMap['tail_07']) bonesMap['tail_07'].rotation.x = -0.5;
        }
      } else if (currentState === 'play') {
        // Interactive batting & chasing the yarn toy ball
        ballGroup.visible = true;
        const ballX = Math.sin(t * 3.2) * 0.54;
        const ballY = Math.abs(Math.sin(t * 6.4)) * 0.18 + 0.12;
        ballGroup.position.set(ballX, ballY, 0.12);
        ballMesh.rotation.z += delta * 6;
        ballMesh.rotation.y += delta * 3.5;

        // Kitten tracks ball and bats playfully with front paw
        pivotGroup.position.x = ballX * 0.42;
        pivotGroup.position.y = Math.abs(Math.sin(t * 6.4)) * 0.06;
        pivotGroup.rotation.z = Math.sin(t * 3.2) * 0.14;
        pivotGroup.rotation.y = ballX * 0.35;
        pivotGroup.rotation.x = 0.12;

        const batSwipe = Math.sin(t * 6.4);
        if (bonesMap['leg.upper.F.R_024']) bonesMap['leg.upper.F.R_024'].rotation.x = -0.3 + batSwipe * 0.45;
        if (bonesMap['foot.F.R_025']) bonesMap['foot.F.R_025'].rotation.x = -0.4 + batSwipe * 0.35;
        if (bonesMap['head_018']) bonesMap['head_018'].rotation.y = ballX * 0.5;
        if (bonesMap['tail_07']) bonesMap['tail_07'].rotation.y = -ballX * 0.6;
        breatheGroup.scale.set(1.0, 1.0, 1.0);
      } else if (currentState === 'sleep') {
        // Deep resting pose: curled posture, lowered head and slow 4.2s breathing
        const sleepBreath = Math.sin(t * 1.5) * 0.035;
        pivotGroup.rotation.set(-0.12, 0, 0.05);
        pivotGroup.position.y = -0.06;
        if (bonesMap['head_018']) bonesMap['head_018'].rotation.set(0.18, 0, -0.12);
        if (bonesMap['tail_07']) bonesMap['tail_07'].rotation.set(0, 0.65, 0);
        breatheGroup.scale.set(1.04, 0.94 + sleepBreath, 1.04);
      } else if (currentState === 'dance') {
        // Upbeat rhythm dance synchronized to music tempo
        const beat = t * 7.5;
        const bounce = Math.abs(Math.sin(beat)) * 0.11;
        const tilt = Math.sin(beat * 0.5) * 0.16;
        pivotGroup.position.y = bounce;
        pivotGroup.rotation.z = tilt;

        if (bonesMap['head_018']) {
          bonesMap['head_018'].rotation.x = Math.sin(beat) * 0.22;
          bonesMap['head_018'].rotation.z = -tilt * 0.6;
        }
        if (bonesMap['ear.L_019']) bonesMap['ear.L_019'].rotation.z = Math.sin(beat * 2) * 0.22;
        if (bonesMap['ear.R_020']) bonesMap['ear.R_020'].rotation.z = -Math.sin(beat * 2) * 0.22;
        if (bonesMap['tail_07']) bonesMap['tail_07'].rotation.y = Math.sin(beat) * 0.6;
        if (bonesMap['foot.F.L_016']) bonesMap['foot.F.L_016'].rotation.x = Math.max(0, Math.sin(beat)) * 0.3;
        if (bonesMap['foot.F.R_025']) bonesMap['foot.F.R_025'].rotation.x = Math.max(0, -Math.sin(beat)) * 0.3;
        breatheGroup.scale.set(1.0, 1.0, 1.0);
      } else if (currentState === 'happy') {
        // Petting purr: arched back, purr vibration, and proud tail
        const purr = Math.sin(t * 18.0) * 0.015;
        pivotGroup.position.y = Math.abs(Math.sin(t * 4.0)) * 0.05;
        pivotGroup.rotation.z = purr;
        if (bonesMap['head_018']) bonesMap['head_018'].rotation.x = -0.22;
        if (bonesMap['tail_07']) {
          bonesMap['tail_07'].rotation.x = -0.85;
          bonesMap['tail_07'].rotation.y = Math.sin(t * 5.0) * 0.25;
        }
        breatheGroup.scale.set(1.02 + purr, 0.98 - purr, 1.02);
      } else {
        // Idle / Sit: Natural harmonic chest breathing and tail sway
        const breathe = Math.sin(t * 2.2) * 0.022;
        pivotGroup.rotation.set(0, 0, 0);
        pivotGroup.position.y = 0;
        if (bonesMap['tail.01_08']) bonesMap['tail.01_08'].rotation.y = Math.sin(t * 2.2) * 0.3;
        if (bonesMap['tail.02_09']) bonesMap['tail.02_09'].rotation.y = Math.sin(t * 2.2 + 0.4) * 0.35;
        breatheGroup.scale.set(1.0 + breathe * 0.5, 1.0 + breathe, 1.0 + breathe * 0.5);
      }

      renderer.render(scene, camera);
    };

    animate();

    // 7. Cleanup & GPU Resource Disposal
    return () => {
      cancelAnimationFrame(animId);
      document.removeEventListener('visibilitychange', handleVisibility);
      if (unsubFullscreen) unsubFullscreen();

      if (mixer) {
        mixer.stopAllAction();
        if (kittenMesh) mixer.uncacheRoot(kittenMesh);
      }

      if (kittenMesh) {
        kittenMesh.traverse((child) => {
          if (child.isMesh) {
            child.geometry?.dispose();
            if (Array.isArray(child.material)) {
              child.material.forEach((m) => m.dispose());
            } else {
              child.material?.dispose();
            }
          }
        });
      }

      bandGeo.dispose();
      bandMat.dispose();
      cupGeo.dispose();
      cupMat.dispose();
      ringGeo.dispose();
      headsetGlowMat.dispose();
      ballGeo.dispose();
      ballMat.dispose();
      threadGeo.dispose();
      threadMat.dispose();

      renderer.dispose();
      renderer.forceContextLoss();
      if (renderer.domElement && container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      scene.clear();
    };
  }, [isStudio]);

  return (
    <div
      ref={mountRef}
      className={`three-pet-canvas${isStudio ? ' is-studio' : ''}`}
      onClick={handleCanvasClick}
      style={{
        width: isStudio ? 130 : 180,
        height: isStudio ? 110 : 160,
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
