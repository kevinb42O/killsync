import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { GameEngine } from './Engine';
import { Enemy, Projectile, ExperienceGem, WorldItem, Treasure, OperatorDefinition, Weapon } from '../types';
import { OPERATOR_DEFINITIONS } from '../constants';
import { FireSolution, solveMuzzleConvergence } from './aiming';

const COLOR_CACHE = new Map<string, THREE.Color>();

function parseHexColor(colorStr?: string, fallback: number = 0x00f0ff): THREE.Color {
  if (!colorStr) colorStr = '#' + fallback.toString(16);
  let cached = COLOR_CACHE.get(colorStr);
  if (cached) return cached;

  let color: THREE.Color;
  if (colorStr.startsWith('rgba') || colorStr.startsWith('rgb')) {
    const matches = colorStr.match(/(\d+),\s*(\d+),\s*(\d+)/);
    if (matches) {
      color = new THREE.Color(Number(matches[1]) / 255, Number(matches[2]) / 255, Number(matches[3]) / 255);
    } else {
      color = new THREE.Color(fallback);
    }
  } else {
    try {
      color = new THREE.Color(colorStr);
    } catch {
      color = new THREE.Color(fallback);
    }
  }
  COLOR_CACHE.set(colorStr, color);
  return color;
}

export class Renderer3D {
  container: HTMLElement | null = null;
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  viewmodelScene: THREE.Scene;
  viewmodelCamera: THREE.PerspectiveCamera;

  private readonly WORLD_FOV = 130;
  private readonly WORLD_DASH_FOV = 138;
  private readonly ADS_FOV = 72;
  private readonly VIEWMODEL_FOV = 98;
  private readonly VIEWMODEL_ADS_FOV = 68;
  
  // Camera & View State (High FOV + ADS)
  yaw: number = 0;
  pitch: number = 0;
  targetYaw: number = 0;
  targetPitch: number = 0;
  isPointerLocked: boolean = false;
  sensitivity: number = 0.0022;

  // Manual Shooting & ADS States
  isShooting: boolean = false;
  isAimingDownSights: boolean = false;
  adsProgress: number = 0;

  // Viewmodel Sway & Inertia
  swayX: number = 0;
  swayY: number = 0;
  swayTilt: number = 0;
  lastMouseDeltaX: number = 0;
  lastMouseDeltaY: number = 0;
  
  // Lighting
  dirLight!: THREE.DirectionalLight;
  ambientLight!: THREE.AmbientLight;
  playerPointLight!: THREE.PointLight;
  camKeyLight!: THREE.DirectionalLight;
  vmFillLight!: THREE.PointLight;
  vmGlowLight!: THREE.PointLight;
  
  // Environment
  gridHelper!: THREE.GridHelper;
  floorMesh!: THREE.Mesh;
  boundaryPillars: THREE.Mesh[] = [];
  
  // High-End FPS Viewmodel Rig
  fpsWeaponGroup!: THREE.Group;
  weaponRoot!: THREE.Group;
  barrelRoot!: THREE.Group;
  rightArmRoot!: THREE.Group;
  handRoot!: THREE.Group;
  opticSocket!: THREE.Object3D;
  weaponChassis!: THREE.Mesh;
  weaponTopPlate!: THREE.Mesh;
  weaponGrip!: THREE.Mesh;

  // Holographic Reflex Sight & Co-Witness
  weaponSightMount!: THREE.Mesh;
  weaponSightHousing!: THREE.Group;
  weaponSightGlass!: THREE.Mesh;
  weaponSightReticleDot!: THREE.Mesh;
  weaponSightReticleRing!: THREE.Mesh;
  weaponSightFrontPost!: THREE.Mesh;
  weaponSightFrontBead!: THREE.Mesh;

  weaponRailUpper!: THREE.Mesh;
  weaponRailLower!: THREE.Mesh;
  weaponMagCoils: THREE.Mesh[] = [];
  weaponCoolingFins: THREE.Mesh[] = [];
  weaponQuantumCore!: THREE.Mesh;
  weaponCoreChamber!: THREE.Mesh;
  weaponBatteryCell!: THREE.Mesh;
  weaponBatteryLEDs: THREE.Mesh[] = [];
  weaponMuzzleBrake!: THREE.Mesh;
  weaponMuzzlePoint!: THREE.Object3D;

  // Cybernetic Forearm & Hand Rig
  armForearmMain!: THREE.Mesh;
  armCarbonPlate!: THREE.Mesh;
  armChevronTrim!: THREE.Mesh;
  armHydraulicCylinder!: THREE.Mesh;
  armHydraulicPiston!: THREE.Mesh;
  armPowerConduit1!: THREE.Mesh;
  armPowerConduit2!: THREE.Mesh;
  armWristJoint!: THREE.Mesh;
  armPalm!: THREE.Mesh;
  armFingers: THREE.Mesh[] = [];
  armFingerKnuckles: THREE.Mesh[] = [];
  armThumb!: THREE.Mesh;
  armWristHoloDisplay!: THREE.Mesh;
  armHoloLines!: THREE.Mesh;

  muzzleFlashMesh!: THREE.Mesh;
  muzzleFlashCone!: THREE.Mesh;
  muzzleFlashRing!: THREE.Mesh;
  muzzleFlashLight!: THREE.PointLight;
  muzzleFlashTimer: number = 0;
  recoilOffset: number = 0;
  recoilRotOffset: number = 0;
  heatVentIntensity: number = 0;
  walkBobTimer: number = 0;
  idleBreathTimer: number = 0;
  
  // Third-person character model
  thirdPersonPlayerGroup!: THREE.Group;
  tpBodyMesh!: THREE.Mesh;
  tpHeadMesh!: THREE.Mesh;
  tpVisorMesh!: THREE.Mesh;
  tpLeftShoulder!: THREE.Mesh;
  tpRightShoulder!: THREE.Mesh;
  tpLeftArm!: THREE.Mesh;
  tpRightArm!: THREE.Mesh;
  tpLeftLeg!: THREE.Mesh;
  tpRightLeg!: THREE.Mesh;
  tpCoreMesh!: THREE.Mesh;
  tpJetpackMesh!: THREE.Mesh;
  tpThrusterLeft!: THREE.Mesh;
  tpThrusterRight!: THREE.Mesh;
  tpGroundRingMesh!: THREE.Mesh;
  tpBlasterMesh!: THREE.Mesh;
  
  // Object pools & 3D caches
  private enemyMeshes = new Map<string, THREE.Object3D>();
  private gemMeshes = new Map<string, THREE.Mesh>();
  private itemMeshes = new Map<string, THREE.Mesh>();
  private treasureMeshes = new Map<string, THREE.Group>();
  private projectileMeshes = new Map<string, THREE.Object3D>();
  private portalMesh: THREE.Group | null = null;
  
  // Particles
  private particleSystem!: THREE.Points;
  private particleGeo!: THREE.BufferGeometry;
  private particlePositions!: Float32Array;
  private particleColors!: Float32Array;
  private readonly MAX_3D_PARTICLES = 1200;

  // Shared reusable geometries and materials for maximum performance
  private gemGeometry = new THREE.OctahedronGeometry(6, 0);
  private gemMaterialCache = new Map<string, THREE.MeshStandardMaterial>();

  // Cached vector math objects for zero per-frame garbage collection
  private tempMuzzlePos = new THREE.Vector3();
  private tempMuzzleFwd = new THREE.Vector3();
  private tempMuzzleNdc = new THREE.Vector3();
  private tempMuzzleQuat = new THREE.Quaternion();
  private tempCameraPos = new THREE.Vector3();
  private tempCameraFwd = new THREE.Vector3();
  private tempAimPoint = new THREE.Vector3();
  private tempRaycaster = new THREE.Raycaster();
  private centerNdc = new THREE.Vector2(0, 0);
  private tempMuzzleNdc2 = new THREE.Vector2();
  private lastFireSolution: FireSolution | null = null;
  private debugAimGroup!: THREE.Group;
  private debugCameraLine!: THREE.Line;
  private debugMuzzleLine!: THREE.Line;
  private debugMuzzlePoint!: THREE.Mesh;
  private debugAimPoint!: THREE.Mesh;
  debugAim: boolean = false;

  constructor() {
    // 1. Initialize Three.js Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x060914);
    this.scene.fog = new THREE.FogExp2(0x060914, 0.0012);

    // 2. World camera stays deliberately extreme; the viewmodel gets its own
    // projection so it remains readable at a 130° world FOV.
    this.camera = new THREE.PerspectiveCamera(this.WORLD_FOV, window.innerWidth / window.innerHeight, 0.05, 10000);
    this.scene.add(this.camera);
    this.viewmodelScene = new THREE.Scene();
    this.viewmodelCamera = new THREE.PerspectiveCamera(this.VIEWMODEL_FOV, window.innerWidth / window.innerHeight, 0.025, 1000);
    this.viewmodelScene.add(this.viewmodelCamera);

    // 3. Initialize WebGL Renderer
    this.renderer = new THREE.WebGLRenderer({
      powerPreference: 'high-performance',
      antialias: true,
      alpha: false
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.4;

    // 4. Setup Lighting
    this.setupLighting();

    // 5. Setup Environment (Grid floor, sky/horizon, pillars)
    this.setupEnvironment();

    // 6. Setup High-End FPS Viewmodel (Production Cyber Arm & Blaster)
    this.setupFPSViewmodel();
    this.setupAimDebug();

    // 7. Setup Third-Person Character
    this.setupThirdPersonCharacter();

    // 8. Setup 3D Particle System
    this.setupParticleSystem();

    // 9. Setup Event Listeners
    this.setupPointerLock();
    window.addEventListener('resize', this.handleResize);
  }

  mount(container: HTMLElement) {
    this.container = container;
    container.appendChild(this.renderer.domElement);
    this.handleResize();
  }

  unmount() {
    if (this.container && this.renderer.domElement.parentElement === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
    this.container = null;
  }

  private handleResize = () => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.viewmodelCamera.aspect = width / height;
    this.viewmodelCamera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  };

  private setupLighting() {
    // High-Dynamic Ambient Light
    this.ambientLight = new THREE.AmbientLight(0x455a7a, 2.8);
    this.scene.add(this.ambientLight);

    // Overhead Cyber Sun
    this.dirLight = new THREE.DirectionalLight(0x00f0ff, 2.2);
    this.dirLight.position.set(300, 600, 400);
    this.scene.add(this.dirLight);

    // Magenta Counter-Rim Light for volumetric depth
    const magentaLight = new THREE.DirectionalLight(0xff0088, 1.5);
    magentaLight.position.set(-400, 500, -300);
    this.scene.add(magentaLight);

    // Player Follow Point Light
    this.playerPointLight = new THREE.PointLight(0x00f0ff, 5.0, 500, 1.0);
    this.scene.add(this.playerPointLight);

    // Camera Forward Key Light
    this.camKeyLight = new THREE.DirectionalLight(0xffffff, 1.8);
    this.camKeyLight.position.set(0, 2, 5);
    this.camera.add(this.camKeyLight);
  }

  private setupEnvironment() {
    // Cyber Neon Floor Grid
    const floorSize = 12000;
    const floorGeo = new THREE.PlaneGeometry(floorSize, floorSize, 1, 1);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x090e1c,
      roughness: 0.22,
      metalness: 0.8
    });
    this.floorMesh = new THREE.Mesh(floorGeo, floorMat);
    this.floorMesh.rotation.x = -Math.PI / 2;
    this.floorMesh.position.y = 0;
    this.scene.add(this.floorMesh);

    // Glowing Grid overlay
    this.gridHelper = new THREE.GridHelper(floorSize, 300, 0x00f0ff, 0x182845);
    this.gridHelper.position.y = 0.5;
    this.scene.add(this.gridHelper);

    // Distant Cyber Pillars / Horizon Monoliths
    const pillarGeo = new THREE.BoxGeometry(40, 750, 40);
    const pillarColors = [0x00f0ff, 0xff0077, 0x7928ca, 0x00ffcc];
    
    for (let i = 0; i < 40; i++) {
      const angle = (i / 40) * Math.PI * 2;
      const dist = 3400 + Math.sin(i * 3) * 400;
      const color = pillarColors[i % pillarColors.length];
      const mat = new THREE.MeshBasicMaterial({
        color,
        wireframe: true
      });
      const pillar = new THREE.Mesh(pillarGeo, mat);
      pillar.position.set(Math.cos(angle) * dist, 320, Math.sin(angle) * dist);
      this.scene.add(pillar);
      this.boundaryPillars.push(pillar);
    }
  }

