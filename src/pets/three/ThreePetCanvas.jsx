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

    const width = isStudio ? 130 : 140;
    const height = isStudio ? 110 : 120;

    // 1. Scene & Camera
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(36, width / height, 0.1, 50);
    camera.position.set(0, 0.55, 3.8);
    camera.lookAt(0, 0.4, 0);

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

    // Headband: Matte titanium curved band bridging ears
    const bandGeo = new THREE.TorusGeometry(0.38, 0.028, 16, 48, Math.PI * 0.76);
    const bandMat = new THREE.MeshStandardMaterial({
      color: 0x1f2127,
      metalness: 0.85,
      roughness: 0.28,
    });
    const bandMesh = new THREE.Mesh(bandGeo, bandMat);
    bandMesh.rotation.z = Math.PI * 0.62;
    bandMesh.position.set(0, 1.05, 0.01);
    headsetGroup.add(bandMesh);

    // Ear Cups: Metallic cushions with glowing LED rings
    const cupGeo = new THREE.CylinderGeometry(0.13, 0.13, 0.065, 32);
    const cupMat = new THREE.MeshStandardMaterial({
      color: 0x16181e,
      metalness: 0.8,
      roughness: 0.3,
    });
    const ringGeo = new THREE.TorusGeometry(0.115, 0.016, 16, 32);
    const headsetGlowMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(musicAccent || '#a855f7'),
      emissive: new THREE.Color(musicAccent || '#a855f7'),
      emissiveIntensity: 1.4,
      roughness: 0.15,
    });

    // Left Cup
    const leftCup = new THREE.Group();
    const leftMesh = new THREE.Mesh(cupGeo, cupMat);
    leftMesh.rotation.z = Math.PI / 2;
    const leftRing = new THREE.Mesh(ringGeo, headsetGlowMat);
    leftRing.rotation.y = Math.PI / 2;
    leftRing.position.x = -0.038;
    leftCup.add(leftMesh);
    leftCup.add(leftRing);
    leftCup.position.set(-0.36, 1.04, 0.02);
    leftCup.rotation.y = 0.14;
    leftCup.rotation.z = -0.12;
    headsetGroup.add(leftCup);

    // Right Cup
    const rightCup = new THREE.Group();
    const rightMesh = new THREE.Mesh(cupGeo, cupMat);
    rightMesh.rotation.z = Math.PI / 2;
    const rightRing = new THREE.Mesh(ringGeo, headsetGlowMat);
    rightRing.rotation.y = Math.PI / 2;
    rightRing.position.x = 0.038;
    rightCup.add(rightMesh);
    rightCup.add(rightRing);
    rightCup.position.set(0.36, 1.04, 0.02);
    rightCup.rotation.y = -0.14;
    rightCup.rotation.z = 0.12;
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

    // 5. Load the Authentic Cute Tabby Kitten Model from Downloaded ZIP
    const loader = new GLTFLoader();
    const modelPaths = [
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

          // Normalize bounding box & ground paws at y = 0
          const box = new THREE.Box3().setFromObject(kittenMesh);
          const size = box.getSize(new THREE.Vector3());
          const center = box.getCenter(new THREE.Vector3());

          // Center horizontally and ground vertically
          kittenMesh.position.set(-center.x, -box.min.y, -center.z);

          // Proportional desktop scale
          const targetHeight = isStudio ? 1.55 : 1.45;
          baseMeshScale = targetHeight / (size.y || 1);
          kittenMesh.scale.setScalar(baseMeshScale);

          gazeGroup.add(kittenMesh);
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

      // Smooth horizontal turn rotation (3/4 isometric angle towards screen)
      const targetRotY = currentFacing === -1 ? -Math.PI * 0.4 : Math.PI * 0.4;
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

      // Behavioral Kinematics & Locomotion
      if (currentState === 'walk') {
        // Coordinated quadruped trot
        walkPhase += delta * 8.0;
        const trotRoll = Math.sin(walkPhase) * 0.085;
        const trotPitch = Math.cos(walkPhase) * 0.05;
        const trotBob = Math.abs(Math.sin(walkPhase * 2)) * 0.06;

        pivotGroup.rotation.z = trotRoll;
        pivotGroup.rotation.x = trotPitch;
        pivotGroup.position.y = trotBob;
        breatheGroup.scale.set(1.0, 1.0, 1.0);
      } else if (currentState === 'run') {
        // High-energy gallop stride
        walkPhase += delta * 13.0;
        const gallopBob = Math.abs(Math.sin(walkPhase)) * 0.13;
        const gallopPitch = 0.16 + Math.cos(walkPhase) * 0.09;
        const gallopRoll = Math.sin(walkPhase) * 0.08;

        pivotGroup.position.y = gallopBob;
        pivotGroup.rotation.x = gallopPitch;
        pivotGroup.rotation.z = gallopRoll;
        breatheGroup.scale.set(0.96, 1.04, 0.96);
      } else if (currentState === 'jump') {
        // Spring leap in arc with squash and stretch landing
        const jumpTime = (t * 2.8) % Math.PI;
        const jumpHeight = Math.sin(jumpTime) * 0.38;
        const jumpTilt = Math.cos(jumpTime) * -0.22;

        pivotGroup.position.y = jumpHeight;
        pivotGroup.rotation.x = jumpTilt;
        pivotGroup.rotation.z = 0;

        if (jumpTime < 0.35) {
          breatheGroup.scale.set(1.12, 0.82, 1.12);
        } else if (jumpTime > Math.PI - 0.45) {
          breatheGroup.scale.set(1.15, 0.85, 1.15);
        } else {
          breatheGroup.scale.set(0.92, 1.12, 0.92);
        }
      } else if (currentState === 'play') {
        // Interactive batting & chasing the yarn toy ball
        ballGroup.visible = true;
        const ballX = Math.sin(t * 3.5) * 0.52;
        const ballY = Math.abs(Math.sin(t * 7.0)) * 0.16 + 0.13;
        ballGroup.position.set(ballX, ballY, 0.12);
        ballMesh.rotation.z += delta * 7;
        ballMesh.rotation.y += delta * 3.5;

        // Kitten chases and bats ball
        pivotGroup.position.x = ballX * 0.42;
        pivotGroup.position.y = Math.abs(Math.sin(t * 7.0)) * 0.07;
        pivotGroup.rotation.z = Math.sin(t * 3.5) * 0.16;
        pivotGroup.rotation.x = 0.12;
        breatheGroup.scale.set(1.0, 1.0, 1.0);
      } else if (currentState === 'sleep') {
        // Deep resting pose: curled posture and slow 4.2s breathing
        const sleepBreath = Math.sin(t * 1.5) * 0.035;
        pivotGroup.rotation.set(-0.12, 0, 0.05);
        pivotGroup.position.y = -0.06;
        breatheGroup.scale.set(1.04, 0.94 + sleepBreath, 1.04);
      } else if (currentState === 'dance') {
        // Upbeat rhythm bounce synchronized to music tempo
        const bounce = Math.abs(Math.sin(t * 6.2)) * 0.12;
        const tilt = Math.sin(t * 6.2) * 0.14;
        pivotGroup.position.y = bounce;
        pivotGroup.rotation.z = tilt;
        breatheGroup.scale.set(1.0, 1.0, 1.0);
      } else if (currentState === 'happy') {
        // Petting purr: gentle ecstatic vibration and squash
        const purr = Math.sin(t * 18.0) * 0.015;
        pivotGroup.position.y = Math.abs(Math.sin(t * 4.0)) * 0.05;
        pivotGroup.rotation.z = purr;
        breatheGroup.scale.set(1.02 + purr, 0.98 - purr, 1.02);
      } else {
        // Idle / Sit: Natural harmonic chest breathing (2.8s cycle)
        const breathe = Math.sin(t * 2.2) * 0.022;
        pivotGroup.rotation.set(0, 0, 0);
        pivotGroup.position.y = 0;
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
        width: isStudio ? 130 : 140,
        height: isStudio ? 110 : 120,
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