  private setupFPSViewmodel() {
    this.fpsWeaponGroup = new THREE.Group();
    this.weaponRoot = new THREE.Group();
    this.weaponRoot.name = 'weaponRoot';
    this.barrelRoot = new THREE.Group();
    this.barrelRoot.name = 'barrelRoot';
    this.rightArmRoot = new THREE.Group();
    this.rightArmRoot.name = 'rightArmRoot';
    this.handRoot = new THREE.Group();
    this.handRoot.name = 'handRoot';
    this.weaponRoot.add(this.barrelRoot);
    this.rightArmRoot.add(this.handRoot);
    this.fpsWeaponGroup.add(this.weaponRoot, this.rightArmRoot);

    // 1. DEDICATED VIEWMODEL LIGHTS (Attached directly to viewmodel group)
    this.vmFillLight = new THREE.PointLight(0xffffff, 2.6, 40, 1.0);
    this.vmFillLight.position.set(1.5, 1.5, -2.0);
    this.fpsWeaponGroup.add(this.vmFillLight);

    this.vmGlowLight = new THREE.PointLight(0x00f0ff, 2.2, 30, 1.0);
    this.vmGlowLight.position.set(2.4, -0.8, -4.5);
    this.fpsWeaponGroup.add(this.vmGlowLight);

    // ==========================================
    // 2. HEAVY PLASMA ACCELERATOR CANNON & OPTIC
    // ==========================================

    // Compact beveled receiver: readable at extreme FOV without becoming a slab.
    const chassisGeo = new RoundedBoxGeometry(1.45, 1.45, 4.6, 3, 0.14);
    const chassisMat = new THREE.MeshStandardMaterial({
      color: 0x243248,
      emissive: 0x0c1626,
      emissiveIntensity: 0.6,
      metalness: 0.7,
      roughness: 0.34
    });
    this.weaponChassis = new THREE.Mesh(chassisGeo, chassisMat);
    this.weaponChassis.position.set(0, 0.05, -2.65);
    this.weaponRoot.add(this.weaponChassis);

    // Top Receiver Armor Plate with Neon Rail
    const topPlateGeo = new RoundedBoxGeometry(1.25, 0.18, 4.5, 2, 0.07);
    const topPlateMat = new THREE.MeshStandardMaterial({
      color: 0x00f0ff,
      emissive: 0x00f0ff,
      emissiveIntensity: 0.55,
      metalness: 0.55,
      roughness: 0.25
    });
    this.weaponTopPlate = new THREE.Mesh(topPlateGeo, topPlateMat);
    this.weaponTopPlate.position.set(0, 0.88, -2.65);
    this.weaponRoot.add(this.weaponTopPlate);

    // Ergonomic Combat Pistol Grip
    const gripGeo = new RoundedBoxGeometry(0.82, 1.9, 1.05, 3, 0.12);
    const gripMat = new THREE.MeshStandardMaterial({
      color: 0x141c28,
      metalness: 0.8,
      roughness: 0.35
    });
    this.weaponGrip = new THREE.Mesh(gripGeo, gripMat);
    this.weaponGrip.position.set(0, -1.08, -0.72);
    this.weaponGrip.rotation.x = -0.28;
    this.weaponRoot.add(this.weaponGrip);

    // ----------------------------------------------------
    // HOLOGRAPHIC REFLEX OPTIC (Sits at Optical Eye Height Y = 1.95)
    // ----------------------------------------------------
    // Optic Cantilever Mount Base
    const mountGeo = new RoundedBoxGeometry(0.88, 0.22, 1.15, 2, 0.07);
    const mountMat = new THREE.MeshStandardMaterial({
      color: 0x1a2638,
      emissive: 0x0a1422,
      emissiveIntensity: 0.4,
      metalness: 0.85,
      roughness: 0.2
    });
    this.weaponSightMount = new THREE.Mesh(mountGeo, mountMat);
    this.weaponSightMount.position.set(0, 1.02, -2.3);
    this.weaponRoot.add(this.weaponSightMount);
    this.opticSocket = new THREE.Object3D();
    this.opticSocket.position.set(0, 1.48, -2.3);
    this.weaponRoot.add(this.opticSocket);

    // Optic Housing Hood Group
    this.weaponSightHousing = new THREE.Group();
    const shroudMat = new THREE.MeshStandardMaterial({
      color: 0x182436,
      emissive: 0x00f0ff,
      emissiveIntensity: 0.5,
      metalness: 0.9,
      roughness: 0.15
    });

    const topHood = new THREE.Mesh(new RoundedBoxGeometry(0.95, 0.12, 0.85, 2, 0.04), shroudMat);
    topHood.position.set(0, 1.78, -2.3);
    this.weaponSightHousing.add(topHood);

    const leftWall = new THREE.Mesh(new RoundedBoxGeometry(0.12, 0.58, 0.85, 2, 0.035), shroudMat);
    leftWall.position.set(-0.42, 1.48, -2.3);
    this.weaponSightHousing.add(leftWall);

    const rightWall = new THREE.Mesh(new RoundedBoxGeometry(0.12, 0.58, 0.85, 2, 0.035), shroudMat);
    rightWall.position.set(0.42, 1.48, -2.3);
    this.weaponSightHousing.add(rightWall);
    this.weaponRoot.add(this.weaponSightHousing);

    // Holographic Anti-Glare Glass Lens (Optical Center at Y = 1.95, Z = -2.2)
    const glassGeo = new THREE.PlaneGeometry(0.68, 0.48);
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0x00f0ff,
      transparent: true,
      opacity: 0.22,
      roughness: 0.05,
      metalness: 0.95,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    this.weaponSightGlass = new THREE.Mesh(glassGeo, glassMat);
    this.weaponSightGlass.position.set(0, 1.48, -2.32);
    this.weaponRoot.add(this.weaponSightGlass);

    // Floating 3D Holographic Reticle (Center Dot + Outer Bracket Ring)
    const reticleDotGeo = new THREE.RingGeometry(0.018, 0.055, 16);
    const reticleDotMat = new THREE.MeshBasicMaterial({
      color: 0x00ff88,
      transparent: true,
      opacity: 0.95,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    this.weaponSightReticleDot = new THREE.Mesh(reticleDotGeo, reticleDotMat);
    this.weaponSightReticleDot.position.set(0, 1.48, -2.34);
    this.weaponRoot.add(this.weaponSightReticleDot);

    const reticleRingGeo = new THREE.RingGeometry(0.13, 0.15, 24);
    const reticleRingMat = new THREE.MeshBasicMaterial({
      color: 0x00f0ff,
      transparent: true,
      opacity: 0.8,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    this.weaponSightReticleRing = new THREE.Mesh(reticleRingGeo, reticleRingMat);
    this.weaponSightReticleRing.position.set(0, 1.48, -2.34);
    this.weaponRoot.add(this.weaponSightReticleRing);

    // Front Co-Witness Sight Blade & Glowing Fiber Bead
    const frontPostGeo = new THREE.BoxGeometry(0.08, 0.45, 0.08);
    const frontPostMat = new THREE.MeshStandardMaterial({ color: 0x182436, metalness: 0.9 });
    this.weaponSightFrontPost = new THREE.Mesh(frontPostGeo, frontPostMat);
    this.weaponSightFrontPost.position.set(0, 0.83, -7.25);
    this.barrelRoot.add(this.weaponSightFrontPost);

    const frontBeadGeo = new THREE.SphereGeometry(0.065, 8, 8);
    const frontBeadMat = new THREE.MeshBasicMaterial({ color: 0x00ff88 });
    this.weaponSightFrontBead = new THREE.Mesh(frontBeadGeo, frontBeadMat);
    this.weaponSightFrontBead.position.set(0, 1.05, -7.25);
    this.barrelRoot.add(this.weaponSightFrontBead);

    // Lateral Cooling Radiator Fins (3 pairs)
    for (let f = 0; f < 3; f++) {
      const finGeo = new RoundedBoxGeometry(0.16, 0.72, 0.28, 2, 0.04);
      const finMat = new THREE.MeshStandardMaterial({
        color: 0x00f0ff,
        emissive: 0x00f0ff,
        emissiveIntensity: 1.0
      });
      // Left fin
      const finLeft = new THREE.Mesh(finGeo, finMat);
      finLeft.position.set(-0.82, 0.15, -1.5 - f * 1.05);
      this.weaponRoot.add(finLeft);
      this.weaponCoolingFins.push(finLeft);

      // Right fin
      const finRight = new THREE.Mesh(finGeo, finMat);
      finRight.position.set(0.82, 0.15, -1.5 - f * 1.05);
      this.weaponRoot.add(finRight);
      this.weaponCoolingFins.push(finRight);
    }

    // Twin Heavy Magnetic Accelerator Rails
    const railUpperGeo = new RoundedBoxGeometry(0.34, 0.28, 3.8, 2, 0.06);
    const railMat = new THREE.MeshStandardMaterial({
      color: 0x3d4f6c,
      emissive: 0x00f0ff,
      emissiveIntensity: 0.5,
      metalness: 0.9,
      roughness: 0.15
    });
    this.weaponRailUpper = new THREE.Mesh(railUpperGeo, railMat);
    this.weaponRailUpper.position.set(0, 0.26, -6.25);
    this.barrelRoot.add(this.weaponRailUpper);

    this.weaponRailLower = new THREE.Mesh(railUpperGeo, railMat);
    this.weaponRailLower.position.set(0, -0.26, -6.25);
    this.barrelRoot.add(this.weaponRailLower);

    // 3 Magnetic Accelerator Coil Rings around the twin rails
    for (let c = 0; c < 3; c++) {
      const coilGeo = new THREE.TorusGeometry(0.55, 0.075, 8, 18);
      const coilMat = new THREE.MeshStandardMaterial({
        color: 0x00f0ff,
        emissive: 0x00f0ff,
        emissiveIntensity: 2.0
      });
      const coil = new THREE.Mesh(coilGeo, coilMat);
      coil.position.set(0, 0, -5.15 - c * 1.0);
      this.barrelRoot.add(coil);
      this.weaponMagCoils.push(coil);
    }

    // Heavy Front Muzzle Brake / Focus Aperture
    const muzzleGeo = new THREE.CylinderGeometry(0.62, 0.52, 0.72, 10);
    const muzzleMat = new THREE.MeshStandardMaterial({
      color: 0x182436,
      emissive: 0x00f0ff,
      emissiveIntensity: 0.6,
      metalness: 0.85
    });
    this.weaponMuzzleBrake = new THREE.Mesh(muzzleGeo, muzzleMat);
    this.weaponMuzzleBrake.rotation.x = Math.PI / 2;
    this.weaponMuzzleBrake.position.set(0, 0, -8.25);
    this.barrelRoot.add(this.weaponMuzzleBrake);

    const bore = new THREE.Mesh(
      new THREE.CylinderGeometry(0.24, 0.24, 0.76, 16),
      new THREE.MeshStandardMaterial({ color: 0x020408, roughness: 0.65, metalness: 0.7 })
    );
    bore.rotation.x = Math.PI / 2;
    bore.position.set(0, 0, -8.3);
    this.barrelRoot.add(bore);

    // Physical Barrel Bore Point (Inside the center of the barrel exit)
    this.weaponMuzzlePoint = new THREE.Object3D();
    this.weaponMuzzlePoint.position.set(0, 0, -8.72);
    this.barrelRoot.add(this.weaponMuzzlePoint);

    // Quantum Core Chamber (Top observation glass port)
    const chamberGeo = new THREE.CylinderGeometry(0.6, 0.6, 1.6, 16);
    const chamberMat = new THREE.MeshStandardMaterial({
      color: 0x0a1422,
      transparent: true,
      opacity: 0.45,
      roughness: 0.1,
      metalness: 0.9
    });
    this.weaponCoreChamber = new THREE.Mesh(chamberGeo, chamberMat);
    this.weaponCoreChamber.rotation.x = Math.PI / 2;
    this.weaponCoreChamber.position.set(0, 0.55, -1.6);
    this.weaponRoot.add(this.weaponCoreChamber);

    // Glowing Rotating Quantum Core Crystal
    const coreGeo = new THREE.OctahedronGeometry(0.42, 0);
    const coreMat = new THREE.MeshBasicMaterial({ color: 0x00ffff });
    this.weaponQuantumCore = new THREE.Mesh(coreGeo, coreMat);
    this.weaponQuantumCore.scale.setScalar(0.72);
    this.weaponQuantumCore.position.set(0, 0.48, -1.7);
    this.weaponRoot.add(this.weaponQuantumCore);

    // Heavy Tactical E-Battery Cell Magazine
    const batteryGeo = new RoundedBoxGeometry(0.9, 1.55, 1.15, 3, 0.12);
    const batteryMat = new THREE.MeshStandardMaterial({
      color: 0x141c28,
      metalness: 0.8,
      roughness: 0.3
    });
    this.weaponBatteryCell = new THREE.Mesh(batteryGeo, batteryMat);
    this.weaponBatteryCell.position.set(0, -1.0, -2.35);
    this.weaponBatteryCell.rotation.x = 0.1;
    this.weaponRoot.add(this.weaponBatteryCell);

    // 4 Glowing Battery Level LEDs
    for (let b = 0; b < 4; b++) {
      const ledGeo = new THREE.BoxGeometry(0.08, 0.22, 0.22);
      const ledMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff });
      const led = new THREE.Mesh(ledGeo, ledMat);
      led.position.set(0.47, -0.55 - b * 0.28, -2.35);
      this.weaponRoot.add(led);
      this.weaponBatteryLEDs.push(led);
    }

    // Muzzle Flash Effect
    const flashGeo = new THREE.SphereGeometry(0.46, 10, 8);
    const flashMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0
    });
    this.muzzleFlashMesh = new THREE.Mesh(flashGeo, flashMat);
    this.muzzleFlashMesh.position.set(0, 0, -8.78);
    this.barrelRoot.add(this.muzzleFlashMesh);

    const flashConeMat = new THREE.MeshBasicMaterial({
      color: 0x8fffff,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    this.muzzleFlashCone = new THREE.Mesh(new THREE.ConeGeometry(0.5, 2.4, 8, 1, true), flashConeMat);
    this.muzzleFlashCone.rotation.x = -Math.PI / 2;
    this.muzzleFlashCone.position.set(0, 0, -9.85);
    this.barrelRoot.add(this.muzzleFlashCone);

    this.muzzleFlashRing = new THREE.Mesh(
      new THREE.RingGeometry(0.28, 0.62, 16),
      flashConeMat.clone()
    );
    this.muzzleFlashRing.position.set(0, 0, -8.82);
    this.barrelRoot.add(this.muzzleFlashRing);

    this.muzzleFlashLight = new THREE.PointLight(0x8fffff, 0, 12, 2);
    this.muzzleFlashLight.position.set(0, 0, -8.5);
    this.barrelRoot.add(this.muzzleFlashLight);


    // ==========================================
    // 3. CYBERNETIC FOREARM & ARTICULATED HAND
    // ==========================================

    // Tapered forearm armor with a human-readable wrist silhouette.
    const forearmGeo = new THREE.CylinderGeometry(0.58, 0.8, 4.4, 8);
    const forearmMat = new THREE.MeshStandardMaterial({
      color: 0x1c2b40,
      emissive: 0x0a1422,
      emissiveIntensity: 0.5,
      metalness: 0.7,
      roughness: 0.3
    });
    this.armForearmMain = new THREE.Mesh(forearmGeo, forearmMat);
    this.armForearmMain.rotation.x = Math.PI / 2 + 0.17;
    this.armForearmMain.position.set(1.1, -1.95, 1.62);
    this.rightArmRoot.add(this.armForearmMain);

    // Beveled Carbon Armor Plate over forearm
    const armPlateGeo = new RoundedBoxGeometry(0.78, 0.16, 2.35, 3, 0.065);
    const armPlateMat = new THREE.MeshStandardMaterial({
      color: 0x283a54,
      metalness: 0.8,
      roughness: 0.2
    });
    this.armCarbonPlate = new THREE.Mesh(armPlateGeo, armPlateMat);
    this.armCarbonPlate.position.set(1.1, -1.36, 1.55);
    this.armCarbonPlate.rotation.x = 0.17;
    this.rightArmRoot.add(this.armCarbonPlate);

    // Glowing Chevron Inlay Trim on Forearm
    const chevronGeo = new RoundedBoxGeometry(0.16, 0.045, 1.55, 2, 0.02);
    const chevronMat = new THREE.MeshStandardMaterial({
      color: 0x00f0ff,
      emissive: 0x00f0ff,
      emissiveIntensity: 0.85
    });
    this.armChevronTrim = new THREE.Mesh(chevronGeo, chevronMat);
    this.armChevronTrim.position.set(1.1, -1.245, 1.4);
    this.armChevronTrim.rotation.x = 0.17;
    this.rightArmRoot.add(this.armChevronTrim);

    // Hydraulic Recoil Cylinder & Piston (Lateral exoskeleton)
    const cylinderGeo = new THREE.CylinderGeometry(0.14, 0.14, 3.3, 10);
    const cylinderMat = new THREE.MeshStandardMaterial({ color: 0x182436, metalness: 0.9, roughness: 0.1 });
    this.armHydraulicCylinder = new THREE.Mesh(cylinderGeo, cylinderMat);
    this.armHydraulicCylinder.rotation.x = Math.PI / 2 + 0.17;
    this.armHydraulicCylinder.position.set(1.78, -1.72, 1.85);
    this.rightArmRoot.add(this.armHydraulicCylinder);

    const pistonGeo = new THREE.CylinderGeometry(0.09, 0.09, 2.3, 10);
    const pistonMat = new THREE.MeshStandardMaterial({ color: 0xeeeeee, metalness: 0.95, roughness: 0.05 });
    this.armHydraulicPiston = new THREE.Mesh(pistonGeo, pistonMat);
    this.armHydraulicPiston.rotation.x = Math.PI / 2 + 0.17;
    this.armHydraulicPiston.position.set(1.78, -1.72, 0.65);
    this.rightArmRoot.add(this.armHydraulicPiston);

    // Coiled Neon Power Conduits along the arm
    const conduitGeo = new THREE.TorusGeometry(0.78, 0.045, 6, 20);
    const conduitMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff });
    this.armPowerConduit1 = new THREE.Mesh(conduitGeo, conduitMat);
    this.armPowerConduit1.rotation.x = Math.PI / 2 + 0.17;
    this.armPowerConduit1.position.set(1.1, -1.72, 1.15);
    this.rightArmRoot.add(this.armPowerConduit1);

    this.armPowerConduit2 = new THREE.Mesh(conduitGeo, conduitMat);
    this.armPowerConduit2.rotation.x = Math.PI / 2 + 0.17;
    this.armPowerConduit2.position.set(1.1, -2.0, 2.75);
    this.rightArmRoot.add(this.armPowerConduit2);

    // Mechanical Wrist Joint
    const wristGeo = new THREE.CylinderGeometry(0.48, 0.58, 0.55, 10);
    const wristMat = new THREE.MeshStandardMaterial({ color: 0x162030, metalness: 0.85 });
    this.armWristJoint = new THREE.Mesh(wristGeo, wristMat);
    this.armWristJoint.rotation.x = Math.PI / 2;
    this.armWristJoint.position.set(0.7, -1.0, 0.12);
    this.rightArmRoot.add(this.armWristJoint);

    // Armored Palm & Hand Base
    const palmGeo = new RoundedBoxGeometry(0.82, 0.72, 1.12, 3, 0.12);
    const palmMat = new THREE.MeshStandardMaterial({
      color: 0x1f2e46,
      emissive: 0x0c1626,
      emissiveIntensity: 0.5,
      metalness: 0.7
    });
    this.armPalm = new THREE.Mesh(palmGeo, palmMat);
    this.armPalm.position.set(0.38, -0.88, -0.48);
    this.handRoot.add(this.armPalm);

    // Four articulated fingers. Two short phalanges per finger curve around
    // the grip; the index finger rests higher as a trigger finger.
    for (let i = 0; i < 4; i++) {
      const fingerGeo = new RoundedBoxGeometry(0.18, 0.22, 0.64, 2, 0.07);
      const fingerMat = new THREE.MeshStandardMaterial({
        color: 0x2a3d5a,
        metalness: 0.8,
        roughness: 0.2
      });
      const finger = new THREE.Mesh(fingerGeo, fingerMat);
      const fingerY = i === 0 ? -0.58 : -0.73 - (i - 1) * 0.22;
      finger.position.set(-0.42, fingerY, -0.54 - i * 0.03);
      finger.rotation.y = 0.72;
      finger.rotation.z = i === 0 ? -0.08 : 0.1;
      this.handRoot.add(finger);
      this.armFingers.push(finger);

      const fingerTip = new THREE.Mesh(fingerGeo, fingerMat.clone());
      fingerTip.scale.set(0.92, 0.92, 0.72);
      fingerTip.position.set(-0.57, fingerY - 0.02, -0.94 - i * 0.03);
      fingerTip.rotation.y = 1.12;
      fingerTip.rotation.z = i === 0 ? -0.08 : 0.12;
      this.handRoot.add(fingerTip);
      this.armFingers.push(fingerTip);

      // Glowing Knuckle Ring on each finger
      const knuckleGeo = new THREE.SphereGeometry(0.14, 8, 8);
      const knuckleMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff });
      const knuckle = new THREE.Mesh(knuckleGeo, knuckleMat);
      knuckle.position.set(-0.47, fingerY, -0.2);
      this.handRoot.add(knuckle);
      this.armFingerKnuckles.push(knuckle);
    }

    // Articulated Thumb wrapping top
    const thumbGeo = new RoundedBoxGeometry(0.24, 0.25, 0.78, 2, 0.08);
    const thumbMat = new THREE.MeshStandardMaterial({ color: 0x2a3d5a, metalness: 0.8 });
    this.armThumb = new THREE.Mesh(thumbGeo, thumbMat);
    this.armThumb.position.set(0.62, -0.55, -0.48);
    this.armThumb.rotation.y = -0.82;
    this.armThumb.rotation.z = -0.18;
    this.handRoot.add(this.armThumb);

    // Holographic 3D Wrist Display HUD Plate
    const holoGeo = new THREE.PlaneGeometry(1.15, 0.62);
    const holoMat = new THREE.MeshBasicMaterial({
      color: 0x00ffff,
      transparent: true,
      opacity: 0.2,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    this.armWristHoloDisplay = new THREE.Mesh(holoGeo, holoMat);
    this.armWristHoloDisplay.position.set(1.1, -0.72, 1.55);
    this.armWristHoloDisplay.rotation.x = -Math.PI / 3;
    this.armWristHoloDisplay.rotation.y = -0.15;
    this.rightArmRoot.add(this.armWristHoloDisplay);

    // Holo Grid border lines
    const holoBorderGeo = new RoundedBoxGeometry(1.22, 0.035, 0.69, 2, 0.015);
    const holoBorderMat = new THREE.MeshBasicMaterial({
      color: 0x00ffff,
      wireframe: true,
      transparent: true,
      opacity: 0.55
    });
    this.armHoloLines = new THREE.Mesh(holoBorderGeo, holoBorderMat);
    this.armHoloLines.position.set(1.1, -0.72, 1.55);
    this.armHoloLines.rotation.x = -Math.PI / 3;
    this.armHoloLines.rotation.y = -0.15;
    this.rightArmRoot.add(this.armHoloLines);

    // Optimized High-FOV viewmodel positioning (placed in the lower right foreground)
    this.fpsWeaponGroup.position.set(1.65, -1.85, -4.8);
    this.viewmodelCamera.add(this.fpsWeaponGroup);
  }

  private setupAimDebug() {
    this.debugAimGroup = new THREE.Group();
    this.debugAimGroup.visible = false;

    const makeLine = (color: number) => new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
      new THREE.LineBasicMaterial({ color, depthTest: false, transparent: true, opacity: 0.9 })
    );
    this.debugCameraLine = makeLine(0xff3355);
    this.debugMuzzleLine = makeLine(0x00f0ff);
    this.debugMuzzlePoint = new THREE.Mesh(
      new THREE.SphereGeometry(0.8, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0x00f0ff, depthTest: false })
    );
    this.debugAimPoint = new THREE.Mesh(
      new THREE.SphereGeometry(1.2, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xffdd33, depthTest: false })
    );
    this.debugAimGroup.add(this.debugCameraLine, this.debugMuzzleLine, this.debugMuzzlePoint, this.debugAimPoint);
    this.scene.add(this.debugAimGroup);
  }

  private updateAimDebug(solution: FireSolution) {
    if (!this.debugAim) return;
    const cameraStart = this.camera.position;
    const aim = solution.aimPoint3D;
    const muzzle = solution.muzzlePosition3D;
    const cameraPositions = this.debugCameraLine.geometry.getAttribute('position') as THREE.BufferAttribute;
    cameraPositions.setXYZ(0, cameraStart.x, cameraStart.y, cameraStart.z);
    cameraPositions.setXYZ(1, aim.x, aim.y, aim.z);
    cameraPositions.needsUpdate = true;
    const muzzlePositions = this.debugMuzzleLine.geometry.getAttribute('position') as THREE.BufferAttribute;
    muzzlePositions.setXYZ(0, muzzle.x, muzzle.y, muzzle.z);
    muzzlePositions.setXYZ(1, aim.x, aim.y, aim.z);
    muzzlePositions.needsUpdate = true;
    this.debugMuzzlePoint.position.set(muzzle.x, muzzle.y, muzzle.z);
    this.debugAimPoint.position.set(aim.x, aim.y, aim.z);
  }

  private setupThirdPersonCharacter() {
    this.thirdPersonPlayerGroup = new THREE.Group();

    // Armored Torso
    const torsoGeo = new THREE.BoxGeometry(18, 24, 12);
    const torsoMat = new THREE.MeshStandardMaterial({
      color: 0x243248,
      emissive: 0x0c1626,
      emissiveIntensity: 0.4,
      metalness: 0.7,
      roughness: 0.25
    });
    this.tpBodyMesh = new THREE.Mesh(torsoGeo, torsoMat);
    this.tpBodyMesh.position.y = 22;
    this.thirdPersonPlayerGroup.add(this.tpBodyMesh);

    // Glowing Chest Reactor (Front)
    const coreGeo = new THREE.SphereGeometry(4.5, 16, 16);
    const coreMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff });
    this.tpCoreMesh = new THREE.Mesh(coreGeo, coreMat);
    this.tpCoreMesh.position.set(0, 24, 6.2);
    this.thirdPersonPlayerGroup.add(this.tpCoreMesh);

    // Jetpack & Thrusters on Back
    const jetpackGeo = new THREE.BoxGeometry(12, 16, 6);
    const jetpackMat = new THREE.MeshStandardMaterial({ color: 0x162030, metalness: 0.8 });
    this.tpJetpackMesh = new THREE.Mesh(jetpackGeo, jetpackMat);
    this.tpJetpackMesh.position.set(0, 24, -8);
    this.thirdPersonPlayerGroup.add(this.tpJetpackMesh);

    const thrusterGeo = new THREE.CylinderGeometry(2, 2.5, 5, 12);
    const thrusterMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff });
    this.tpThrusterLeft = new THREE.Mesh(thrusterGeo, thrusterMat);
    this.tpThrusterLeft.position.set(-3.5, 14, -8);
    this.thirdPersonPlayerGroup.add(this.tpThrusterLeft);

    this.tpThrusterRight = new THREE.Mesh(thrusterGeo, thrusterMat);
    this.tpThrusterRight.position.set(3.5, 14, -8);
    this.thirdPersonPlayerGroup.add(this.tpThrusterRight);

    // Armored Shoulder Pauldrons
    const shoulderGeo = new THREE.BoxGeometry(7, 7, 8);
    const shoulderMat = new THREE.MeshStandardMaterial({
      color: 0x00f0ff,
      emissive: 0x00f0ff,
      emissiveIntensity: 0.8,
      metalness: 0.5
    });
    this.tpLeftShoulder = new THREE.Mesh(shoulderGeo, shoulderMat);
    this.tpLeftShoulder.position.set(-12, 30, 0);
    this.thirdPersonPlayerGroup.add(this.tpLeftShoulder);

    this.tpRightShoulder = new THREE.Mesh(shoulderGeo, shoulderMat);
    this.tpRightShoulder.position.set(12, 30, 0);
    this.thirdPersonPlayerGroup.add(this.tpRightShoulder);

    // Helmet
    const headGeo = new THREE.BoxGeometry(11, 11, 11);
    const headMat = new THREE.MeshStandardMaterial({
      color: 0x223048,
      emissive: 0x0b1626,
      emissiveIntensity: 0.4,
      metalness: 0.8
    });
    this.tpHeadMesh = new THREE.Mesh(headGeo, headMat);
    this.tpHeadMesh.position.y = 39;
    this.thirdPersonPlayerGroup.add(this.tpHeadMesh);

    // Glowing Visor
    const visorGeo = new THREE.BoxGeometry(9, 3.5, 3.5);
    const visorMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff });
    this.tpVisorMesh = new THREE.Mesh(visorGeo, visorMat);
    this.tpVisorMesh.position.set(0, 39, 5.5);
    this.thirdPersonPlayerGroup.add(this.tpVisorMesh);

    // Limbs
    const limbGeo = new THREE.BoxGeometry(5.5, 17, 5.5);
    const limbMat = new THREE.MeshStandardMaterial({
      color: 0x182438,
      emissive: 0x081220,
      emissiveIntensity: 0.4,
      metalness: 0.6
    });
    
    this.tpLeftArm = new THREE.Mesh(limbGeo, limbMat);
    this.tpLeftArm.position.set(-12, 22, 0);
    this.thirdPersonPlayerGroup.add(this.tpLeftArm);

    this.tpRightArm = new THREE.Mesh(limbGeo, limbMat);
    this.tpRightArm.position.set(12, 22, 0);
    this.thirdPersonPlayerGroup.add(this.tpRightArm);

    this.tpLeftLeg = new THREE.Mesh(limbGeo, limbMat);
    this.tpLeftLeg.position.set(-5.5, 8.5, 0);
    this.thirdPersonPlayerGroup.add(this.tpLeftLeg);

    this.tpRightLeg = new THREE.Mesh(limbGeo, limbMat);
    this.tpRightLeg.position.set(5.5, 8.5, 0);
    this.thirdPersonPlayerGroup.add(this.tpRightLeg);

    // Blaster in hand
    const blasterGeo = new THREE.BoxGeometry(3, 4, 12);
    const blasterMat = new THREE.MeshStandardMaterial({
      color: 0x223048,
      emissive: 0x00f0ff,
      emissiveIntensity: 0.6
    });
    this.tpBlasterMesh = new THREE.Mesh(blasterGeo, blasterMat);
    this.tpBlasterMesh.position.set(13, 16, 6);
    this.thirdPersonPlayerGroup.add(this.tpBlasterMesh);

    // Glowing Holographic Ground Halo Ring
    const groundRingGeo = new THREE.RingGeometry(24, 28, 32);
    const groundRingMat = new THREE.MeshBasicMaterial({
      color: 0x00f0ff,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.7
    });
    this.tpGroundRingMesh = new THREE.Mesh(groundRingGeo, groundRingMat);
    this.tpGroundRingMesh.rotation.x = -Math.PI / 2;
    this.tpGroundRingMesh.position.y = 1;
    this.thirdPersonPlayerGroup.add(this.tpGroundRingMesh);

    this.scene.add(this.thirdPersonPlayerGroup);
  }

  private setupParticleSystem() {
    this.particlePositions = new Float32Array(this.MAX_3D_PARTICLES * 3);
    this.particleColors = new Float32Array(this.MAX_3D_PARTICLES * 3);

    this.particleGeo = new THREE.BufferGeometry();
    this.particleGeo.setAttribute('position', new THREE.BufferAttribute(this.particlePositions, 3));
    this.particleGeo.setAttribute('color', new THREE.BufferAttribute(this.particleColors, 3));

    const particleMat = new THREE.PointsMaterial({
      size: 6,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending
    });

    this.particleSystem = new THREE.Points(this.particleGeo, particleMat);
    this.scene.add(this.particleSystem);
  }

  private onMouseMove = (e: MouseEvent) => {
    if (!this.isPointerLocked) return;
    this.yaw -= e.movementX * this.sensitivity;
    this.pitch -= e.movementY * this.sensitivity;
    // Clamp pitch to avoid screen flipping
    this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch));

    // Record mouse delta for fluid weapon sway & lag
    this.lastMouseDeltaX = e.movementX;
    this.lastMouseDeltaY = e.movementY;
  };

  private onMouseDown = (e: MouseEvent) => {
    if (!this.isPointerLocked) return;
    if (e.button === 0) {
      this.isShooting = true;
    } else if (e.button === 2) {
      this.isAimingDownSights = true;
    }
  };

  private onMouseUp = (e: MouseEvent) => {
    if (e.button === 0) {
      this.isShooting = false;
    } else if (e.button === 2) {
      this.isAimingDownSights = false;
    }
  };

  private onContextMenu = (e: MouseEvent) => {
    if (this.isPointerLocked) {
      e.preventDefault();
    }
  };

  private onDebugKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'F8') {
      this.debugAim = !this.debugAim;
      if (this.debugAimGroup) this.debugAimGroup.visible = this.debugAim;
    }
  };

  private onPointerLockChange = () => {
    this.isPointerLocked = document.pointerLockElement === this.renderer.domElement;
    if (!this.isPointerLocked) {
      this.isShooting = false;
      this.isAimingDownSights = false;
    }
  };

  private setupPointerLock() {
    window.addEventListener('mousemove', this.onMouseMove);
    window.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
    window.addEventListener('contextmenu', this.onContextMenu);
    window.addEventListener('keydown', this.onDebugKeyDown);
    document.addEventListener('pointerlockchange', this.onPointerLockChange);
  }

  requestPointerLock() {
    if (this.renderer.domElement && document.pointerLockElement !== this.renderer.domElement) {
      try {
        const request = this.renderer.domElement.requestPointerLock();
        request?.catch(() => {
          this.isShooting = false;
          this.isAimingDownSights = false;
        });
      } catch {
        this.isShooting = false;
        this.isAimingDownSights = false;
      }
    }
  }

  exitPointerLock() {
    if (document.exitPointerLock && document.pointerLockElement) {
      document.exitPointerLock();
    }
  }

  triggerMuzzleFlash(color: string = '#00f0ff') {
    this.muzzleFlashTimer = 48;
    this.recoilOffset = Math.min(0.72, this.recoilOffset + (this.isAimingDownSights ? 0.18 : 0.34));
    this.recoilRotOffset = Math.min(0.15, this.recoilRotOffset + (this.isAimingDownSights ? 0.025 : 0.06));
    this.heatVentIntensity = Math.min(1.5, this.heatVentIntensity + 0.7);
    const c = parseHexColor(color, 0x00f0ff);
    (this.muzzleFlashMesh.material as THREE.MeshBasicMaterial).color.copy(c);
    (this.muzzleFlashMesh.material as THREE.MeshBasicMaterial).opacity = 1;
    (this.muzzleFlashCone.material as THREE.MeshBasicMaterial).color.copy(c);
    (this.muzzleFlashCone.material as THREE.MeshBasicMaterial).opacity = 0.82;
    (this.muzzleFlashRing.material as THREE.MeshBasicMaterial).color.copy(c);
    (this.muzzleFlashRing.material as THREE.MeshBasicMaterial).opacity = 0.72;
    this.muzzleFlashCone.rotation.z = Math.random() * Math.PI;
    this.muzzleFlashRing.rotation.z = Math.random() * Math.PI;
    this.muzzleFlashLight.color.copy(c);
    this.muzzleFlashLight.intensity = 5.5;
  }

  // Calculates the EXACT real-time 3D world coordinate and direction of the gun barrel bore
  getMuzzleWorldTransform(): {
    position: { x: number; y: number; z: number };
    forward: { x: number; y: number; z: number };
    forward2D: { x: number; y: number };
  } {
    if (this.weaponMuzzlePoint && this.fpsWeaponGroup) {
      this.viewmodelCamera.updateMatrixWorld(true);
      this.weaponMuzzlePoint.getWorldPosition(this.tempMuzzlePos);

      this.weaponMuzzlePoint.getWorldQuaternion(this.tempMuzzleQuat);
      this.tempMuzzleFwd.set(0, 0, -1).applyQuaternion(this.tempMuzzleQuat).normalize();

      const fwd2DLen = Math.hypot(this.tempMuzzleFwd.x, this.tempMuzzleFwd.z);
      const fwd2D = fwd2DLen > 0.0001
        ? { x: this.tempMuzzleFwd.x / fwd2DLen, y: this.tempMuzzleFwd.z / fwd2DLen }
        : { x: -Math.sin(this.yaw), y: -Math.cos(this.yaw) };

      return {
        position: { x: this.tempMuzzlePos.x, y: this.tempMuzzlePos.y, z: this.tempMuzzlePos.z },
        forward: { x: this.tempMuzzleFwd.x, y: this.tempMuzzleFwd.y, z: this.tempMuzzleFwd.z },
        forward2D: fwd2D
      };
    }

    const forwardX = -Math.sin(this.yaw);
    const forwardY = -Math.cos(this.yaw);
    return {
      position: { x: 0, y: 24, z: 0 },
      forward: { x: forwardX, y: 0, z: forwardY },
      forward2D: { x: forwardX, y: forwardY }
    };
  }

  /**
   * Projects the separately-rendered viewmodel muzzle back into the world
   * camera. This preserves exact on-screen barrel alignment even though the
   * world and weapon deliberately use different FOV values.
   */
  private getProjectedMuzzleWorldPosition(): THREE.Vector3 {
    this.camera.updateMatrixWorld(true);
    this.viewmodelCamera.updateMatrixWorld(true);
    this.weaponMuzzlePoint.getWorldPosition(this.tempMuzzlePos);
    const muzzleDepth = THREE.MathUtils.clamp(
      this.tempMuzzlePos.distanceTo(this.viewmodelCamera.position),
      6,
      32
    );
    this.tempMuzzleNdc.copy(this.tempMuzzlePos).project(this.viewmodelCamera);
    this.tempMuzzleNdc2.set(this.tempMuzzleNdc.x, this.tempMuzzleNdc.y);
    this.tempRaycaster.setFromCamera(this.tempMuzzleNdc2, this.camera);
    this.tempRaycaster.ray.at(muzzleDepth, this.tempMuzzlePos);
    return this.tempMuzzlePos;
  }

  getFireSolution(enemies: Enemy[] = []): FireSolution {
    this.camera.updateMatrixWorld(true);
    this.camera.getWorldPosition(this.tempCameraPos);
    this.camera.getWorldDirection(this.tempCameraFwd);
    this.tempRaycaster.setFromCamera(this.centerNdc, this.camera);

    let aimPoint: THREE.Vector3 | undefined;
    if (enemies.length > 0 && this.enemyMeshes.size > 0) {
      const candidates = enemies
        .map(enemy => this.enemyMeshes.get(enemy.id))
        .filter((mesh): mesh is THREE.Object3D => Boolean(mesh));
      const hit = this.tempRaycaster.intersectObjects(candidates, true)[0];
      if (hit) {
        this.tempAimPoint.copy(hit.point);
        aimPoint = this.tempAimPoint;
      }
    }

    const muzzle = this.getProjectedMuzzleWorldPosition();
    const solution = solveMuzzleConvergence(
      this.tempCameraPos,
      this.tempCameraFwd,
      muzzle,
      aimPoint,
      2600,
      false
    );
    this.lastFireSolution = solution;
    this.updateAimDebug(solution);
    return solution;
  }

  private damp(current: number, target: number, sharpness: number, deltaTime: number): number {
    return THREE.MathUtils.lerp(current, target, 1 - Math.exp(-sharpness * deltaTime / 1000));
  }

  /**
   * Runs before weapon simulation so muzzle sampling and the rendered pose are
   * from the same frame. This removes the subtle one-frame barrel lag.
   */
  prepareFrame(engine: GameEngine, deltaTime: number) {
    if (engine.viewMode !== 'FIRST_PERSON') return;
    const player = engine.player;
    const targetAds = this.isAimingDownSights ? 1 : 0;
    this.adsProgress = this.damp(this.adsProgress, targetAds, 17, deltaTime);

    this.idleBreathTimer += deltaTime * 0.002;
    const isMoving = Math.abs(player.velocity.x) > 0.1 || Math.abs(player.velocity.y) > 0.1;
    if (isMoving) this.walkBobTimer += deltaTime * 0.012;

    const adsDamp = 1 - this.adsProgress * 0.88;
    const breathX = Math.sin(this.idleBreathTimer) * 0.14 * adsDamp;
    const breathY = Math.cos(this.idleBreathTimer * 2) * 0.08 * adsDamp;
    const bobY = (isMoving ? Math.sin(this.walkBobTimer) * 0.55 : breathY) * adsDamp;
    const bobX = (isMoving ? Math.cos(this.walkBobTimer * 0.5) * 0.3 : breathX) * adsDamp;

    const baseFov = engine.isDashing ? this.WORLD_DASH_FOV : this.WORLD_FOV;
    const targetWorldFov = THREE.MathUtils.lerp(baseFov, this.ADS_FOV, this.adsProgress);
    const targetViewmodelFov = THREE.MathUtils.lerp(this.VIEWMODEL_FOV, this.VIEWMODEL_ADS_FOV, this.adsProgress);
    this.camera.fov = this.damp(this.camera.fov, targetWorldFov, 13, deltaTime);
    this.viewmodelCamera.fov = this.damp(this.viewmodelCamera.fov, targetViewmodelFov, 15, deltaTime);
    this.camera.updateProjectionMatrix();
    this.viewmodelCamera.updateProjectionMatrix();
    this.sensitivity = THREE.MathUtils.lerp(0.0022, 0.00105, this.adsProgress);

    const shakeMult = 1 - this.adsProgress * 0.7;
    const shakeX = (Math.random() - 0.5) * engine.screenShake * 0.8 * shakeMult;
    const shakeY = (Math.random() - 0.5) * engine.screenShake * 0.8 * shakeMult;
    this.camera.position.set(
      player.position.x + bobX * 0.2 + shakeX,
      26 + bobY * 0.2 + shakeY,
      player.position.y
    );
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.set(this.pitch, this.yaw, 0);

    // The viewmodel camera follows the world camera pose but owns its projection.
    this.viewmodelCamera.position.copy(this.camera.position);
    this.viewmodelCamera.quaternion.copy(this.camera.quaternion);

    const targetSwayX = THREE.MathUtils.clamp(-this.lastMouseDeltaX * 0.0017, -0.22, 0.22);
    const targetSwayY = THREE.MathUtils.clamp(this.lastMouseDeltaY * 0.0017, -0.16, 0.16);
    const targetSwayTilt = THREE.MathUtils.clamp(-this.lastMouseDeltaX * 0.003, -0.12, 0.12);
    const inputDecay = Math.exp(-12 * deltaTime / 1000);
    this.lastMouseDeltaX *= inputDecay;
    this.lastMouseDeltaY *= inputDecay;
    this.swayX = this.damp(this.swayX, targetSwayX, 14, deltaTime);
    this.swayY = this.damp(this.swayY, targetSwayY, 14, deltaTime);
    this.swayTilt = this.damp(this.swayTilt, targetSwayTilt, 12, deltaTime);

    this.recoilOffset *= Math.exp(-15 * deltaTime / 1000);
    this.recoilRotOffset *= Math.exp(-18 * deltaTime / 1000);
    this.heatVentIntensity *= Math.exp(-2.8 * deltaTime / 1000);
    this.armHydraulicPiston.position.z = 0.65 + this.recoilOffset * 0.32;
    this.barrelRoot.position.z = this.recoilOffset * 0.24;

    if (this.muzzleFlashTimer > 0) {
      this.muzzleFlashTimer -= deltaTime;
      const flashLife = THREE.MathUtils.clamp(this.muzzleFlashTimer / 48, 0, 1);
      (this.muzzleFlashMesh.material as THREE.MeshBasicMaterial).opacity = flashLife;
      (this.muzzleFlashCone.material as THREE.MeshBasicMaterial).opacity = flashLife * 0.82;
      (this.muzzleFlashRing.material as THREE.MeshBasicMaterial).opacity = flashLife * 0.72;
      this.muzzleFlashLight.intensity = flashLife * 5.5;
    } else {
      (this.muzzleFlashMesh.material as THREE.MeshBasicMaterial).opacity = 0;
      (this.muzzleFlashCone.material as THREE.MeshBasicMaterial).opacity = 0;
      (this.muzzleFlashRing.material as THREE.MeshBasicMaterial).opacity = 0;
      this.muzzleFlashLight.intensity = 0;
    }

    const dashPullback = engine.isDashing ? 0.65 : 0;
    const hipX = 1.85 + bobX * 0.16 + this.swayX * adsDamp;
    const hipY = -2.08 + bobY * 0.2 + this.swayY * adsDamp - dashPullback * 0.22;
    const hipZ = -6.05 + this.recoilOffset * 0.55 + dashPullback * 0.5;

    // Optic center is local Y=1.48, so -1.48 aligns it to camera center.
    const adsX = this.swayX * 0.035;
    const adsY = -1.48 + this.swayY * 0.035;
    const adsZ = -6.05 + this.recoilOffset * 0.18;
    this.fpsWeaponGroup.position.set(
      THREE.MathUtils.lerp(hipX, adsX, this.adsProgress),
      THREE.MathUtils.lerp(hipY, adsY, this.adsProgress),
      THREE.MathUtils.lerp(hipZ, adsZ, this.adsProgress)
    );

    const hipRotX = bobY * 0.025 - this.recoilRotOffset * 0.6 + this.swayY * 0.24 + dashPullback * 0.1;
    const hipRotY = bobX * 0.025 + this.swayX * 0.24 - 0.035;
    const hipRotZ = this.swayTilt - dashPullback * 0.07;
    this.fpsWeaponGroup.rotation.set(
      THREE.MathUtils.lerp(hipRotX, -this.recoilRotOffset * 0.2, this.adsProgress),
      THREE.MathUtils.lerp(hipRotY, this.swayX * 0.03, this.adsProgress),
      THREE.MathUtils.lerp(hipRotZ, 0, this.adsProgress)
    );
    this.camera.updateMatrixWorld(true);
    this.viewmodelCamera.updateMatrixWorld(true);
  }

  // Render loop called once per frame from GameEngine
  render(engine: GameEngine, deltaTime: number) {
    const player = engine.player;
    const viewMode = engine.viewMode;
    const op = OPERATOR_DEFINITIONS.find(o => o.id === player.operatorId) || OPERATOR_DEFINITIONS[0];

    // Safely parse Operator Colors with cached lookup
    const primaryColor = parseHexColor(op.color, 0x00f0ff);
    const secondaryColor = parseHexColor(op.colorSecondary, 0x0d5e5e);
    const darkColor = parseHexColor(op.colorDark, 0x0a3d3d);
    const glowColor = parseHexColor(op.colorGlow, 0x00f0ff);
    const visorColor = parseHexColor(op.colorVisor, 0x00ffff);
    const limbsColor = parseHexColor(op.colorLimbs, 0x00b8b8);
    const bootsColor = parseHexColor(op.colorBoots, 0x006666);

    // 1. Update Player Point Light & Viewmodel Glow
    this.playerPointLight.color.copy(primaryColor);
    this.playerPointLight.position.set(player.position.x, 32, player.position.y);
    this.vmGlowLight.color.copy(primaryColor);

    // 2. Update First-Person Viewmodel Materials with Operator Palette
    (this.weaponChassis.material as THREE.MeshStandardMaterial).color.copy(secondaryColor);
    (this.weaponChassis.material as THREE.MeshStandardMaterial).emissive.copy(darkColor);
    (this.weaponTopPlate.material as THREE.MeshStandardMaterial).color.copy(primaryColor).multiplyScalar(0.48);
    (this.weaponTopPlate.material as THREE.MeshStandardMaterial).emissive.copy(primaryColor).multiplyScalar(0.42);
    (this.weaponGrip.material as THREE.MeshStandardMaterial).color.copy(darkColor);
    (this.weaponSightMount.material as THREE.MeshStandardMaterial).color.copy(secondaryColor);
    (this.weaponSightMount.material as THREE.MeshStandardMaterial).emissive.copy(darkColor);
    (this.weaponSightReticleDot.material as THREE.MeshBasicMaterial).color.copy(visorColor);
    (this.weaponSightReticleRing.material as THREE.MeshBasicMaterial).color.copy(primaryColor);
    (this.weaponSightFrontBead.material as THREE.MeshBasicMaterial).color.copy(visorColor);
    (this.weaponRailUpper.material as THREE.MeshStandardMaterial).emissive.copy(primaryColor);
    (this.weaponRailLower.material as THREE.MeshStandardMaterial).emissive.copy(primaryColor);
    (this.weaponQuantumCore.material as THREE.MeshBasicMaterial).color.copy(visorColor);
    (this.weaponMuzzleBrake.material as THREE.MeshStandardMaterial).emissive.copy(primaryColor);

    // Dynamic ADS Optic Reticle scaling & glow
    const reticlePulse = 1.0 + Math.sin(Date.now() * 0.008) * 0.05;
    const reticleScale = THREE.MathUtils.lerp(1.15, 0.95, this.adsProgress) * reticlePulse;
    this.weaponSightReticleDot.scale.setScalar(reticleScale);
    this.weaponSightReticleRing.scale.setScalar(reticleScale);
    (this.weaponSightReticleDot.material as THREE.MeshBasicMaterial).opacity = THREE.MathUtils.lerp(0.8, 1.0, this.adsProgress);
    (this.weaponSightReticleRing.material as THREE.MeshBasicMaterial).opacity = THREE.MathUtils.lerp(0.5, 0.85, this.adsProgress);

    // Magnetic Coils & Cooling Fins glow
    this.heatVentIntensity *= 0.94;
    for (const coil of this.weaponMagCoils) {
      (coil.material as THREE.MeshStandardMaterial).color.copy(primaryColor);
      (coil.material as THREE.MeshStandardMaterial).emissive.copy(primaryColor);
      (coil.material as THREE.MeshStandardMaterial).emissiveIntensity = 1.5 + this.heatVentIntensity * 1.5;
    }
    for (const fin of this.weaponCoolingFins) {
      (fin.material as THREE.MeshStandardMaterial).color.copy(primaryColor);
      (fin.material as THREE.MeshStandardMaterial).emissive.copy(primaryColor);
      (fin.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.8 + this.heatVentIntensity * 2.0;
    }
    for (const led of this.weaponBatteryLEDs) {
      (led.material as THREE.MeshBasicMaterial).color.copy(primaryColor);
    }

    // Arm & Gauntlet Colors
    (this.armForearmMain.material as THREE.MeshStandardMaterial).color.copy(darkColor);
    (this.armForearmMain.material as THREE.MeshStandardMaterial).emissive.copy(darkColor);
    (this.armCarbonPlate.material as THREE.MeshStandardMaterial).color.copy(secondaryColor).multiplyScalar(0.3);
    (this.armChevronTrim.material as THREE.MeshStandardMaterial).color.copy(primaryColor).multiplyScalar(0.6);
    (this.armChevronTrim.material as THREE.MeshStandardMaterial).emissive.copy(primaryColor).multiplyScalar(0.55);
    (this.armPowerConduit1.material as THREE.MeshBasicMaterial).color.copy(primaryColor);
    (this.armPowerConduit2.material as THREE.MeshBasicMaterial).color.copy(primaryColor);
    (this.armPalm.material as THREE.MeshStandardMaterial).color.copy(secondaryColor);
    (this.armThumb.material as THREE.MeshStandardMaterial).color.copy(secondaryColor).multiplyScalar(0.42);
    for (const f of this.armFingers) {
      (f.material as THREE.MeshStandardMaterial).color.copy(secondaryColor).multiplyScalar(0.42);
    }
    for (const k of this.armFingerKnuckles) {
      (k.material as THREE.MeshBasicMaterial).color.copy(primaryColor);
    }
    (this.armWristHoloDisplay.material as THREE.MeshBasicMaterial).color.copy(visorColor);
    (this.armHoloLines.material as THREE.MeshBasicMaterial).color.copy(visorColor).multiplyScalar(0.65);

    // Rotate quantum core crystal inside chamber
    this.weaponQuantumCore.rotation.x += deltaTime * 0.004;
    this.weaponQuantumCore.rotation.y += deltaTime * 0.005;

    // 3. Update Third-Person Character Materials
    (this.tpBodyMesh.material as THREE.MeshStandardMaterial).color.copy(secondaryColor);
    (this.tpBodyMesh.material as THREE.MeshStandardMaterial).emissive.copy(darkColor);
    (this.tpHeadMesh.material as THREE.MeshStandardMaterial).color.copy(secondaryColor);
    (this.tpHeadMesh.material as THREE.MeshStandardMaterial).emissive.copy(darkColor);
    (this.tpLeftShoulder.material as THREE.MeshStandardMaterial).color.copy(primaryColor);
    (this.tpLeftShoulder.material as THREE.MeshStandardMaterial).emissive.copy(primaryColor);
    (this.tpRightShoulder.material as THREE.MeshStandardMaterial).color.copy(primaryColor);
    (this.tpRightShoulder.material as THREE.MeshStandardMaterial).emissive.copy(primaryColor);
    (this.tpVisorMesh.material as THREE.MeshBasicMaterial).color.copy(visorColor);
    (this.tpCoreMesh.material as THREE.MeshBasicMaterial).color.copy(visorColor);
    (this.tpThrusterLeft.material as THREE.MeshBasicMaterial).color.copy(primaryColor);
    (this.tpThrusterRight.material as THREE.MeshBasicMaterial).color.copy(primaryColor);
    (this.tpLeftArm.material as THREE.MeshStandardMaterial).color.copy(limbsColor);
    (this.tpRightArm.material as THREE.MeshStandardMaterial).color.copy(limbsColor);
    (this.tpLeftLeg.material as THREE.MeshStandardMaterial).color.copy(bootsColor);
    (this.tpRightLeg.material as THREE.MeshStandardMaterial).color.copy(bootsColor);
    (this.tpBlasterMesh.material as THREE.MeshStandardMaterial).emissive.copy(primaryColor);
    (this.tpGroundRingMesh.material as THREE.MeshBasicMaterial).color.copy(primaryColor);

    // ==========================================
    // CAMERA & VIEWPORT UPDATE
    // ==========================================
    if (viewMode === 'FIRST_PERSON') {
      this.fpsWeaponGroup.visible = true;
      this.thirdPersonPlayerGroup.visible = false;
    } else if (viewMode === 'THIRD_PERSON') {
      this.fpsWeaponGroup.visible = false;
      this.thirdPersonPlayerGroup.visible = true;

      // Third Person High FOV (92° standard, 108° dash)
      const targetFov = engine.isDashing ? 108 : 92;
      this.camera.fov += (targetFov - this.camera.fov) * 0.14;
      this.camera.updateProjectionMatrix();

      // Third Person Chase Camera behind player
      const chaseDist = 220;
      const camHeight = 120;
      
      const camOffsetX = Math.sin(this.yaw) * Math.cos(this.pitch) * chaseDist;
      const camOffsetZ = Math.cos(this.yaw) * Math.cos(this.pitch) * chaseDist;
      const camOffsetY = Math.sin(this.pitch) * chaseDist + camHeight;

      this.camera.position.set(
        player.position.x + camOffsetX,
        Math.max(20, camOffsetY),
        player.position.y + camOffsetZ
      );
      this.camera.lookAt(player.position.x, 26, player.position.y);

      // Position Third-Person Character
      this.thirdPersonPlayerGroup.position.set(player.position.x, 0, player.position.y);
      this.thirdPersonPlayerGroup.rotation.y = this.yaw + Math.PI;

      // Halo ring rotation & pulse
      this.tpGroundRingMesh.rotation.z += deltaTime * 0.002;

      // Leg & arm walk swing
      const isMoving = Math.abs(player.velocity.x) > 0.1 || Math.abs(player.velocity.y) > 0.1;
      if (isMoving) {
        this.walkBobTimer += deltaTime * 0.012;
        const swing = Math.sin(this.walkBobTimer) * 0.7;
        this.tpLeftLeg.rotation.x = swing;
        this.tpRightLeg.rotation.x = -swing;
        this.tpLeftArm.rotation.x = -swing * 0.6;
        this.tpRightArm.rotation.x = swing * 0.6;
      } else {
        this.tpLeftLeg.rotation.x = 0;
        this.tpRightLeg.rotation.x = 0;
        this.tpLeftArm.rotation.x = 0;
        this.tpRightArm.rotation.x = 0;
      }
    }

    // 1. Render Enemies in 3D
    this.updateEnemies3D(engine.enemies, deltaTime);

    // 2. Render Projectiles in 3D
    this.updateProjectiles3D(engine.projectiles, deltaTime);

    // 3. Render Gems in 3D
    this.updateGems3D(engine.gems, deltaTime);

    // 4. Render World Items in 3D
    this.updateItems3D(engine.items, deltaTime);

    // 5. Render Treasures in 3D
    this.updateTreasures3D(engine.treasures, deltaTime);

    // 6. Render Portal in 3D
    this.updatePortal3D(engine.portals, engine.activePortalIndex, deltaTime);

    // 7. Update 3D Particles
    this.updateParticles3D(engine.particles);

    if (this.debugAim && this.lastFireSolution) this.updateAimDebug(this.lastFireSolution);

    // World and viewmodel use separate projections. clearDepth keeps the gun
    // readable without allowing world geometry to cut through the hand.
    this.renderer.render(this.scene, this.camera);
    if (viewMode === 'FIRST_PERSON') {
      this.renderer.autoClear = false;
      this.renderer.clearDepth();
      this.renderer.render(this.viewmodelScene, this.viewmodelCamera);
      this.renderer.autoClear = true;
    }
  }

  private updateEnemies3D(enemies: Enemy[], deltaTime: number) {
    const activeEnemyIds = new Set<string>();
    const now = Date.now();

    for (const enemy of enemies) {
      activeEnemyIds.add(enemy.id);
      let mesh = this.enemyMeshes.get(enemy.id);

      if (!mesh) {
        mesh = this.createEnemyMesh(enemy);
        this.scene.add(mesh);
        this.enemyMeshes.set(enemy.id, mesh);
      }

      // Position in 3D (x = 2D.x, z = 2D.y, y = elevation)
      const baseHeight = enemy.type === 'titan' ? 36 : (enemy.type === 'phantom' ? 24 : 14);
      const floatBob = enemy.type === 'phantom' ? Math.sin(now * 0.005 + (parseInt(enemy.id, 36) || 0)) * 8 : 0;

      mesh.position.set(enemy.position.x, baseHeight + floatBob, enemy.position.y);

      // Rotate toward player
      const dirX = this.camera.position.x - enemy.position.x;
      const dirZ = this.camera.position.z - enemy.position.y;
      mesh.rotation.y = Math.atan2(dirX, dirZ);

      // Hit Flash feedback
      const mainMat = (mesh as any)._mainMaterial as THREE.MeshStandardMaterial;
      if (mainMat) {
        if (enemy.hitFlash && enemy.hitFlash > 0) {
          mainMat.emissive.setHex(0xffffff);
          mainMat.emissiveIntensity = 2.5;
        } else {
          mainMat.emissive.copy(parseHexColor(enemy.color, 0xff0055));
          mainMat.emissiveIntensity = 0.8;
        }
      }
    }

    // Cleanup dead enemies
    for (const [id, mesh] of this.enemyMeshes.entries()) {
      if (!activeEnemyIds.has(id)) {
        this.scene.remove(mesh);
        this.enemyMeshes.delete(id);
      }
    }
  }

  private createEnemyMesh(enemy: Enemy): THREE.Object3D {
    const group = new THREE.Group();
    const radius = enemy.radius || 15;
    const color = parseHexColor(enemy.color, 0xff3366);

    const material = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.8,
      metalness: 0.5,
      roughness: 0.3
    });
    (group as any)._mainMaterial = material;

    let geo: THREE.BufferGeometry;

    switch (enemy.type) {
      case 'fast':
        // Razor Triangle / Cone
        geo = new THREE.ConeGeometry(radius * 0.9, radius * 1.8, 4);
        break;
      case 'tank':
        // Armored heavy cube
        geo = new THREE.BoxGeometry(radius * 1.6, radius * 1.6, radius * 1.6);
        break;
      case 'ranged':
        // Diamond Spire (Octahedron)
        geo = new THREE.OctahedronGeometry(radius * 1.1, 0);
        break;
      case 'elite':
        // Golden Icosahedron
        geo = new THREE.IcosahedronGeometry(radius * 1.2, 0);
        break;
      case 'phantom':
        // Ghost wireframe sphere + core
        geo = new THREE.SphereGeometry(radius * 1.1, 8, 8);
        material.wireframe = true;
        material.transparent = true;
        material.opacity = 0.75;
        break;
      case 'titan':
      case 'boss':
        // Giant Star / Mech Colossus
        geo = new THREE.DodecahedronGeometry(radius * 1.4, 0);
        break;
      case 'basic':
      default:
        // Pulsing geometric pyramid
        geo = new THREE.ConeGeometry(radius, radius * 1.5, 6);
        break;
    }

    const mainMesh = new THREE.Mesh(geo, material);
    group.add(mainMesh);

    // Glowing red eye / core
    const eyeGeo = new THREE.SphereGeometry(radius * 0.28, 8, 8);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff0033 });
    const eyeMesh = new THREE.Mesh(eyeGeo, eyeMat);
    eyeMesh.position.set(0, 0, radius * 0.8);
    group.add(eyeMesh);

    return group;
  }

  private updateProjectiles3D(projectiles: Projectile[], deltaTime: number) {
    const activeProjIds = new Set<string>();
    const now = Date.now();

    for (const p of projectiles) {
      activeProjIds.add(p.id);
      let mesh = this.projectileMeshes.get(p.id);

      if (!mesh) {
        mesh = this.createProjectileMesh(p);
        this.scene.add(mesh);
        this.projectileMeshes.set(p.id, mesh);
      }

      // Real-time 3D vertical elevation and pitch tracking
      if (p.vz !== undefined && p.z !== undefined) {
        p.z += p.vz * (deltaTime / 16.666);
      }

      // Height determination based on weapon type
      let defaultHeight = 24;
      if (p.sourceWeaponId === 'void_aura' || p.sourceWeaponId === 'frost_aura') {
        defaultHeight = 20;
      } else if (p.sourceWeaponId === 'gravity_well') {
        defaultHeight = 16;
      } else if (p.sourceWeaponId === 'orbit_drones' || p.sourceWeaponId === 'data_scythe') {
        defaultHeight = 22;
      } else if (p.sourceWeaponId === 'void_tendrils') {
        defaultHeight = 8;
      } else if (p.sourceWeaponId === 'arc_weaver' || p.id === 'arc_web' || p.id === 'arc_zap') {
        defaultHeight = 18;
      } else if (p.sourceWeaponId === 'stardust') {
        // Meteors fall from sky toward ground
        p.z = Math.max(2, (p.z ?? 140) - deltaTime * 0.25);
      }

      // Auras and player-centered abilities track the player's 3D position directly
      if (p.sourceWeaponId === 'void_aura' || p.sourceWeaponId === 'frost_aura' || p.id === 'aura') {
        mesh.position.set(p.position.x, 20, p.position.y);
      } else {
        const projHeight = p.z !== undefined ? p.z : defaultHeight;
        mesh.position.set(p.position.x, projHeight, p.position.y);
      }

      // Projectiles are gameplay-sized in the 2D simulation. Ease their visual
      // size in near the muzzle so they emerge as a tracer instead of filling
      // the camera on their first frame.
      if (p.sourceWeaponId === 'plasma_gun' || p.sourceWeaponId === 'neon_shards') {
        const cameraDistance = mesh.position.distanceTo(this.camera.position);
        const nearMuzzleScale = THREE.MathUtils.smoothstep(cameraDistance, 8, 70);
        mesh.scale.setScalar(THREE.MathUtils.lerp(0.12, 1, nearMuzzleScale));
      }

      // Rotations & dynamic animations
      if (p.sourceWeaponId === 'gravity_well') {
        // Accretion disk spinning
        mesh.rotation.y += deltaTime * 0.006;
      } else if (p.sourceWeaponId === 'orbit_drones') {
        mesh.rotation.y += deltaTime * 0.008;
      } else if (p.sourceWeaponId === 'mirror_shards' || p.sourceWeaponId === 'nano_swarm') {
        mesh.rotation.y += deltaTime * 0.007;
        mesh.rotation.x += deltaTime * 0.005;
      } else if (p.sourceWeaponId === 'phantom_chain' || p.id === 'arc_web') {
        // High-frequency electric jitter
        if (p.rotation !== undefined) {
          mesh.rotation.y = -p.rotation + Math.PI / 2 + (Math.random() - 0.5) * 0.08;
        }
      } else if (p.rotation !== undefined) {
        mesh.rotation.y = -p.rotation + Math.PI / 2;
        if (p.vz !== undefined) {
          mesh.rotation.x = Math.atan2(p.vz, 18);
        }
      }
    }

    // Cleanup dead projectiles
    for (const [id, mesh] of this.projectileMeshes.entries()) {
      if (!activeProjIds.has(id)) {
        this.scene.remove(mesh);
        this.projectileMeshes.delete(id);
      }
    }
  }

  private createProjectileMesh(p: Projectile): THREE.Object3D {
    const color = parseHexColor(p.color, 0x00f0ff);
    const radius = Math.max(3, p.radius || 6);
    const weaponId = p.sourceWeaponId || p.id;

    // 1. PHANTOM CHAIN / CHAIN LIGHTNING — Electrifying Jagged 3D Arc
    if (weaponId === 'phantom_chain' || weaponId === 'chain_bolt') {
      const group = new THREE.Group();
      const length = Math.max(20, radius * 2);
      const segments = 6;
      
      // Jagged zig-zag lightning beam
      const points: THREE.Vector3[] = [];
      points.push(new THREE.Vector3(0, 0, -length / 2));
      for (let s = 1; s < segments; s++) {
        const t = (s / segments) - 0.5;
        const jx = (Math.random() - 0.5) * 8;
        const jy = (Math.random() - 0.5) * 8;
        points.push(new THREE.Vector3(jx, jy, t * length));
      }
      points.push(new THREE.Vector3(0, 0, length / 2));

      // Electric glow line
      const curve = new THREE.CatmullRomCurve3(points);
      const tubeGeo = new THREE.TubeGeometry(curve, 16, 1.8, 6, false);
      const tubeMat = new THREE.MeshBasicMaterial({
        color: 0x00f0ff,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending
      });
      const tube = new THREE.Mesh(tubeGeo, tubeMat);
      group.add(tube);

      // White-hot internal core
      const coreTubeGeo = new THREE.TubeGeometry(curve, 16, 0.8, 6, false);
      const coreTubeMat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        blending: THREE.AdditiveBlending
      });
      const coreTube = new THREE.Mesh(coreTubeGeo, coreTubeMat);
      group.add(coreTube);

      // Endpoint electric discharge sparks
      const sparkGeo = new THREE.SphereGeometry(3, 8, 8);
      const sparkMat = new THREE.MeshBasicMaterial({ color: 0xffffff, blending: THREE.AdditiveBlending });
      const spark1 = new THREE.Mesh(sparkGeo, sparkMat);
      spark1.position.set(0, 0, -length / 2);
      group.add(spark1);
      const spark2 = new THREE.Mesh(sparkGeo, sparkMat);
      spark2.position.set(0, 0, length / 2);
      group.add(spark2);

      return group;
    }

    // 2. CYBER BLADE — Curved Energy Katana Slash Crescent
    if (weaponId === 'cyber_blade' || weaponId === 'blade') {
      const group = new THREE.Group();
      
      // Slanted crescent slash wave
      const arcGeo = new THREE.TorusGeometry(radius * 0.9, 2.5, 6, 24, Math.PI * 0.85);
      const arcMat = new THREE.MeshBasicMaterial({
        color: 0x00ffff,
        transparent: true,
        opacity: 0.95,
        blending: THREE.AdditiveBlending
      });
      const arcMesh = new THREE.Mesh(arcGeo, arcMat);
      arcMesh.rotation.x = Math.PI / 2;
      arcMesh.rotation.z = -Math.PI * 0.42;
      group.add(arcMesh);

      // White-hot razor inner edge
      const innerArcGeo = new THREE.TorusGeometry(radius * 0.88, 1.2, 6, 24, Math.PI * 0.8);
      const innerArcMat = new THREE.MeshBasicMaterial({ color: 0xffffff, blending: THREE.AdditiveBlending });
      const innerArcMesh = new THREE.Mesh(innerArcGeo, innerArcMat);
      innerArcMesh.rotation.x = Math.PI / 2;
      innerArcMesh.rotation.z = -Math.PI * 0.4;
      group.add(innerArcMesh);

      return group;
    }

    // 3. GRAVITY WELL / SINGULARITY — Volumetric Black Hole with Accretion Disk
    if (weaponId === 'gravity_well' || weaponId === 'singularity') {
      const group = new THREE.Group();

      // Pitch-black event horizon core
      const coreGeo = new THREE.SphereGeometry(radius * 0.35, 16, 16);
      const coreMat = new THREE.MeshStandardMaterial({
        color: 0x000000,
        metalness: 0.98,
        roughness: 0.1
      });
      const core = new THREE.Mesh(coreGeo, coreMat);
      group.add(core);

      // Glowing violet photon ring
      const photonGeo = new THREE.TorusGeometry(radius * 0.48, 1.5, 8, 32);
      const photonMat = new THREE.MeshBasicMaterial({
        color: 0xc084fc,
        blending: THREE.AdditiveBlending
      });
      const photon = new THREE.Mesh(photonGeo, photonMat);
      photon.rotation.x = Math.PI / 2 + 0.3;
      group.add(photon);

      // Tilted swirling accretion disk
      const diskGeo = new THREE.TorusGeometry(radius * 0.85, radius * 0.12, 8, 32);
      const diskMat = new THREE.MeshBasicMaterial({
        color: 0x7c3aed,
        transparent: true,
        opacity: 0.75,
        blending: THREE.AdditiveBlending
      });
      const disk = new THREE.Mesh(diskGeo, diskMat);
      disk.rotation.x = Math.PI / 2;
      group.add(disk);

      return group;
    }

    // 4. VOID AURA & FROST AURA — Volumetric Protective Shield Domes
    if (weaponId === 'void_aura' || weaponId === 'frost_aura') {
      const group = new THREE.Group();
      const isFrost = weaponId === 'frost_aura';
      const auraColor = isFrost ? 0x38bdf8 : 0x8b5cf6;

      // Volumetric translucent geodesic sphere
      const sphereGeo = new THREE.SphereGeometry(radius, 16, 12);
      const sphereMat = new THREE.MeshBasicMaterial({
        color: auraColor,
        transparent: true,
        opacity: 0.18,
        blending: THREE.AdditiveBlending
      });
      const sphere = new THREE.Mesh(sphereGeo, sphereMat);
      group.add(sphere);

      // Outer glowing energy grid
      const gridGeo = new THREE.IcosahedronGeometry(radius * 1.02, 1);
      const gridMat = new THREE.MeshBasicMaterial({
        color: isFrost ? 0xbae6fd : 0xd8b4fe,
        wireframe: true,
        transparent: true,
        opacity: 0.35,
        blending: THREE.AdditiveBlending
      });
      const gridMesh = new THREE.Mesh(gridGeo, gridMat);
      group.add(gridMesh);

      // Perimeter floor ring
      const ringGeo = new THREE.RingGeometry(radius * 0.92, radius, 32);
      const ringMat = new THREE.MeshBasicMaterial({
        color: auraColor,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.6,
        blending: THREE.AdditiveBlending
      });
      const ringMesh = new THREE.Mesh(ringGeo, ringMat);
      ringMesh.rotation.x = -Math.PI / 2;
      ringMesh.position.y = -18;
      group.add(ringMesh);

      return group;
    }

    // 5. NEURAL PULSE — Expanding Holographic Shockwave Dome
    if (weaponId === 'neural_pulse' || weaponId === 'pulse') {
      const group = new THREE.Group();

      // Floor ring
      const ringGeo = new THREE.RingGeometry(radius * 0.85, radius, 32);
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0x00ffff,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.75,
        blending: THREE.AdditiveBlending
      });
      const ringMesh = new THREE.Mesh(ringGeo, ringMat);
      ringMesh.rotation.x = -Math.PI / 2;
      group.add(ringMesh);

      // Expanding energy hemisphere
      const domeGeo = new THREE.SphereGeometry(radius, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.5);
      const domeMat = new THREE.MeshBasicMaterial({
        color: 0x00f0ff,
        transparent: true,
        opacity: 0.4,
        blending: THREE.AdditiveBlending
      });
      const domeMesh = new THREE.Mesh(domeGeo, domeMat);
      group.add(domeMesh);

      return group;
    }

    // 6. DATA SCYTHE — Dual Laser Scythe Blades
    if (weaponId === 'data_scythe' || weaponId === 'scythe') {
      const group = new THREE.Group();

      // Curved laser blade
      const bladeGeo = new THREE.TorusGeometry(radius * 1.1, 2.2, 6, 16, Math.PI * 0.7);
      const bladeMat = new THREE.MeshBasicMaterial({
        color: 0xff0044,
        transparent: true,
        opacity: 0.95,
        blending: THREE.AdditiveBlending
      });
      const blade = new THREE.Mesh(bladeGeo, bladeMat);
      blade.rotation.x = Math.PI / 2;
      group.add(blade);

      // Central emitter core
      const coreGeo = new THREE.SphereGeometry(3.5, 8, 8);
      const coreMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
      const core = new THREE.Mesh(coreGeo, coreMat);
      group.add(core);

      return group;
    }

    // 7. ORBIT DRONES — Hovering Tactical Cyber Drones
    if (weaponId === 'orbit_drones' || weaponId === 'orbit') {
      const group = new THREE.Group();

      // Drone Chassis
      const bodyGeo = new THREE.SphereGeometry(radius * 0.7, 10, 10);
      const bodyMat = new THREE.MeshStandardMaterial({
        color: 0x141c28,
        metalness: 0.9,
        roughness: 0.2
      });
      const body = new THREE.Mesh(bodyGeo, bodyMat);
      group.add(body);

      // Glowing Cyan Sensor Eye
      const eyeGeo = new THREE.SphereGeometry(radius * 0.3, 8, 8);
      const eyeMat = new THREE.MeshBasicMaterial({ color: 0x00ffff });
      const eye = new THREE.Mesh(eyeGeo, eyeMat);
      eye.position.set(0, 0, radius * 0.6);
      group.add(eye);

      // Spinning Magnetic Hover Ring
      const ringGeo = new THREE.TorusGeometry(radius * 1.2, 1.2, 6, 16);
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0x00f0ff,
        blending: THREE.AdditiveBlending
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      group.add(ring);

      return group;
    }

    // 8. SOLAR FLARE — Blazing Sunfire Plasma Cone
    if (weaponId === 'solar_flare' || weaponId === 'flare') {
      const group = new THREE.Group();
      
      const coneGeo = new THREE.ConeGeometry(radius * 0.7, radius * 2.2, 12, 1, true);
      const coneMat = new THREE.MeshBasicMaterial({
        color: 0xf59e0b,
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending
      });
      const cone = new THREE.Mesh(coneGeo, coneMat);
      cone.rotation.x = Math.PI / 2;
      group.add(cone);

      const innerGeo = new THREE.ConeGeometry(radius * 0.35, radius * 2.4, 10);
      const innerMat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        blending: THREE.AdditiveBlending
      });
      const innerCone = new THREE.Mesh(innerGeo, innerMat);
      innerCone.rotation.x = Math.PI / 2;
      group.add(innerCone);

      return group;
    }

    // 9. SPECTRAL HELIX — Entwined Glowing DNA Helix
    if (weaponId === 'spectral_helix' || weaponId === 'helix') {
      const group = new THREE.Group();

      const nodeGeo = new THREE.SphereGeometry(radius * 0.6, 8, 8);
      const nodeMat = new THREE.MeshBasicMaterial({ color, blending: THREE.AdditiveBlending });
      const node = new THREE.Mesh(nodeGeo, nodeMat);
      group.add(node);

      const ringGeo = new THREE.TorusGeometry(radius * 1.1, 0.8, 6, 16);
      const ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, blending: THREE.AdditiveBlending });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      group.add(ring);

      return group;
    }

    // 10. MIRROR SHARDS — Prismatic Multifaceted Crystals
    if (weaponId === 'mirror_shards' || weaponId === 'mirror_shard') {
      const group = new THREE.Group();

      const diamondGeo = new THREE.OctahedronGeometry(radius * 0.9, 0);
      const diamondMat = new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 1.2,
        roughness: 0.1,
        metalness: 0.9
      });
      const diamond = new THREE.Mesh(diamondGeo, diamondMat);
      group.add(diamond);

      return group;
    }

    // 11. NANO SWARM — Tumbling Emerald Nanite Prisms
    if (weaponId === 'nano_swarm' || weaponId === 'nano') {
      const group = new THREE.Group();

      for (let n = 0; n < 3; n++) {
        const nanoGeo = new THREE.TetrahedronGeometry(radius * 0.5, 0);
        const nanoMat = new THREE.MeshBasicMaterial({ color: 0x10b981, blending: THREE.AdditiveBlending });
        const nanoMesh = new THREE.Mesh(nanoGeo, nanoMat);
        const a = (n / 3) * Math.PI * 2;
        nanoMesh.position.set(Math.cos(a) * radius * 0.6, Math.sin(a) * radius * 0.6, 0);
        group.add(nanoMesh);
      }

      return group;
    }

    // 12. SONIC BOOM — Concentric Acoustic Shockwave Rings
    if (weaponId === 'sonic_boom' || weaponId === 'sonic') {
      const group = new THREE.Group();

      for (let r = 1; r <= 3; r++) {
        const ringGeo = new THREE.TorusGeometry(radius * (0.35 * r), 1.8, 6, 24);
        const ringMat = new THREE.MeshBasicMaterial({
          color: 0xffffff,
          transparent: true,
          opacity: 0.85 - r * 0.2,
          blending: THREE.AdditiveBlending
        });
        const ringMesh = new THREE.Mesh(ringGeo, ringMat);
        ringMesh.position.z = -r * 4;
        group.add(ringMesh);
      }

      return group;
    }

    // 13. STARDUST — Falling Incandescent Cosmic Meteors
    if (weaponId === 'stardust') {
      const group = new THREE.Group();

      const starGeo = new THREE.IcosahedronGeometry(radius * 0.8, 0);
      const starMat = new THREE.MeshBasicMaterial({ color: 0xfef08a, blending: THREE.AdditiveBlending });
      const star = new THREE.Mesh(starGeo, starMat);
      group.add(star);

      // Trailing incandescent comet tail
      const tailGeo = new THREE.ConeGeometry(radius * 0.6, radius * 3.0, 8);
      const tailMat = new THREE.MeshBasicMaterial({
        color: 0xf59e0b,
        transparent: true,
        opacity: 0.8,
        blending: THREE.AdditiveBlending
      });
      const tail = new THREE.Mesh(tailGeo, tailMat);
      tail.position.y = radius * 1.5;
      group.add(tail);

      return group;
    }

    // 14. ARC WEAVER — Electric Web Filaments & Zap Orbs
    if (weaponId === 'arc_web') {
      const group = new THREE.Group();
      const length = Math.max(20, radius * 2);
      const segments = 6;
      
      const points: THREE.Vector3[] = [];
      points.push(new THREE.Vector3(0, 0, -length / 2));
      for (let s = 1; s < segments; s++) {
        const t = (s / segments) - 0.5;
        const jx = (Math.random() - 0.5) * 6;
        const jy = (Math.random() - 0.5) * 6;
        points.push(new THREE.Vector3(jx, jy, t * length));
      }
      points.push(new THREE.Vector3(0, 0, length / 2));

      const curve = new THREE.CatmullRomCurve3(points);
      const tubeGeo = new THREE.TubeGeometry(curve, 12, 1.4, 5, false);
      const tubeMat = new THREE.MeshBasicMaterial({
        color: 0x00f0ff,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending
      });
      const tube = new THREE.Mesh(tubeGeo, tubeMat);
      group.add(tube);

      const coreGeo = new THREE.TubeGeometry(curve, 12, 0.6, 5, false);
      const coreMat = new THREE.MeshBasicMaterial({ color: 0xffffff, blending: THREE.AdditiveBlending });
      const core = new THREE.Mesh(coreGeo, coreMat);
      group.add(core);

      // Tesla node spheres at both ends
      const nodeGeo = new THREE.SphereGeometry(2.5, 8, 8);
      const nodeMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8, blending: THREE.AdditiveBlending });
      const n1 = new THREE.Mesh(nodeGeo, nodeMat);
      n1.position.set(0, 0, -length / 2);
      group.add(n1);
      const n2 = new THREE.Mesh(nodeGeo, nodeMat);
      n2.position.set(0, 0, length / 2);
      group.add(n2);

      return group;
    }

    if (weaponId === 'arc_zap' || weaponId === 'arc_weaver') {
      const group = new THREE.Group();

      // Pulsing electric orb
      const orbGeo = new THREE.SphereGeometry(radius * 0.7, 10, 10);
      const orbMat = new THREE.MeshBasicMaterial({
        color: 0x00ffff,
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending
      });
      const orb = new THREE.Mesh(orbGeo, orbMat);
      group.add(orb);

      const coreGeo = new THREE.SphereGeometry(radius * 0.35, 8, 8);
      const coreMat = new THREE.MeshBasicMaterial({ color: 0xffffff, blending: THREE.AdditiveBlending });
      const core = new THREE.Mesh(coreGeo, coreMat);
      group.add(core);

      // Orbiting spark ring
      const ringGeo = new THREE.TorusGeometry(radius * 1.1, 0.8, 6, 16);
      const ringMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8, blending: THREE.AdditiveBlending });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = Math.PI / 3;
      group.add(ring);

      return group;
    }

    // 15. VOID TENDRILS — Segmented Eldritch Void Spires
    if (weaponId === 'void_tendrils' || weaponId === 'tendril') {
      const group = new THREE.Group();

      const spireGeo = new THREE.ConeGeometry(radius * 0.7, radius * 2.5, 6);
      const spireMat = new THREE.MeshStandardMaterial({
        color: 0x4c1d95,
        emissive: 0x7c3aed,
        emissiveIntensity: 0.9,
        metalness: 0.6
      });
      const spire = new THREE.Mesh(spireGeo, spireMat);
      spire.position.y = radius * 1.25;
      group.add(spire);

      return group;
    }

    // DEFAULT: High-Velocity Dual-Sheath Plasma Bolt (Plasma Gun, Neon Shards)
    const group = new THREE.Group();
    
    const boltGeo = new THREE.CylinderGeometry(radius * 0.45, radius * 0.45, radius * 3.6, 8);
    const boltMat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending
    });
    const bolt = new THREE.Mesh(boltGeo, boltMat);
    bolt.rotation.x = Math.PI / 2;
    group.add(bolt);

    const coreGeo = new THREE.CylinderGeometry(radius * 0.22, radius * 0.22, radius * 4.0, 8);
    const coreMat = new THREE.MeshBasicMaterial({ color: 0xffffff, blending: THREE.AdditiveBlending });
    const core = new THREE.Mesh(coreGeo, coreMat);
    core.rotation.x = Math.PI / 2;
    group.add(core);

    return group;
  }

  private updateGems3D(gems: ExperienceGem[], deltaTime: number) {
    const activeGemIds = new Set<string>();
    const now = Date.now();

    for (const gem of gems) {
      activeGemIds.add(gem.id);
      let mesh = this.gemMeshes.get(gem.id);

      if (!mesh) {
        let mat = this.gemMaterialCache.get(gem.color);
        if (!mat) {
          const gemCol = parseHexColor(gem.color, 0x00ffcc);
          mat = new THREE.MeshStandardMaterial({
            color: gemCol,
            emissive: gemCol,
            emissiveIntensity: 1.0,
            metalness: 0.2,
            roughness: 0.1
          });
          this.gemMaterialCache.set(gem.color, mat);
        }
        mesh = new THREE.Mesh(this.gemGeometry, mat);
        this.scene.add(mesh);
        this.gemMeshes.set(gem.id, mesh);
      }

      const floatY = 8 + Math.sin(now * 0.006 + gem.position.x) * 3;
      mesh.position.set(gem.position.x, floatY, gem.position.y);
      mesh.rotation.y += deltaTime * 0.003;
      mesh.rotation.x += deltaTime * 0.002;
    }

    for (const [id, mesh] of this.gemMeshes.entries()) {
      if (!activeGemIds.has(id)) {
        this.scene.remove(mesh);
        this.gemMeshes.delete(id);
      }
    }
  }

  private updateItems3D(items: WorldItem[], deltaTime: number) {
    const activeItemIds = new Set<string>();
    const now = Date.now();

    for (const item of items) {
      activeItemIds.add(item.id);
      let mesh = this.itemMeshes.get(item.id);

      if (!mesh) {
        const itemCol = parseHexColor(item.color, 0xffd700);
        const geo = new THREE.CylinderGeometry(10, 10, 4, 16);
        const mat = new THREE.MeshStandardMaterial({
          color: itemCol,
          emissive: itemCol,
          emissiveIntensity: 1.0,
          metalness: 0.9,
          roughness: 0.2
        });
        mesh = new THREE.Mesh(geo, mat);
        this.scene.add(mesh);
        this.itemMeshes.set(item.id, mesh);
      }

      const floatY = 12 + Math.sin(now * 0.005 + item.position.x) * 4;
      mesh.position.set(item.position.x, floatY, item.position.y);
      mesh.rotation.y += deltaTime * 0.004;
      mesh.rotation.z = Math.PI / 6;
    }

    for (const [id, mesh] of this.itemMeshes.entries()) {
      if (!activeItemIds.has(id)) {
        this.scene.remove(mesh);
        this.itemMeshes.delete(id);
      }
    }
  }

  private updateTreasures3D(treasures: Treasure[], deltaTime: number) {
    const activeTreasureIds = new Set<string>();
    const now = Date.now();

    for (const treasure of treasures) {
      activeTreasureIds.add(treasure.id);
      let group = this.treasureMeshes.get(treasure.id);

      if (!group) {
        group = new THREE.Group();
        const trCol = parseHexColor(treasure.color, 0xffd700);
        // Chest box
        const chestGeo = new THREE.BoxGeometry(28, 20, 20);
        const chestMat = new THREE.MeshStandardMaterial({
          color: 0x1a2638,
          emissive: trCol,
          emissiveIntensity: 0.8,
          metalness: 0.8
        });
        const chestMesh = new THREE.Mesh(chestGeo, chestMat);
        group.add(chestMesh);

        // Vertical Light Beacon shooting to sky
        const beaconGeo = new THREE.CylinderGeometry(4, 4, 800, 12);
        const beaconMat = new THREE.MeshBasicMaterial({
          color: trCol,
          transparent: true,
          opacity: 0.5
        });
        const beaconMesh = new THREE.Mesh(beaconGeo, beaconMat);
        beaconMesh.position.y = 400;
        group.add(beaconMesh);

        this.scene.add(group);
        this.treasureMeshes.set(treasure.id, group);
      }

      group.position.set(treasure.position.x, 10, treasure.position.y);
      group.rotation.y = Math.sin(now * 0.002) * 0.3;
    }

    for (const [id, group] of this.treasureMeshes.entries()) {
      if (!activeTreasureIds.has(id)) {
        this.scene.remove(group);
        this.treasureMeshes.delete(id);
      }
    }
  }

  private updatePortal3D(portals: { position: { x: number; y: number }; radius: number; active: boolean }[], activeIndex: number, deltaTime: number) {
    if (portals.length === 0 || activeIndex < 0) {
      if (this.portalMesh) {
        this.scene.remove(this.portalMesh);
        this.portalMesh = null;
      }
      return;
    }

    const portal = portals[activeIndex];
    if (!this.portalMesh) {
      this.portalMesh = new THREE.Group();

      // Vortex Ring
      const torusGeo = new THREE.TorusGeometry(portal.radius || 40, 6, 16, 32);
      const torusMat = new THREE.MeshBasicMaterial({ color: 0x00ffcc, wireframe: true });
      const torus = new THREE.Mesh(torusGeo, torusMat);
      torus.rotation.x = Math.PI / 2;
      this.portalMesh.add(torus);

      // Energy Pillar
      const beamGeo = new THREE.CylinderGeometry(portal.radius * 0.7, portal.radius * 0.7, 1000, 16);
      const beamMat = new THREE.MeshBasicMaterial({
        color: 0x00ffcc,
        transparent: true,
        opacity: 0.35
      });
      const beam = new THREE.Mesh(beamGeo, beamMat);
      beam.position.y = 500;
      this.portalMesh.add(beam);

      this.scene.add(this.portalMesh);
    }

    this.portalMesh.position.set(portal.position.x, 5, portal.position.y);
    this.portalMesh.rotation.y += deltaTime * 0.003;
  }

  private updateParticles3D(particles: any[]) {
    let count = Math.min(particles.length, this.MAX_3D_PARTICLES);

    for (let i = 0; i < count; i++) {
      const p = particles[i];
      const idx = i * 3;
      this.particlePositions[idx] = p.x;
      this.particlePositions[idx + 1] = p.z || 12;
      this.particlePositions[idx + 2] = p.y;

      const c = parseHexColor(p.color, 0x00f0ff);
      this.particleColors[idx] = c.r;
      this.particleColors[idx + 1] = c.g;
      this.particleColors[idx + 2] = c.b;
    }

    // Zero out unused slots
    for (let i = count; i < this.MAX_3D_PARTICLES; i++) {
      const idx = i * 3;
      this.particlePositions[idx + 1] = -9999;
    }

    this.particleGeo.attributes.position.needsUpdate = true;
    this.particleGeo.attributes.color.needsUpdate = true;
  }

  destroy() {
    window.removeEventListener('resize', this.handleResize);
    window.removeEventListener('mousemove', this.onMouseMove);
    window.removeEventListener('mousedown', this.onMouseDown);
    window.removeEventListener('mouseup', this.onMouseUp);
    window.removeEventListener('contextmenu', this.onContextMenu);
    window.removeEventListener('keydown', this.onDebugKeyDown);
    document.removeEventListener('pointerlockchange', this.onPointerLockChange);
    this.exitPointerLock();
    this.unmount();
    this.renderer.dispose();
  }
}
