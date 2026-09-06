import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { GameEngine } from './Engine';
import { Enemy, Projectile, ExperienceGem, WorldItem, Treasure, OperatorDefinition, Weapon, Shop } from '../types';
import { OPERATOR_DEFINITIONS } from '../constants';
import { FireSolution, solveMuzzleConvergence } from './aiming';
import { compressVisualRadius, getProjectileVisualId } from './projectilePresentation';
import { EvolutionProfile, getEvolutionProfile } from './evolutions';
import { getWorldDistrictAt, getWorldObstacles, WORLD_DISTRICTS, WORLD_SKYBRIDGE_ELEVATION, WORLD_TRANSIT_LINES } from './world/WorldLayout';
import { GAME_HEIGHT, GAME_WIDTH } from '../constants';
import { animateCoopEnemyRig, CoopEnemyBatchRenderer, createCoopEnemyRig, disposeCoopEnemyRig } from './rendering/coopEnemyVisuals';
import { ENEMY_ATTACK_PROFILES } from './combat/enemyDomain';
import { COOP_FIRST_PERSON_EYE_HEIGHT } from './multiplayer/playerMovement';
import { createFloatingPlatformShell } from './rendering/floatingPlatformShell';

export interface Renderer3DOptions {
  /** Co-op takes place on a finite floating megastructure. Its edge is open
   * space and must never be disguised by floor or skyline geometry. */
  floatingPlatform?: boolean;
  /** Development A/B escape hatch; production co-op leaves this enabled. */
  coopEnemyBatching?: boolean;
}

export interface RendererSuitPalette {
  primary: string;
  secondary: string;
  dark: string;
  glow: string;
  visor: string;
  metalness?: number;
  roughness?: number;
  emissiveIntensity?: number;
  premium?: boolean;
  signature?: 'black_ice' | 'royal_inferno';
}

const COLOR_CACHE = new Map<string, THREE.Color>();

interface EnemyDamageNumberVisual {
  enemyId: string;
  bornAt: number;
  sprite: THREE.Sprite;
  textureKey: string;
}

interface EnemyDamageNumberTexture {
  texture: THREE.CanvasTexture;
  references: number;
  lastUsed: number;
}

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
  private speedLineScene!: THREE.Scene;
  private speedLineCamera!: THREE.OrthographicCamera;
  private speedLineMaterial!: THREE.ShaderMaterial;
  private speedLineMesh!: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private speedLineIntensity = 0;

  private readonly WORLD_FOV = 108;
  private readonly WORLD_DASH_FOV = 118;
  private readonly ADS_FOV = 68;
  private readonly VIEWMODEL_FOV = 98;
  private readonly VIEWMODEL_ADS_FOV = 68;
  
  // Camera & View State (High FOV + ADS)
  yaw: number = 0;
  pitch: number = 0;
  targetYaw: number = 0;
  targetPitch: number = 0;
  isPointerLocked: boolean = false;
  sensitivity: number = 0.0022;
  private activeViewMode: 'TOPDOWN_2D' | 'FIRST_PERSON' | 'THIRD_PERSON' = 'TOPDOWN_2D';

  // Manual Shooting & ADS States
  isShooting: boolean = false;
  isAimingDownSights: boolean = false;
  adsProgress: number = 0;
  /** Optional external presentation offset used by the network snapshot bridge. */
  presentationVerticalOffset: number = 0;
  presentationSprinting: boolean = false;
  presentationSliding: boolean = false;
  /** Short-lived first-person body lean supplied by wall-jump presentation. */
  presentationCameraRoll: number = 0;
  presentationCameraPitchOffset: number = 0;
  /** Co-op sniper scope. World FOV and look speed remain purely presentation. */
  presentationScoped: boolean = false;
  /** 0–1 host-derived reload progress for the visible legacy plasma handgun. */
  presentationHandgunReloadProgress: number = 0;
  /**
   * When true (dead-player spectating), the THIRD_PERSON chase camera runs
   * but thirdPersonPlayerGroup is hidden — the spectated player's CoopOperatorRig
   * is already in the scene and serves as the visible avatar instead.
   */
  presentationSpectating: boolean = false;

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
  private camKeyTarget!: THREE.Object3D;
  vmFillLight!: THREE.PointLight;
  vmGlowLight!: THREE.PointLight;
  
  // Environment
  gridHelper!: THREE.GridHelper;
  floorMesh!: THREE.Mesh;
  boundaryPillars: THREE.Mesh[] = [];
  private readonly floatingPlatform: boolean;
  private coopSuitPalette?: RendererSuitPalette;
  gasZoneGroup!: THREE.Group;
  gasWallMesh!: THREE.Mesh;
  gasWallMaterial!: THREE.ShaderMaterial;
  gasPerimeterRing!: THREE.Mesh;
  
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
  coopPremiumViewmodelEffect!: THREE.Group;
  coopPremiumViewmodelRing!: THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial>;
  coopPremiumViewmodelParticles!: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>;

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
  tpMuzzlePoint!: THREE.Object3D;
  tpMuzzleFlash!: THREE.Mesh;
  tpMuzzleLight!: THREE.PointLight;
  
  // Object pools & 3D caches
  private enemyMeshes = new Map<string, THREE.Object3D>();
  private coopEnemyBatchRenderer?: CoopEnemyBatchRenderer;
  private readonly activeEnemyIds = new Set<string>();
  private readonly activeEnemyAttackIds = new Set<string>();
  private enemyDamageNumbers: EnemyDamageNumberVisual[] = [];
  private enemyDamageNumberPool: THREE.Sprite[] = [];
  private enemyDamageNumberTextures = new Map<string, EnemyDamageNumberTexture>();
  private enemyAttackTelegraphs = new Map<string, THREE.Mesh>();
  private telegraphSharedGeometry = (() => { const g = new THREE.RingGeometry(0.82, 1, 32); g.userData.rendererEnemyShared = true; return g; })();
  private telegraphPool: THREE.Mesh[] = [];
  private sharedEnemyEyeMaterial = (() => { const m = new THREE.MeshBasicMaterial({ color: 0xff0033 }); m.userData.rendererMaterialShared = true; return m; })();
  private sharedHealthBgMaterial = (() => { const m = new THREE.MeshBasicMaterial({ color: 0x13040a, transparent: true, opacity: 0.9, depthWrite: false }); m.userData.rendererMaterialShared = true; return m; })();
  private sharedHealthFillMaterial = (() => { const m = new THREE.MeshBasicMaterial({ color: 0x7df9ff, transparent: true, opacity: 0.95, depthWrite: false }); m.userData.rendererMaterialShared = true; return m; })();
  private enemyGeometryCache = new Map<string, THREE.BufferGeometry>();
  private gemMeshes = new Map<string, THREE.Mesh>();
  private itemMeshes = new Map<string, THREE.Object3D>();
  private itemTemplates = new Map<WorldItem['type'], THREE.Object3D>();
  private treasureMeshes = new Map<string, THREE.Group>();
  private shopMeshes = new Map<string, THREE.Group>();
  private exfillPortalMesh: THREE.Group | null = null;
  private projectileMeshes = new Map<string, THREE.Object3D>();
  private projectileVisualCounts = new Map<string, number>();
  private persistentAuraMeshes = new Map<'void_aura' | 'frost_aura', THREE.Group>();
  private persistentOrbitMeshes = new Map<'orbit_drones' | 'data_scythe', THREE.Group>();
  private tendrilStrikeMeshes = new Map<string, THREE.Group>();
  private helixStrikeMeshes = new Map<string, THREE.Group>();
  private solarStrikeMeshes = new Map<string, THREE.Group>();
  private nanoSwarmMeshes = new Map<string, THREE.Group>();
  /** Base weapon id -> final-form profile, refreshed from live weapon state. */
  private activeEvolutionProfiles = new Map<string, EvolutionProfile>();
  private evolutionCrestCounts = new Map<string, number>();
  private portalMesh: THREE.Group | null = null;
  
  // Particles
  private particleSystem!: THREE.Points;
  private particleGeo!: THREE.BufferGeometry;
  private particlePositions!: Float32Array;
  private particleColors!: Float32Array;
  private particleSizes!: Float32Array;
  private particleAlphas!: Float32Array;
  // A dense end-game combat field needs room for enemies. Recent impact
  // particles are favoured below, so a smaller hard cap reads better than a
  // wall of 1,200 additive sprites.
  private readonly MAX_3D_PARTICLES = 720;

  // Shared reusable geometries and materials for maximum performance
  private gemGeometry = new THREE.OctahedronGeometry(6, 0);
  private gemMaterialCache = new Map<string, THREE.MeshStandardMaterial>();

  // Cached vector math objects for zero per-frame garbage collection
  private tempMuzzlePos = new THREE.Vector3();
  private tempInstanceObject = new THREE.Object3D();
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

  getPerformanceStats() {
    const info = this.renderer.info;
    return {
      drawCalls: info.render.calls,
      triangles: info.render.triangles,
      geometries: info.memory.geometries,
      textures: info.memory.textures,
      batchedEnemies: this.coopEnemyBatchRenderer?.activeEnemyCount || 0,
      enemyBatches: this.coopEnemyBatchRenderer?.activeDrawBatchCount || 0,
      enemyCount: this.enemyMeshes.size,
    };
  }

  /**
   * Adds a true world-space damage label to an enemy rig. Because the sprite is
   * parented to the rig, enemy motion and camera motion are resolved by Three.js
   * in the same frame instead of being approximated by a DOM overlay.
   */
  showEnemyDamageNumber(enemyId: string, amount: number, color: string = '#ffffff') {
    const roundedAmount = Math.max(1, Math.round(amount));
    const textureKey = `${roundedAmount}:${color}`;
    const texture = this.acquireEnemyDamageNumberTexture(textureKey, roundedAmount, color);
    if (!texture) return;
    const sprite = this.enemyDamageNumberPool.pop() || new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false, depthTest: true, toneMapped: false }));
    const material = sprite.material as THREE.SpriteMaterial;
    material.map = texture;
    material.opacity = .9;
    material.needsUpdate = true;
    sprite.renderOrder = 40;
    sprite.scale.set(50, 14.6, 1);
    this.enemyDamageNumbers.push({ enemyId, bornAt: Date.now(), sprite, textureKey });
    while (this.enemyDamageNumbers.length > 3) this.disposeEnemyDamageNumber(this.enemyDamageNumbers.shift()!);
  }

  private acquireEnemyDamageNumberTexture(key: string, amount: number, color: string) {
    const now = Date.now();
    const cached = this.enemyDamageNumberTextures.get(key);
    if (cached) {
      cached.references++;
      cached.lastUsed = now;
      return cached.texture;
    }
    const canvas = document.createElement('canvas');
    canvas.width = 192;
    canvas.height = 56;
    const context = canvas.getContext('2d');
    if (!context) return null;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.font = 'italic 850 29px Inter, Arial, sans-serif';
    context.lineJoin = 'round';
    context.lineWidth = 6;
    context.strokeStyle = 'rgba(1, 4, 8, .88)';
    context.strokeText(`−${amount} HP`, canvas.width / 2, canvas.height / 2);
    context.shadowColor = color;
    context.shadowBlur = 3;
    context.fillStyle = 'rgba(255, 255, 255, .94)';
    context.fillText(`−${amount} HP`, canvas.width / 2, canvas.height / 2);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    this.enemyDamageNumberTextures.set(key, { texture, references: 1, lastUsed: now });
    this.trimEnemyDamageNumberTextureCache();
    return texture;
  }

  private trimEnemyDamageNumberTextureCache() {
    if (this.enemyDamageNumberTextures.size <= 24) return;
    const disposable = [...this.enemyDamageNumberTextures.entries()]
      .filter(([, entry]) => entry.references === 0)
      .sort((left, right) => left[1].lastUsed - right[1].lastUsed);
    while (this.enemyDamageNumberTextures.size > 24 && disposable.length) {
      const [key, entry] = disposable.shift()!;
      entry.texture.dispose();
      this.enemyDamageNumberTextures.delete(key);
    }
  }

  constructor(options: Renderer3DOptions = {}) {
    this.floatingPlatform = options.floatingPlatform ?? false;
    // 1. Initialize Three.js Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0b1830);
    // Keep a sense of scale instead of fogging the new long-distance city into
    // a solid wall only a few blocks from the player.
    this.scene.fog = new THREE.FogExp2(0x0b1830, 0.00018);

    // 2. World camera stays deliberately extreme; the viewmodel gets its own
    // projection so it remains readable at a 130° world FOV.
    this.camera = new THREE.PerspectiveCamera(this.WORLD_FOV, window.innerWidth / window.innerHeight, 0.05, 32000);
    this.scene.add(this.camera);
    if (this.floatingPlatform && options.coopEnemyBatching !== false) this.coopEnemyBatchRenderer = new CoopEnemyBatchRenderer(this.scene);
    this.viewmodelScene = new THREE.Scene();
    this.viewmodelCamera = new THREE.PerspectiveCamera(this.VIEWMODEL_FOV, window.innerWidth / window.innerHeight, 0.025, 1000);
    this.viewmodelScene.add(this.viewmodelCamera);

    // 3. Initialize WebGL Renderer
    this.renderer = new THREE.WebGLRenderer({
      powerPreference: 'high-performance',
      antialias: true,
      alpha: false
    });
    // A frame may contain world, viewmodel, and speed-line passes. Accumulate
    // renderer statistics across all of them and reset exactly once below.
    this.renderer.info.autoReset = false;
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.4;

    // Screen-space sprint feedback is rendered in a final transparent pass so
    // the streaks remain in the player's FOV instead of existing in the world.
    this.setupSpeedLines();

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

  setCoopSuitPalette(palette?: RendererSuitPalette) {
    this.coopSuitPalette = palette;
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
    this.speedLineMaterial.uniforms.aspect.value = width / Math.max(1, height);
    this.renderer.setSize(width, height);
  };

  private setupSpeedLines() {
    this.speedLineScene = new THREE.Scene();
    this.speedLineCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.speedLineMaterial = new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0 },
        intensity: { value: 0 },
        aspect: { value: window.innerWidth / Math.max(1, window.innerHeight) },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }
      `,
      fragmentShader: `
        uniform float time;
        uniform float intensity;
        uniform float aspect;
        varying vec2 vUv;

        float hash(float value) {
          return fract(sin(value * 127.1) * 43758.5453);
        }

        void main() {
          vec2 point = vUv - 0.5;
          point.x *= aspect;
          float radius = length(point);
          float angle = atan(point.y, point.x);
          float lane = (angle + 3.14159265) / 6.2831853 * 96.0;
          float laneId = floor(lane);
          float seed = hash(laneId);

          // Each angular lane owns one outward-moving streak. Random gaps and
          // varied speed keep the result energetic without forming a sunburst.
          float phase = fract(time * mix(0.72, 1.35, seed) + hash(laneId + 19.7));
          float head = mix(0.42, 1.18, phase);
          float streakLength = mix(0.08, 0.22, hash(laneId + 41.3));
          float segment = smoothstep(head - streakLength, head - streakLength + 0.025, radius)
            * (1.0 - smoothstep(head - 0.025, head, radius));
          float laneDistance = abs(fract(lane) - 0.5);
          float line = 1.0 - smoothstep(0.015, mix(0.045, 0.085, seed), laneDistance);
          float sparse = step(0.30, hash(laneId + 73.9));
          // Keep the center and mid-FOV calm; the cue should live at the far
          // edge of vision and never compete with targets or the reticle.
          float peripheral = smoothstep(0.40, 0.64, radius);
          float edgeFade = 1.0 - smoothstep(0.98, 1.22, radius);
          float alpha = segment * line * sparse * peripheral * edgeFade * intensity;

          vec3 color = mix(vec3(0.38, 0.88, 1.0), vec3(1.0), seed * 0.7);
          gl_FragColor = vec4(color, alpha);
        }
      `,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    this.speedLineMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.speedLineMaterial);
    this.speedLineMesh.frustumCulled = false;
    this.speedLineScene.add(this.speedLineMesh);
  }

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

    // Player-following fill. Its vertical position is updated with the
    // presented jump height so airborne lighting does not detach from the rig.
    this.playerPointLight = new THREE.PointLight(0x00f0ff, 5.0, 500, 1.0);
    this.scene.add(this.playerPointLight);

    // Camera-forward key. A DirectionalLight target is world-space unless it
    // shares the camera transform; leaving the default target at world origin
    // made metallic highlights rotate as the player moved through the arena.
    this.camKeyLight = new THREE.DirectionalLight(0xffffff, 1.8);
    this.camKeyLight.position.set(0, 1.5, 2.5);
    this.camKeyTarget = new THREE.Object3D();
    this.camKeyTarget.position.set(0, 0, -8);
    this.camKeyLight.target = this.camKeyTarget;
    this.camera.add(this.camKeyLight, this.camKeyTarget);
  }

  private setupEnvironment() {
    this.setupSkyDome();
    // Cyber Neon Floor Grid
    const floorWidth = this.floatingPlatform ? GAME_WIDTH : Math.max(GAME_WIDTH, GAME_HEIGHT) * 2.5;
    const floorHeight = this.floatingPlatform ? GAME_HEIGHT : floorWidth;
    const floorGeo = new THREE.PlaneGeometry(floorWidth, floorHeight, 1, 1);
    // The grid is rendered inside the floor shader rather than as a separate
    // helper mesh. That removes the final depth-buffer competition completely;
    // fwidth keeps the lines anti-aliased while the player moves.
    const floorMat = new THREE.ShaderMaterial({
      uniforms: {
        baseColor: { value: new THREE.Color(0x09182c) },
        plazaGlowColor: { value: new THREE.Color(0x0d4260) },
        fineGridColor: { value: new THREE.Color(0x1b5f80) },
        majorGridColor: { value: new THREE.Color(0x46d8ff) },
        worldCenter: { value: new THREE.Vector2(GAME_WIDTH / 2, GAME_HEIGHT / 2) },
      },
      vertexShader: `
        varying vec2 vWorldGrid;
        void main() {
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldGrid = worldPosition.xz;
          gl_Position = projectionMatrix * viewMatrix * worldPosition;
        }
      `,
      fragmentShader: `
        uniform vec3 baseColor;
        uniform vec3 plazaGlowColor;
        uniform vec3 fineGridColor;
        uniform vec3 majorGridColor;
        uniform vec2 worldCenter;
        varying vec2 vWorldGrid;

        float gridLine(vec2 coordinate, float spacing) {
          vec2 cell = coordinate / spacing;
          vec2 distanceToLine = abs(fract(cell - 0.5) - 0.5) / fwidth(cell);
          return 1.0 - min(min(distanceToLine.x, distanceToLine.y), 1.0);
        }

        void main() {
          float fine = gridLine(vWorldGrid, 125.0);
          float major = gridLine(vWorldGrid, 500.0);
          // A stable city-power glow gives the floor readable light without
          // sampling any dynamic point lights or reflective screen effects.
          float plazaGlow = 1.0 - smoothstep(900.0, 7600.0, length(vWorldGrid - worldCenter));
          vec3 color = mix(baseColor, plazaGlowColor, plazaGlow * 0.62);
          color = mix(color, fineGridColor, fine * 0.82);
          color = mix(color, majorGridColor, major * 0.94);
          gl_FragColor = vec4(color, 1.0);
        }
      `,
    });
    this.floorMesh = new THREE.Mesh(floorGeo, floorMat);
    this.floorMesh.rotation.x = -Math.PI / 2;
    this.floorMesh.position.set(this.floatingPlatform ? GAME_WIDTH / 2 : 0, 0, this.floatingPlatform ? GAME_HEIGHT / 2 : 0);
    this.scene.add(this.floorMesh);

    if (this.floatingPlatform) this.setupFloatingPlatform();

    // Retained only for lifecycle compatibility; the stable grid lives in the
    // floor shader above and no second grid object enters the scene.
    this.gridHelper = new THREE.GridHelper(Math.max(floorWidth, floorHeight), 240, 0x256a82, 0x13243a);
    this.gridHelper.visible = false;

    // Collidable architecture comes from the same deterministic layout used by
    // Engine movement. These are real city blocks, not decorative ghosts.
    this.setupDistrictCity();
    if (!this.floatingPlatform) this.setupDistantSkyline();

    // Distant Cyber Pillars / Horizon Monoliths
    const pillarGeo = new THREE.BoxGeometry(40, 750, 40);
    const pillarColors = [0x00f0ff, 0xff0077, 0x7928ca, 0x00ffcc];
    
    for (let i = 0; i < (this.floatingPlatform ? 0 : 18); i++) {
      const angle = (i / 18) * Math.PI * 2;
      const dist = Math.max(GAME_WIDTH, GAME_HEIGHT) * 0.67 + Math.sin(i * 3) * 400;
      const color = pillarColors[i % pillarColors.length];
      const mat = new THREE.MeshBasicMaterial({
        color,
        wireframe: true,
        transparent: true,
        opacity: 0.24,
        depthWrite: false,
      });
      const pillar = new THREE.Mesh(pillarGeo, mat);
      pillar.position.set(GAME_WIDTH / 2 + Math.cos(angle) * dist, 320, GAME_HEIGHT / 2 + Math.sin(angle) * dist);
      this.scene.add(pillar);
      this.boundaryPillars.push(pillar);
    }

    this.setupGasZoneVisuals();
  }

  /** Gives co-op's finite play space an honest physical silhouette. The top
   * surface ends at the authoritative footprint; the slab and warning bands
   * make that edge readable without adding collision rails or invisible walls. */
  private setupFloatingPlatform() {
    const slabDepth = 150;
    // Do not place another arena-sized horizontal face directly beneath the
    // shader floor. At grazing angles the huge world-camera depth range can
    // quantize nearby surfaces to the same value, briefly revealing the sky's
    // magenta underglow through the deck as the camera rises during a jump.
    // Four walls plus a deeply separated underside preserve the silhouette
    // without any competing top layer.
    const slab = createFloatingPlatformShell(GAME_WIDTH, GAME_HEIGHT, slabDepth);
    this.scene.add(slab);

    const warningMaterial = new THREE.MeshBasicMaterial({ color: 0xffb020, toneMapped: false });
    const edgeMaterial = new THREE.MeshBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: 0.72, toneMapped: false });
    const edgeInset = 14;
    const warningWidth = 7;
    const sideHeight = 4;
    const addBand = (width: number, depth: number, x: number, z: number, material: THREE.Material, y: number) => {
      const band = new THREE.Mesh(new THREE.BoxGeometry(width, sideHeight, depth), material);
      band.position.set(x, y, z);
      band.name = 'coop-platform-edge-band';
      this.scene.add(band);
    };

    // Amber strips sit on the deck just inside the drop; cyan strips outline
    // the vertical lip from below and at oblique viewing angles.
    addBand(GAME_WIDTH - edgeInset * 2, warningWidth, GAME_WIDTH / 2, edgeInset, warningMaterial, 1.1);
    addBand(GAME_WIDTH - edgeInset * 2, warningWidth, GAME_WIDTH / 2, GAME_HEIGHT - edgeInset, warningMaterial, 1.1);
    addBand(warningWidth, GAME_HEIGHT - edgeInset * 2, edgeInset, GAME_HEIGHT / 2, warningMaterial, 1.1);
    addBand(warningWidth, GAME_HEIGHT - edgeInset * 2, GAME_WIDTH - edgeInset, GAME_HEIGHT / 2, warningMaterial, 1.1);
    addBand(GAME_WIDTH, 5, GAME_WIDTH / 2, 0, edgeMaterial, -12);
    addBand(GAME_WIDTH, 5, GAME_WIDTH / 2, GAME_HEIGHT, edgeMaterial, -12);
    addBand(5, GAME_HEIGHT, 0, GAME_HEIGHT / 2, edgeMaterial, -12);
    addBand(5, GAME_HEIGHT, GAME_WIDTH, GAME_HEIGHT / 2, edgeMaterial, -12);
  }

  private setupSkyDome() {
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(24000, 40, 24),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: {
          zenith: { value: new THREE.Color(0x0b1640) },
          horizon: { value: new THREE.Color(0x2a6b99) },
          underglow: { value: new THREE.Color(0x6b2458) },
        },
        vertexShader: `varying vec3 vPosition; void main() { vPosition = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: `
          uniform vec3 zenith; uniform vec3 horizon; uniform vec3 underglow; varying vec3 vPosition;
          void main() {
            float h = normalize(vPosition).y * 0.5 + 0.5;
            vec3 color = mix(underglow, horizon, smoothstep(0.12, 0.5, h));
            color = mix(color, zenith, smoothstep(0.48, 1.0, h));
            gl_FragColor = vec4(color, 1.0);
          }
        `,
      })
    );
    this.scene.add(sky);

    const moon = new THREE.Mesh(
      new THREE.CircleGeometry(410, 40),
      new THREE.MeshBasicMaterial({ color: 0x9ae8ff, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
    );
    moon.position.set(GAME_WIDTH / 2 - 7200, 3200, GAME_HEIGHT / 2 - 9800);
    moon.lookAt(GAME_WIDTH / 2, 600, GAME_HEIGHT / 2);
    this.scene.add(moon);

    const stormRing = new THREE.Group();
    for (let i = 0; i < 18; i++) {
      const angle = i / 18 * Math.PI * 2;
      const cloud = new THREE.Mesh(
        new THREE.SphereGeometry(130 + (i % 3) * 50, 10, 6),
        new THREE.MeshBasicMaterial({ color: i % 2 ? 0x1b1d4a : 0x1e3550, transparent: true, opacity: 0.11, depthWrite: false })
      );
      cloud.position.set(GAME_WIDTH / 2 + Math.cos(angle) * 8400, 720 + (i % 4) * 80, GAME_HEIGHT / 2 + Math.sin(angle) * 8400);
      cloud.scale.set(2.8, 0.42, 1.2);
      stormRing.add(cloud);
    }
    stormRing.name = 'storm-cloud-ring';
    this.scene.add(stormRing);
  }

  private setupDistrictCity() {
    const obstacles = getWorldObstacles();
    const buildingObstacles = obstacles.filter((obstacle) =>
      obstacle.kind === 'tower' || obstacle.kind === 'arcade' || obstacle.kind === 'service_block'
    );
    const transitPylons = obstacles.filter((obstacle) => obstacle.kind === 'transit_pylon');
    const bridgePylons = obstacles.filter((obstacle) => obstacle.kind === 'bridge_pylon');
    const boxGeo = new THREE.BoxGeometry(1, 1, 1);
    const roofGeo = new THREE.BoxGeometry(1, 1, 1);
    const facadeGeo = new THREE.BoxGeometry(1, 1, 1);
    const temp = new THREE.Object3D();

    for (const district of Object.values(WORLD_DISTRICTS)) {
      const districtObstacles = buildingObstacles.filter((obstacle) => obstacle.district === district.id);
      if (districtObstacles.length) {
        const buildingMat = new THREE.MeshStandardMaterial({ color: district.buildingColor, emissive: district.floorColor, emissiveIntensity: 0.18, metalness: 0.78, roughness: 0.38 });
        const roofMat = new THREE.MeshBasicMaterial({ color: district.emissiveColor, depthWrite: true });
        const facadeMat = new THREE.MeshBasicMaterial({ color: district.emissiveColor, depthWrite: true });
        const buildings = new THREE.InstancedMesh(boxGeo, buildingMat, districtObstacles.length);
        const roofLines = new THREE.InstancedMesh(roofGeo, roofMat, districtObstacles.length);
        const facadeBands = new THREE.InstancedMesh(facadeGeo, facadeMat, districtObstacles.length * 2);
        let facadeIndex = 0;
        districtObstacles.forEach((obstacle, index) => {
          temp.rotation.set(0, 0, 0);
          temp.position.set(obstacle.x + obstacle.width / 2, obstacle.elevation / 2, obstacle.y + obstacle.height / 2);
          temp.scale.set(obstacle.width, obstacle.elevation, obstacle.height);
          temp.updateMatrix();
          buildings.setMatrixAt(index, temp.matrix);
          temp.position.set(obstacle.x + obstacle.width / 2, obstacle.elevation + 2.5, obstacle.y + obstacle.height / 2);
          temp.scale.set(Math.max(16, obstacle.width * 0.78), 3.5, Math.max(16, obstacle.height * 0.78));
          temp.updateMatrix();
          roofLines.setMatrixAt(index, temp.matrix);
          // Two narrow vertical light mullions read as deliberate façade design
          // instead of the old noisy, screen-filling horizontal light bands.
          for (const fraction of [0.2, 0.8]) {
            temp.position.set(obstacle.x + obstacle.width * fraction, obstacle.elevation * 0.48, obstacle.y + obstacle.height + 0.8);
            temp.scale.set(2.1, Math.max(18, obstacle.elevation * 0.42), 1.4);
            temp.updateMatrix();
            facadeBands.setMatrixAt(facadeIndex++, temp.matrix);
          }
        });
        buildings.instanceMatrix.needsUpdate = true;
        roofLines.instanceMatrix.needsUpdate = true;
        facadeBands.instanceMatrix.needsUpdate = true;
        this.scene.add(buildings, roofLines, facadeBands);
      }

    }

    this.setupTransitInfrastructure(transitPylons, bridgePylons);
  }

  /** Elevated landmarks give the arena a long-distance silhouette. Their only
   * ground-level geometry is built from the shared pylon obstacles, so both
   * enemies and the player collide with exactly what they see. */
  private setupTransitInfrastructure(
    transitPylons: ReturnType<typeof getWorldObstacles>,
    bridgePylons: ReturnType<typeof getWorldObstacles>,
  ) {
    const steelMat = new THREE.MeshStandardMaterial({ color: 0x111d2d, emissive: 0x08111d, emissiveIntensity: 0.45, metalness: 0.92, roughness: 0.25 });
    const concreteMat = new THREE.MeshStandardMaterial({ color: 0x26364a, metalness: 0.68, roughness: 0.42 });
    const pylonGeo = new THREE.CylinderGeometry(12, 20, 1, 10);
    const capGeo = new THREE.CylinderGeometry(24, 16, 8, 10);

    for (const line of WORLD_TRANSIT_LINES) {
      const span = line.end - line.start;
      const alongX = line.axis === 'x';
      const railGroup = new THREE.Group();
      const railGeo = new THREE.BoxGeometry(alongX ? span : 13, 9, alongX ? 13 : span);
      const guideGeo = new THREE.BoxGeometry(alongX ? span : 3, 3, alongX ? 3 : span);
      const glowMat = new THREE.MeshStandardMaterial({ color: line.color, emissive: line.color, emissiveIntensity: 1.35, metalness: 0.35, roughness: 0.28 });
      const center = (line.start + line.end) / 2;

      for (const offset of [-17, 17]) {
        const rail = new THREE.Mesh(railGeo, steelMat);
        rail.position.set(alongX ? center : line.coordinate + offset, line.elevation, alongX ? line.coordinate + offset : center);
        railGroup.add(rail);
      }
      const guide = new THREE.Mesh(guideGeo, glowMat);
      guide.position.set(alongX ? center : line.coordinate, line.elevation + 7, alongX ? line.coordinate : center);
      railGroup.add(guide);

      for (const pylon of transitPylons.filter((candidate) => candidate.id.startsWith(line.id))) {
        const support = new THREE.Mesh(pylonGeo, concreteMat);
        support.scale.y = pylon.elevation;
        support.position.set(pylon.x + pylon.width / 2, pylon.elevation / 2, pylon.y + pylon.height / 2);
        railGroup.add(support);
        const cap = new THREE.Mesh(capGeo, glowMat);
        cap.position.set(pylon.x + pylon.width / 2, pylon.elevation - 4, pylon.y + pylon.height / 2);
        railGroup.add(cap);
      }

      // A stationary service carriage makes the route instantly legible in
      // both camera modes without adding a per-frame animation or physics cost.
      const carriage = new THREE.Mesh(new RoundedBoxGeometry(alongX ? 112 : 38, 34, alongX ? 38 : 112, 4, 7), steelMat);
      carriage.position.set(
        alongX ? line.start + span * 0.37 : line.coordinate,
        line.elevation + 28,
        alongX ? line.coordinate : line.start + span * 0.63,
      );
      railGroup.add(carriage);
      this.scene.add(railGroup);
    }

    // A broad skyline bridge spans the quiet centre. Its deck is high enough
    // that ground movement remains unrestricted; its two visible foundations
    // are collision obstacles shared with Engine.
    const bridgeSpan = GAME_WIDTH * 0.6;
    const bridgeDeck = new THREE.Mesh(new THREE.BoxGeometry(bridgeSpan, 14, 84), steelMat);
    bridgeDeck.position.set(GAME_WIDTH / 2, WORLD_SKYBRIDGE_ELEVATION, GAME_HEIGHT / 2);
    this.scene.add(bridgeDeck);
    const bridgeGlow = new THREE.Mesh(new THREE.BoxGeometry(bridgeSpan - 20, 3, 3), new THREE.MeshStandardMaterial({ color: 0xfbbf24, emissive: 0xfbbf24, emissiveIntensity: 1.1 }));
    bridgeGlow.position.set(GAME_WIDTH / 2, WORLD_SKYBRIDGE_ELEVATION + 10, GAME_HEIGHT / 2 - 42);
    this.scene.add(bridgeGlow);
    for (const pylon of bridgePylons) {
      const support = new THREE.Mesh(pylonGeo, concreteMat);
      support.scale.y = pylon.elevation;
      support.position.set(pylon.x + pylon.width / 2, pylon.elevation / 2, pylon.y + pylon.height / 2);
      this.scene.add(support);
      const cap = new THREE.Mesh(capGeo, new THREE.MeshStandardMaterial({ color: 0xfbbf24, emissive: 0xfbbf24, emissiveIntensity: 0.8 }));
      cap.position.set(pylon.x + pylon.width / 2, pylon.elevation - 4, pylon.y + pylon.height / 2);
      this.scene.add(cap);
    }
  }

  private setupDistantSkyline() {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshStandardMaterial({ color: 0x14243b, emissive: 0x0c1d36, emissiveIntensity: 0.65, metalness: 0.8, roughness: 0.34 });
    const skyline = new THREE.InstancedMesh(geometry, material, 30);
    const temp = new THREE.Object3D();
    for (let i = 0; i < 30; i++) {
      const angle = (i / 30) * Math.PI * 2;
      const radius = Math.max(GAME_WIDTH, GAME_HEIGHT) * 0.58 + (i % 5) * 180;
      const height = 340 + ((i * 137) % 760);
      temp.position.set(GAME_WIDTH / 2 + Math.cos(angle) * radius, height / 2, GAME_HEIGHT / 2 + Math.sin(angle) * radius);
      temp.rotation.set(0, angle * 0.35, 0);
      temp.scale.set(90 + (i % 4) * 38, height, 90 + ((i + 2) % 4) * 42);
      temp.updateMatrix();
      skyline.setMatrixAt(i, temp.matrix);
    }
    skyline.instanceMatrix.needsUpdate = true;
    this.scene.add(skyline);
  }

  private setupGasZoneVisuals() {
    this.gasZoneGroup = new THREE.Group();
    this.gasZoneGroup.name = 'gasZoneGroup';
    this.gasZoneGroup.visible = false;

    // 1. Billowing cylindrical toxic cloud wall
    const wallGeo = new THREE.CylinderGeometry(1, 1, 450, 48, 1, true);
    this.gasWallMaterial = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.NormalBlending,
      uniforms: {
        time: { value: 0 },
        gasColor: { value: new THREE.Color(0x22c55e) },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          vec4 worldPos = modelMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * viewMatrix * worldPos;
        }
      `,
      fragmentShader: `
        uniform float time;
        uniform vec3 gasColor;
        varying vec2 vUv;
        void main() {
          float verticalFade = sin(vUv.y * 3.14159);
          float wave = sin(vUv.x * 24.0 + time * 1.5) * 0.25 + sin(vUv.y * 14.0 - time * 1.2) * 0.25 + 0.5;
          float alpha = clamp(verticalFade * (0.28 + 0.32 * wave), 0.0, 0.65);
          vec3 col = mix(gasColor, vec3(0.72, 0.95, 0.2), wave * 0.35);
          gl_FragColor = vec4(col, alpha);
        }
      `,
    });
    this.gasWallMesh = new THREE.Mesh(wallGeo, this.gasWallMaterial);
    this.gasWallMesh.position.y = 225;
    this.gasZoneGroup.add(this.gasWallMesh);

    // 2. Ground hazard perimeter ring
    const ringGeo = new THREE.RingGeometry(0.985, 1.015, 64);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x4ade80,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.gasPerimeterRing = new THREE.Mesh(ringGeo, ringMat);
    this.gasPerimeterRing.rotation.x = -Math.PI / 2;
    this.gasPerimeterRing.position.y = 1.5;
    this.gasZoneGroup.add(this.gasPerimeterRing);

    this.scene.add(this.gasZoneGroup);
  }

  private updateGasZoneVisuals(gasZone?: { x: number; y: number; radius: number }, deltaMs = 16) {
    if (!gasZone) {
      if (this.gasZoneGroup) this.gasZoneGroup.visible = false;
      return;
    }
    this.gasZoneGroup.visible = true;
    this.gasZoneGroup.position.set(gasZone.x, 0, gasZone.y);
    const radius = Math.max(10, gasZone.radius);
    this.gasWallMesh.scale.set(radius, 1, radius);
    this.gasPerimeterRing.scale.set(radius, radius, 1);
    this.gasWallMaterial.uniforms.time.value += (deltaMs / 1000);
  }

  private updateWorldAtmosphere(position: { x: number; y: number }, deltaTime: number, gasZone?: { x: number; y: number; radius: number }) {
    const district = getWorldDistrictAt(position.x, position.y);
    const fog = this.scene.fog as THREE.FogExp2;
    const inGas = gasZone && Math.hypot(position.x - gasZone.x, position.y - gasZone.y) <= gasZone.radius;

    const targetFog = inGas ? new THREE.Color(0x1a3d12) : new THREE.Color(district.skyColor);
    const targetDensity = inGas ? 0.0032 : 0.00018;
    const targetAmbient = inGas ? new THREE.Color(0x284f18) : new THREE.Color(district.skyColor);
    const targetAmbientIntensity = inGas ? 1.25 : 2.35;

    fog.color.lerp(targetFog, 1 - Math.exp(-deltaTime * 0.002));
    fog.density = THREE.MathUtils.lerp(fog.density, targetDensity, 1 - Math.exp(-deltaTime * 0.002));
    this.ambientLight.color.lerp(targetAmbient, 1 - Math.exp(-deltaTime * 0.002));
    this.ambientLight.intensity = THREE.MathUtils.lerp(this.ambientLight.intensity, targetAmbientIntensity, 1 - Math.exp(-deltaTime * 0.002));

    if (this.dirLight) {
      const targetDirIntensity = inGas ? 0.45 : 1.4;
      this.dirLight.intensity = THREE.MathUtils.lerp(this.dirLight.intensity, targetDirIntensity, 1 - Math.exp(-deltaTime * 0.002));
    }

    const storm = this.scene.getObjectByName('storm-cloud-ring');
    if (storm) storm.rotation.y += deltaTime * 0.000015;
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

    // Premium cosmetics receive a dedicated owner-visible signature around
    // the cybernetic forearm. It is always allocated once and merely hidden
    // for standard skins: two fixed draw calls, no runtime particle spawning.
    this.coopPremiumViewmodelEffect = new THREE.Group();
    this.coopPremiumViewmodelEffect.name = 'coop-premium-viewmodel-signature';
    this.coopPremiumViewmodelEffect.position.set(1.1, -1.82, 1.9);
    const premiumRingMaterial = new THREE.MeshBasicMaterial({
      color: 0x7dd3fc,
      transparent: true,
      opacity: .78,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    this.coopPremiumViewmodelRing = new THREE.Mesh(new THREE.TorusGeometry(.94, .052, 6, 28), premiumRingMaterial);
    this.coopPremiumViewmodelEffect.add(this.coopPremiumViewmodelRing);
    const orbitPositions = new Float32Array(12 * 3);
    for (let index = 0; index < 12; index++) {
      const angle = index / 12 * Math.PI * 2;
      orbitPositions[index * 3] = Math.cos(angle) * 1.12;
      orbitPositions[index * 3 + 1] = Math.sin(angle) * 1.12;
      orbitPositions[index * 3 + 2] = (index % 3 - 1) * .34;
    }
    const orbitGeometry = new THREE.BufferGeometry();
    orbitGeometry.setAttribute('position', new THREE.BufferAttribute(orbitPositions, 3));
    const orbitMaterial = new THREE.PointsMaterial({ color: 0xf0f9ff, size: .105, transparent: true, opacity: .92, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    this.coopPremiumViewmodelParticles = new THREE.Points(orbitGeometry, orbitMaterial);
    this.coopPremiumViewmodelEffect.add(this.coopPremiumViewmodelParticles);
    this.coopPremiumViewmodelEffect.visible = false;
    this.rightArmRoot.add(this.coopPremiumViewmodelEffect);

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

    // Third-person weapon: it deliberately sits at shoulder/hand height and
    // has a readable silhouette from the chase camera. The old low, plain box
    // disappeared into the torso, which made firing feel detached from the rig.
    const blasterGeo = new RoundedBoxGeometry(4.2, 3.4, 15, 3, 0.62);
    const blasterMat = new THREE.MeshStandardMaterial({
      color: 0x223048,
      emissive: 0x00f0ff,
      emissiveIntensity: 0.85,
      metalness: 0.82,
      roughness: 0.27
    });
    this.tpBlasterMesh = new THREE.Mesh(blasterGeo, blasterMat);
    this.tpBlasterMesh.position.set(15, 23, 6.8);
    this.tpBlasterMesh.rotation.x = -0.08;
    this.thirdPersonPlayerGroup.add(this.tpBlasterMesh);

    const barrel = new THREE.Mesh(
      new THREE.CylinderGeometry(1.25, 1.55, 7.5, 12),
      blasterMat
    );
    barrel.rotation.x = Math.PI / 2;
    barrel.position.z = 9.8;
    this.tpBlasterMesh.add(barrel);

    const weaponGlowMat = new THREE.MeshBasicMaterial({
      color: 0x00f0ff,
      transparent: true,
      opacity: 0.92,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    for (const side of [-1, 1]) {
      const coil = new THREE.Mesh(new THREE.TorusGeometry(1.38, 0.18, 8, 16), weaponGlowMat);
      coil.position.set(side * 1.8, 0, 5.8);
      coil.rotation.y = Math.PI / 2;
      this.tpBlasterMesh.add(coil);
    }
    const powerCell = new THREE.Mesh(new RoundedBoxGeometry(1.3, 1.1, 5.2, 2, 0.24), weaponGlowMat);
    powerCell.position.set(0, 0.15, 1.6);
    this.tpBlasterMesh.add(powerCell);

    // This is the authoritative third-person firing origin. It is attached to
    // the visible weapon, so every directed effect can emerge from the barrel
    // instead of from an arbitrary offset near the character.
    this.tpMuzzlePoint = new THREE.Object3D();
    this.tpMuzzlePoint.position.set(0, 0, 13.65);
    this.tpBlasterMesh.add(this.tpMuzzlePoint);
    this.tpMuzzleFlash = new THREE.Mesh(
      new THREE.SphereGeometry(2.8, 10, 8),
      new THREE.MeshBasicMaterial({
        color: 0x00f0ff,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      })
    );
    this.tpMuzzleFlash.position.z = 13.95;
    this.tpBlasterMesh.add(this.tpMuzzleFlash);
    this.tpMuzzleLight = new THREE.PointLight(0x00f0ff, 0, 90, 2);
    this.tpMuzzleLight.position.z = 13.5;
    this.tpBlasterMesh.add(this.tpMuzzleLight);

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
    this.particleSizes = new Float32Array(this.MAX_3D_PARTICLES);
    this.particleAlphas = new Float32Array(this.MAX_3D_PARTICLES);

    this.particleGeo = new THREE.BufferGeometry();
    this.particleGeo.setAttribute('position', new THREE.BufferAttribute(this.particlePositions, 3));
    this.particleGeo.setAttribute('color', new THREE.BufferAttribute(this.particleColors, 3));
    this.particleGeo.setAttribute('size', new THREE.BufferAttribute(this.particleSizes, 1));
    this.particleGeo.setAttribute('alpha', new THREE.BufferAttribute(this.particleAlphas, 1));

    // Soft, per-particle additive sprites retain gameplay VFX size and fade
    // instead of reducing every hit, trail and explosion to one hard 6px dot.
    const particleMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      vertexColors: true,
      blending: THREE.AdditiveBlending,
      vertexShader: `
        attribute float size;
        attribute float alpha;
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          vColor = color;
          vAlpha = alpha;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = clamp(size * (300.0 / max(1.0, -mvPosition.z)), 2.0, 48.0);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          vec2 centered = gl_PointCoord - vec2(0.5);
          float falloff = smoothstep(0.5, 0.0, length(centered));
          gl_FragColor = vec4(vColor, vAlpha * falloff);
        }
      `
    });

    this.particleSystem = new THREE.Points(this.particleGeo, particleMat);
    this.particleSystem.frustumCulled = false;
    this.scene.add(this.particleSystem);
  }

  private onMouseMove = (e: MouseEvent) => {
    // First and third person share the same locked-mouse look contract. A
    // third-person camera must never require holding a mouse button to orbit.
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
        this.renderer.domElement.tabIndex = -1;
        this.renderer.domElement.focus({ preventScroll: true });
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
    if (this.tpMuzzleFlash && this.tpMuzzleLight) {
      const tpFlashMat = this.tpMuzzleFlash.material as THREE.MeshBasicMaterial;
      tpFlashMat.color.copy(c);
      tpFlashMat.opacity = 1;
      this.tpMuzzleFlash.scale.setScalar(1 + Math.random() * 0.45);
      this.tpMuzzleLight.color.copy(c);
      this.tpMuzzleLight.intensity = 8;
    }
  }

  getThirdPersonMuzzleTransform(): {
    position: { x: number; y: number; z: number };
    forward: { x: number; y: number; z: number };
  } {
    this.thirdPersonPlayerGroup.updateMatrixWorld(true);
    this.tpMuzzlePoint.getWorldPosition(this.tempMuzzlePos);
    this.tpMuzzlePoint.getWorldQuaternion(this.tempMuzzleQuat);
    // The third-person blaster is authored along local +Z, toward the visor.
    this.tempMuzzleFwd.set(0, 0, 1).applyQuaternion(this.tempMuzzleQuat).normalize();
    return {
      position: { x: this.tempMuzzlePos.x, y: this.tempMuzzlePos.y, z: this.tempMuzzlePos.z },
      forward: { x: this.tempMuzzleFwd.x, y: this.tempMuzzleFwd.y, z: this.tempMuzzleFwd.z }
    };
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
  projectViewmodelPointToWorld(point: THREE.Object3D): { x: number; y: number; z: number } {
    this.camera.updateMatrixWorld(true);
    this.viewmodelCamera.updateMatrixWorld(true);
    point.getWorldPosition(this.tempMuzzlePos);
    const muzzleDepth = THREE.MathUtils.clamp(
      this.tempMuzzlePos.distanceTo(this.viewmodelCamera.position),
      6,
      32
    );
    this.tempMuzzleNdc.copy(this.tempMuzzlePos).project(this.viewmodelCamera);
    this.tempMuzzleNdc2.set(this.tempMuzzleNdc.x, this.tempMuzzleNdc.y);
    this.tempRaycaster.setFromCamera(this.tempMuzzleNdc2, this.camera);
    this.tempRaycaster.ray.at(muzzleDepth, this.tempMuzzlePos);
    return { x: this.tempMuzzlePos.x, y: this.tempMuzzlePos.y, z: this.tempMuzzlePos.z };
  }

  private getProjectedMuzzleWorldPosition(): THREE.Vector3 {
    const projected = this.projectViewmodelPointToWorld(this.weaponMuzzlePoint);
    return this.tempMuzzlePos.set(projected.x, projected.y, projected.z);
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
    this.activeViewMode = engine.viewMode;
    if (engine.viewMode === 'THIRD_PERSON') {
      this.thirdPersonPlayerGroup.position.set(engine.player.position.x, this.presentationVerticalOffset, engine.player.position.y);
      this.thirdPersonPlayerGroup.scale.set(1, this.presentationSliding ? 0.62 : 1, this.presentationSliding ? 1.16 : 1);
      this.thirdPersonPlayerGroup.rotation.y = this.yaw + Math.PI;
      this.thirdPersonPlayerGroup.updateMatrixWorld(true);
      return;
    }
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

    const baseFov = engine.isDashing ? this.WORLD_DASH_FOV : (this.presentationSprinting ? this.WORLD_FOV + 7 : this.WORLD_FOV);
    const adsWorldFov = this.presentationScoped ? 28 : this.ADS_FOV;
    const adsViewmodelFov = this.presentationScoped ? 42 : this.VIEWMODEL_ADS_FOV;
    const targetWorldFov = THREE.MathUtils.lerp(baseFov, adsWorldFov, this.adsProgress);
    const targetViewmodelFov = THREE.MathUtils.lerp(this.VIEWMODEL_FOV, adsViewmodelFov, this.adsProgress);
    this.camera.fov = this.damp(this.camera.fov, targetWorldFov, 13, deltaTime);
    this.viewmodelCamera.fov = this.damp(this.viewmodelCamera.fov, targetViewmodelFov, 15, deltaTime);
    this.camera.updateProjectionMatrix();
    this.viewmodelCamera.updateProjectionMatrix();
    this.sensitivity = THREE.MathUtils.lerp(0.0022, this.presentationScoped ? 0.00077 : 0.00105, this.adsProgress);

    const shakeMult = 1 - this.adsProgress * 0.7;
    const shakeX = (Math.random() - 0.5) * engine.screenShake * 0.8 * shakeMult;
    const shakeY = (Math.random() - 0.5) * engine.screenShake * 0.8 * shakeMult;
    this.camera.position.set(
      player.position.x + bobX * 0.2 + shakeX,
      COOP_FIRST_PERSON_EYE_HEIGHT + this.presentationVerticalOffset - (this.presentationSliding ? 9 : 0) + bobY * 0.2 + shakeY,
      player.position.y
    );
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.set(
      THREE.MathUtils.clamp(this.pitch + this.presentationCameraPitchOffset, -1.45, 1.45),
      this.yaw,
      this.presentationCameraRoll,
    );

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
    // The plasma handgun is the original authored viewmodel, not the modular
    // co-op firearm rig. Reset and animate its battery cell here so networked
    // reloads visibly eject, present, and reseat the actual on-screen weapon.
    const handgunReload = THREE.MathUtils.clamp(this.presentationHandgunReloadProgress, 0, 1);
    const cellTravel = Math.sin(handgunReload * Math.PI);
    this.weaponBatteryCell.position.set(cellTravel * .72, -1.0 - cellTravel * .78, -2.35 + cellTravel * .34);
    this.weaponBatteryCell.rotation.set(.10 + cellTravel * .54, 0, -cellTravel * .42);

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
    if (handgunReload > 0) {
      // A decisive one-handed inspection/eject pose: it drops below the
      // reticle, rolls toward the player, then snaps naturally back on seat.
      // The motion is applied after the base sway/ADS solve so it cannot be
      // overwritten by the normal first-person animation on the same frame.
      this.fpsWeaponGroup.position.x += cellTravel * .52;
      this.fpsWeaponGroup.position.y -= cellTravel * 1.18;
      this.fpsWeaponGroup.position.z += cellTravel * .76;
      this.fpsWeaponGroup.rotation.x += cellTravel * .58;
      this.fpsWeaponGroup.rotation.y += cellTravel * .14;
      this.fpsWeaponGroup.rotation.z -= cellTravel * .27;
    }
    this.camera.updateMatrixWorld(true);
    this.viewmodelCamera.updateMatrixWorld(true);
  }

  // Render loop called once per frame from GameEngine
  render(engine: GameEngine, deltaTime: number) {
    this.renderer.info.reset();
    const player = engine.player;
    const viewMode = engine.viewMode;
    this.activeViewMode = viewMode;
    this.activeEvolutionProfiles.clear();
    this.evolutionCrestCounts.clear();
    for (const weapon of engine.player.weapons) {
      const profile = getEvolutionProfile(weapon.evolutionId);
      if (profile) this.activeEvolutionProfiles.set(weapon.id, profile);
    }
    const op = OPERATOR_DEFINITIONS.find(o => o.id === player.operatorId) || OPERATOR_DEFINITIONS[0];
    const gasZone = (engine as any).gasZone;
    this.updateWorldAtmosphere(player.position, deltaTime, gasZone);
    this.updateGasZoneVisuals(gasZone, deltaTime);

    // Safely parse Operator Colors with cached lookup
    const suit = this.coopSuitPalette;
    const primaryColor = parseHexColor(suit?.primary || op.color, 0x00f0ff);
    const secondaryColor = parseHexColor(suit?.secondary || op.colorSecondary, 0x0d5e5e);
    const darkColor = parseHexColor(suit?.dark || op.colorDark, 0x0a3d3d);
    const glowColor = parseHexColor(suit?.glow || op.colorGlow, 0x00f0ff);
    const visorColor = parseHexColor(suit?.visor || op.colorVisor, 0x00ffff);
    const limbsColor = parseHexColor(suit?.primary || op.colorLimbs, 0x00b8b8);
    const bootsColor = parseHexColor(suit?.dark || op.colorBoots, 0x006666);

    // 1. Update Player Point Light & Viewmodel Glow
    this.playerPointLight.color.copy(primaryColor);
    this.playerPointLight.position.set(
      player.position.x,
      COOP_FIRST_PERSON_EYE_HEIGHT + 6 + this.presentationVerticalOffset,
      player.position.y,
    );
    this.vmGlowLight.color.copy(primaryColor);
    this.vmGlowLight.intensity = suit?.premium ? 2.35 + (suit.emissiveIntensity || 0) * 1.25 : 2.2;

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
    if (suit) {
      for (const mesh of [this.armForearmMain, this.armCarbonPlate, this.armChevronTrim, this.armPalm]) {
        const material = mesh.material as THREE.MeshStandardMaterial;
        if (suit.metalness !== undefined) material.metalness = suit.metalness;
        if (suit.roughness !== undefined) material.roughness = suit.roughness;
      }
      (this.armChevronTrim.material as THREE.MeshStandardMaterial).emissiveIntensity = suit.emissiveIntensity ?? .85;
    }
    (this.armThumb.material as THREE.MeshStandardMaterial).color.copy(secondaryColor).multiplyScalar(0.42);
    for (const f of this.armFingers) {
      (f.material as THREE.MeshStandardMaterial).color.copy(secondaryColor).multiplyScalar(0.42);
    }
    for (const k of this.armFingerKnuckles) {
      (k.material as THREE.MeshBasicMaterial).color.copy(primaryColor);
    }
    (this.armWristHoloDisplay.material as THREE.MeshBasicMaterial).color.copy(visorColor);
    (this.armHoloLines.material as THREE.MeshBasicMaterial).color.copy(visorColor).multiplyScalar(0.65);

    const premiumViewmodel = Boolean(suit?.premium && viewMode === 'FIRST_PERSON');
    this.coopPremiumViewmodelEffect.visible = premiumViewmodel;
    if (premiumViewmodel) {
      const signaturePulse = .5 + .5 * Math.sin(engine.gameTime * .0042);
      this.coopPremiumViewmodelEffect.rotation.z = engine.gameTime * (suit!.signature === 'black_ice' ? .00075 : -.00115);
      this.coopPremiumViewmodelEffect.rotation.x = Math.sin(engine.gameTime * .0017) * .16;
      this.coopPremiumViewmodelEffect.scale.setScalar(.94 + signaturePulse * .12);
      this.coopPremiumViewmodelRing.material.color.copy(glowColor);
      this.coopPremiumViewmodelRing.material.opacity = .58 + signaturePulse * .32;
      this.coopPremiumViewmodelParticles.material.color.copy(visorColor);
      this.coopPremiumViewmodelParticles.material.opacity = .7 + signaturePulse * .28;
      this.coopPremiumViewmodelParticles.material.size = .09 + signaturePulse * .055;
      (this.armWristHoloDisplay.material as THREE.MeshBasicMaterial).opacity = .3 + signaturePulse * .22;
      (this.armHoloLines.material as THREE.MeshBasicMaterial).opacity = .62 + signaturePulse * .3;
    } else {
      (this.armWristHoloDisplay.material as THREE.MeshBasicMaterial).opacity = .2;
      (this.armHoloLines.material as THREE.MeshBasicMaterial).opacity = .55;
    }

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
      // Hide the old box-mesh self-avatar when spectating — the spectated
      // player's CoopOperatorRig is already in the scene and looks far better.
      this.thirdPersonPlayerGroup.visible = !this.presentationSpectating;

      // Third Person High FOV (92° standard, 108° dash)
      const targetFov = engine.isDashing ? 94 : (this.presentationSprinting ? 86 : 78);
      this.camera.fov += (targetFov - this.camera.fov) * 0.14;
      this.camera.updateProjectionMatrix();

      // Third Person Chase Camera behind player
      const chaseDist = 220;
      const camHeight = 120;
      
      const camOffsetX = Math.sin(this.yaw) * Math.cos(this.pitch) * chaseDist;
      const camOffsetZ = Math.cos(this.yaw) * Math.cos(this.pitch) * chaseDist;
      const camOffsetY = Math.sin(this.pitch) * chaseDist + camHeight;
      const shoulderOffset = 52;
      const shoulderX = Math.cos(this.yaw) * shoulderOffset;
      const shoulderZ = -Math.sin(this.yaw) * shoulderOffset;
      const focusX = player.position.x - Math.sin(this.yaw) * 26;
      const focusZ = player.position.y - Math.cos(this.yaw) * 26;

      const thirdShake = engine.screenShake * 0.32;
      this.camera.position.set(
        player.position.x + camOffsetX + shoulderX,
        Math.max(20, camOffsetY) + this.presentationVerticalOffset + (Math.random() - 0.5) * thirdShake,
        player.position.y + camOffsetZ + shoulderZ + (Math.random() - 0.5) * thirdShake
      );
      this.camera.lookAt(focusX, 30 + this.presentationVerticalOffset, focusZ);

      // Position Third-Person Character
      this.thirdPersonPlayerGroup.position.set(player.position.x, this.presentationVerticalOffset, player.position.y);
      this.thirdPersonPlayerGroup.rotation.y = this.yaw + Math.PI;
      this.thirdPersonPlayerGroup.scale.set(1, this.presentationSliding ? 0.62 : 1, this.presentationSliding ? 1.16 : 1);

      // Halo ring rotation & pulse
      this.tpGroundRingMesh.rotation.z += deltaTime * 0.002;
      if (this.muzzleFlashTimer > 0) {
        this.muzzleFlashTimer -= deltaTime;
        const flashLife = THREE.MathUtils.clamp(this.muzzleFlashTimer / 48, 0, 1);
        (this.tpMuzzleFlash.material as THREE.MeshBasicMaterial).opacity = flashLife;
        this.tpMuzzleLight.intensity = flashLife * 8;
        this.tpBlasterMesh.position.z = 6.8 - (1 - flashLife) * 1.6;
      } else {
        (this.tpMuzzleFlash.material as THREE.MeshBasicMaterial).opacity = 0;
        this.tpMuzzleLight.intensity = 0;
        this.tpBlasterMesh.position.z = 6.8;
      }

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

    // 2. Persistent equipment VFX (auras never blink with their damage tick)
    this.updatePersistentAuras(engine, deltaTime);

    // 3. Persistent orbiting equipment (the collision tick remains in Engine)
    this.updatePersistentOrbitWeapons(engine, deltaTime);

    // 4. Render Projectiles in 3D
    this.updateProjectiles3D(engine.projectiles, deltaTime);

    // 5. Aggregate multi-sample tendril collisions into one readable strike.
    this.updateTendrilStrikes3D(engine.projectiles, deltaTime);

    // 6. Render each Spectral Helix cast as two continuous strands.
    this.updateHelixStrikes3D(engine.projectiles, deltaTime);

    // 7. Render each Solar Flare cast as one controlled plasma cone.
    this.updateSolarFlareStrikes3D(engine.projectiles, deltaTime);

    // 8. Render Nano Swarm casts through compact instanced nanites.
    this.updateNanoSwarms3D(engine.projectiles);

    // 9. Render Gems in 3D
    this.updateGems3D(engine.gems, deltaTime);

    // 10. Render World Items in 3D
    this.updateItems3D(engine.items, deltaTime);

    // 10. Shops used to exist only on the hidden top-down canvas. Keep them in
    // the same authoritative world-object lifecycle as all other 3D props.
    this.updateShops3D(engine.shops, player, deltaTime);

    // 11. Render Treasures in 3D
    this.updateTreasures3D(engine.treasures, deltaTime);

    // 12. Render Portal in 3D
    this.updatePortal3D(engine.portals, engine.activePortalIndex, deltaTime);

    // 13. Exfill is a destination, not an event-spawn portal. Render it as a
    // dedicated high-visibility landing site in every perspective mode.
    this.updateExfillPortal3D(engine.exfillPortal, deltaTime);

    // 14. Update 3D Particles
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

    // Ease both edges of the effect so tapping sprint never produces a flash.
    // ADS suppresses the streaks to preserve a clean sight picture.
    const speedLineTarget = viewMode === 'FIRST_PERSON' && this.presentationSprinting
      ? 0.26 * (1 - this.adsProgress)
      : 0;
    this.speedLineIntensity = this.damp(this.speedLineIntensity, speedLineTarget, speedLineTarget > 0 ? 8 : 12, deltaTime);
    this.speedLineMaterial.uniforms.time.value += Math.min(deltaTime, 50) / 1000;
    this.speedLineMaterial.uniforms.intensity.value = this.speedLineIntensity;
    if (this.speedLineIntensity > 0.002) {
      this.renderer.autoClear = false;
      this.renderer.render(this.speedLineScene, this.speedLineCamera);
      this.renderer.autoClear = true;
    }
  }

  private updateEnemies3D(enemies: Enemy[], deltaTime: number) {
    const activeEnemyIds = this.activeEnemyIds; activeEnemyIds.clear();
    const activeAttackIds = this.activeEnemyAttackIds; activeAttackIds.clear();
    const now = Date.now();
    this.coopEnemyBatchRenderer?.beginFrame();
    this.pruneEnemyDamageNumbers(now);

    for (const enemy of enemies) {
      activeEnemyIds.add(enemy.id);
      let mesh = this.enemyMeshes.get(enemy.id);
      if (!mesh) {
        mesh = this.createEnemyMesh(enemy);
        this.scene.add(mesh);
        this.enemyMeshes.set(enemy.id, mesh);
      }
      mesh.visible = true;

      if (mesh.userData.coopRig) {
        this.coopEnemyBatchRenderer?.prepareRig(mesh);
        animateCoopEnemyRig(mesh as THREE.Group, enemy, this.camera, now);
        const needsExactMaterialState = Boolean((enemy.hitFlash || 0) > 0
          || (enemy.presentationAttackCharge || 0) > .001
          || (enemy.presentationDeathProgress || 0) > 0);
        if (!needsExactMaterialState) this.coopEnemyBatchRenderer?.add(enemy, mesh);
        if (this.enemyDamageNumbers.length) this.updateEnemyDamageNumbers(mesh, enemy, now);
        continue;
      }

      // Position in 3D (x = 2D.x, z = 2D.y, y = elevation)
      const baseHeight = enemy.type === 'titan' ? 36 : (enemy.type === 'phantom' ? 24 : 14);
      const floatBob = enemy.type === 'phantom' ? Math.sin(now * 0.005 + ((enemy.id.charCodeAt(enemy.id.length - 1) || 0) * 17)) * 8 : 0;

      mesh.position.set(enemy.position.x, baseHeight + floatBob, enemy.position.y);

      // Rotate toward player
      const dirX = this.camera.position.x - enemy.position.x;
      const dirZ = this.camera.position.z - enemy.position.y;
      mesh.rotation.y = Math.atan2(dirX, dirZ);
      const charge = THREE.MathUtils.clamp(enemy.presentationAttackCharge || 0, 0, 1);
      mesh.scale.setScalar(1 + Math.sin(charge * Math.PI) * .1);
      if (enemy.attackTarget && enemy.attackKind && charge >= 0) {
        activeAttackIds.add(enemy.id);
        let telegraph = this.enemyAttackTelegraphs.get(enemy.id);
        if (!telegraph) {
          telegraph = this.telegraphPool.pop();
          if (!telegraph) {
            telegraph = new THREE.Mesh(
              this.telegraphSharedGeometry,
              new THREE.MeshBasicMaterial({ color: enemy.color, transparent: true, opacity: .72, side: THREE.DoubleSide, depthWrite: false, toneMapped: false })
            );
            telegraph.rotation.x = -Math.PI / 2;
            this.scene.add(telegraph);
          }
          telegraph.visible = true;
          this.enemyAttackTelegraphs.set(enemy.id, telegraph);
        }
        const radius = enemy.type === 'boss' ? 150 : ENEMY_ATTACK_PROFILES[enemy.type]?.radius || 70;
        telegraph.position.set(enemy.attackTarget.x, 2.5, enemy.attackTarget.y);
        telegraph.scale.setScalar(radius * (.35 + charge * .65));
        const material = telegraph.material as THREE.MeshBasicMaterial;
        material.color.set(enemy.color); material.opacity = .45 + charge * .5;
      }

      // Hit Flash feedback
      const mainMat = (mesh as any)._mainMaterial as THREE.MeshStandardMaterial;
      if (mainMat) {
        if (enemy.hitFlash && enemy.hitFlash > 0) {
          mainMat.emissive.setHex(0xffffff);
          mainMat.emissiveIntensity = 2.5;
        } else {
          mainMat.emissive.copy(parseHexColor(enemy.color, 0xff0055));
          mainMat.emissiveIntensity = 0.8 + charge * 1.1;
        }
      }

      // In perspective modes the 2D health bars are not present. Keep a
      // compact world-space bar above damaged enemies so a co-op player can
      // read hit confirmation and focus fire without relying on HUD text.
      const healthBar = (mesh as any)._healthBar as THREE.Group | undefined;
      const healthFill = (mesh as any)._healthFill as THREE.Mesh | undefined;
      if (healthBar && healthFill) {
        const isDamaged = enemy.health < enemy.maxHealth && enemy.health > 0;
        healthBar.visible = isDamaged;
        if (isDamaged) {
          const ratio = THREE.MathUtils.clamp(enemy.health / Math.max(1, enemy.maxHealth), 0, 1);
          healthBar.quaternion.copy(mesh.quaternion).invert().multiply(this.camera.quaternion);
          healthFill.scale.x = ratio;
          healthFill.position.x = -((1 - ratio) * (enemy.radius || 15));
        }
      }
    }
    this.coopEnemyBatchRenderer?.endFrame();

    // Cleanup dead enemies
    for (const [id, mesh] of this.enemyMeshes.entries()) {
      if (!activeEnemyIds.has(id)) {
        this.clearEnemyDamageNumbers(id);
        this.scene.remove(mesh);
        if (mesh.userData.coopRig) disposeCoopEnemyRig(mesh);
        else this.disposeEffectMesh(mesh);
        this.enemyMeshes.delete(id);
      }
    }
    for (const [id, telegraph] of this.enemyAttackTelegraphs) {
      if (activeAttackIds.has(id)) continue;
      telegraph.visible = false;
      this.telegraphPool.push(telegraph);
      this.enemyAttackTelegraphs.delete(id);
    }
  }

  private updateEnemyDamageNumbers(mesh: THREE.Object3D, enemy: Enemy, now: number) {
    if (!this.enemyDamageNumbers.some(label => label.enemyId === enemy.id)) return;
    const labels = this.enemyDamageNumbers.filter(label => label.enemyId === enemy.id);
    labels.forEach((label, index) => {
      if (label.sprite.parent !== mesh) mesh.add(label.sprite);
      const age = now - label.bornAt;
      const progress = THREE.MathUtils.clamp(age / 760, 0, 1);
      const pop = 1 + Math.sin(Math.min(1, progress * 5.4) * Math.PI) * .07;
      const stackDepth = labels.length - index - 1;
      label.sprite.position.set(0, enemy.radius * 1.66 + 8 + stackDepth * 13 + progress * 4, 0);
      label.sprite.scale.set(50 * pop, 14.6 * pop, 1);
      (label.sprite.material as THREE.SpriteMaterial).opacity = .9 * (1 - THREE.MathUtils.smoothstep(progress, .66, 1));
    });
  }

  private pruneEnemyDamageNumbers(now: number) {
    for (let index = this.enemyDamageNumbers.length - 1; index >= 0; index--) {
      const label = this.enemyDamageNumbers[index];
      if (now - label.bornAt <= 760) continue;
      this.enemyDamageNumbers.splice(index, 1);
      this.disposeEnemyDamageNumber(label);
    }
  }

  private clearEnemyDamageNumbers(enemyId: string) {
    for (let index = this.enemyDamageNumbers.length - 1; index >= 0; index--) {
      const label = this.enemyDamageNumbers[index];
      if (label.enemyId !== enemyId) continue;
      this.enemyDamageNumbers.splice(index, 1);
      this.disposeEnemyDamageNumber(label);
    }
  }

  private disposeEnemyDamageNumber(label: EnemyDamageNumberVisual) {
    label.sprite.removeFromParent();
    const material = label.sprite.material as THREE.SpriteMaterial;
    material.map = null;
    material.opacity = 0;
    material.needsUpdate = true;
    const texture = this.enemyDamageNumberTextures.get(label.textureKey);
    if (texture) {
      texture.references = Math.max(0, texture.references - 1);
      texture.lastUsed = Date.now();
    }
    if (this.enemyDamageNumberPool.length < 3) this.enemyDamageNumberPool.push(label.sprite);
    else material.dispose();
  }

  /** Keep equipped aura visuals alive between their discrete gameplay damage
   * ticks. The tick is now an accent pulse, never the existence of the aura. */
  private updatePersistentAuras(engine: GameEngine, deltaTime: number) {
    const equipped = new Set(engine.player.weapons
      .filter((weapon) => weapon.id === 'void_aura' || weapon.id === 'frost_aura')
      .map((weapon) => weapon.id as 'void_aura' | 'frost_aura'));
    const now = Date.now() * 0.001;

    for (const weaponId of equipped) {
      const weapon = engine.player.weapons.find((candidate) => candidate.id === weaponId)!;
      const levelMult = 1 + (weapon.level - 1) * 0.2;
      const gameplayRadius = (weaponId === 'void_aura' ? 120 : 200) * engine.player.stats.area * levelMult;
      const visualRadius = weaponId === 'void_aura'
        ? compressVisualRadius(gameplayRadius, 105, 155)
        : compressVisualRadius(gameplayRadius, 105, 155);
      let aura = this.persistentAuraMeshes.get(weaponId);
      if (!aura) {
        aura = this.createAuraVisual(weaponId, visualRadius);
        this.persistentAuraMeshes.set(weaponId, aura);
        this.scene.add(aura);
      }
      const auraEvolution = getEvolutionProfile(weapon.evolutionId);
      if (auraEvolution && aura.userData.evolutionId !== auraEvolution.id) {
        this.attachEvolutionCrest(aura, auraEvolution, Math.min(28, visualRadius * 0.16));
        aura.userData.evolutionId = auraEvolution.id;
      }

      aura.position.set(engine.player.position.x, 20, engine.player.position.y);
      const baseRadius = aura.userData.baseVisualRadius as number;
      const targetAreaScale = visualRadius / baseRadius;
      const currentAreaScale = aura.userData.currentAreaScale as number;
      const nextAreaScale = THREE.MathUtils.lerp(currentAreaScale, targetAreaScale, 1 - Math.exp(-deltaTime * 0.006));
      aura.userData.currentAreaScale = nextAreaScale;

      const pulseActive = engine.projectiles.some((projectile) => projectile.sourceWeaponId === weaponId || projectile.id === weaponId);
      const idleBreath = 0.985 + Math.sin(now * (weaponId === 'frost_aura' ? 2.8 : 3.6)) * 0.015;
      const damagePulse = pulseActive ? 1.13 + Math.sin(now * 17) * 0.045 : 1;
      aura.scale.setScalar(nextAreaScale * idleBreath * damagePulse);
      aura.rotation.y += deltaTime * (weaponId === 'frost_aura' ? 0.00038 : -0.00058);
      this.pulseTransparentMaterials(aura, pulseActive ? 1 : 0.43);
      aura.traverse((node) => {
        if (!node.userData.auraGlyph) return;
        node.position.y = (node.userData.baseAuraY as number) + Math.sin(now * 3.5 + node.position.x * 0.08) * (pulseActive ? 2.3 : 0.85);
        node.rotation.y += deltaTime * (pulseActive ? 0.003 : 0.0009);
      });
    }

    for (const [weaponId, aura] of this.persistentAuraMeshes) {
      if (equipped.has(weaponId)) continue;
      this.scene.remove(aura);
      this.disposeEffectMesh(aura);
      this.persistentAuraMeshes.delete(weaponId);
    }
  }

  /** Drones and scythes are equipment with continuous motion. Gameplay still
   * emits tiny contact projectiles, but their rendered body is a stable pooled
   * rig so it never flickers at the 50ms collision cadence. */
  private updatePersistentOrbitWeapons(engine: GameEngine, deltaTime: number) {
    const equipped = new Set(engine.player.weapons
      .filter((weapon) => weapon.id === 'orbit_drones' || weapon.id === 'data_scythe')
      .map((weapon) => weapon.id as 'orbit_drones' | 'data_scythe'));

    for (const weaponId of equipped) {
      const weapon = engine.player.weapons.find((candidate) => candidate.id === weaponId)!;
      const isDrone = weaponId === 'orbit_drones';
      const evolution = getEvolutionProfile(weapon.evolutionId);
      const desiredCount = (isDrone ? 2 : 1) + Math.floor(engine.player.stats.amount) + (evolution?.amountBonus || 0);
      const levelMult = 1 + (weapon.level - 1) * 0.2;
      const gameplayOrbit = (isDrone ? 100 : 150) * engine.player.stats.area;
      const visualOrbit = compressVisualRadius(gameplayOrbit, isDrone ? 125 : 150, isDrone ? 185 : 215);
      const visualSize = this.getCompressedVisualRadius({
        id: isDrone ? 'orbit' : 'scythe',
        sourceWeaponId: weaponId,
        radius: (isDrone ? 15 : 20) * engine.player.stats.area * levelMult,
      } as Projectile);
      let root = this.persistentOrbitMeshes.get(weaponId);
      if (!root) {
        root = new THREE.Group();
        root.userData.currentOrbitScale = 1;
        this.persistentOrbitMeshes.set(weaponId, root);
        this.scene.add(root);
      }

      while (root.children.length < desiredCount) {
        const member = this.createProjectileMesh({
          id: isDrone ? 'orbit' : 'scythe',
          sourceWeaponId: weaponId,
          radius: visualSize,
          color: isDrone ? '#ff00ff' : '#ff0044',
        } as Projectile);
        if (evolution) this.attachEvolutionCrest(member, evolution, Math.max(4, visualSize));
        root.add(member);
      }
      while (root.children.length > desiredCount) {
        const member = root.children[root.children.length - 1];
        root.remove(member);
        this.disposeEffectMesh(member);
      }
      if (evolution && root.userData.evolutionId !== evolution.id && root.children[0]) {
        this.attachEvolutionCrest(root.children[0], evolution, Math.max(5, visualSize * 0.72));
        root.userData.evolutionId = evolution.id;
      }

      root.position.set(engine.player.position.x, 0, engine.player.position.y);
      const currentOrbitScale = root.userData.currentOrbitScale as number;
      const targetOrbitScale = visualOrbit / Math.max(1, root.userData.baseOrbitRadius || visualOrbit);
      if (!root.userData.baseOrbitRadius) root.userData.baseOrbitRadius = visualOrbit;
      root.userData.currentOrbitScale = THREE.MathUtils.lerp(currentOrbitScale, targetOrbitScale, 1 - Math.exp(-deltaTime * 0.006));
      const orbitRadius = (root.userData.baseOrbitRadius as number) * (root.userData.currentOrbitScale as number);
      const speed = isDrone ? 0.002 : 0.00333;

      root.children.forEach((member, index) => {
        const angle = engine.gameTime * speed + index * Math.PI * 2 / desiredCount;
        member.position.set(Math.cos(angle) * orbitRadius, 22 + Math.sin(engine.gameTime * 0.006 + index) * (isDrone ? 3 : 1.5), Math.sin(angle) * orbitRadius);
        member.rotation.y += deltaTime * (isDrone ? 0.007 : 0.016);
        if (!isDrone) member.rotation.z += deltaTime * 0.006;
      });
    }

    for (const [weaponId, root] of this.persistentOrbitMeshes) {
      if (equipped.has(weaponId)) continue;
      this.scene.remove(root);
      this.disposeEffectMesh(root);
      this.persistentOrbitMeshes.delete(weaponId);
    }
  }

  /** Eight gameplay collision samples become a single cinematic tendril. It
   * keeps the exact damage path but removes the former 24-tube visual clutter
   * per target. Geometry is built once at strike creation, not every frame. */
  private updateTendrilStrikes3D(projectiles: Projectile[], deltaTime: number) {
    const tendrilGroups = new Map<string, Projectile[]>();
    for (const projectile of projectiles) {
      if (projectile.sourceWeaponId !== 'void_tendrils' && projectile.id !== 'tendril') continue;
      const groupId = projectile.visualGroupId || `single:${getProjectileVisualId(projectile)}`;
      const group = tendrilGroups.get(groupId) || [];
      group.push(projectile);
      tendrilGroups.set(groupId, group);
    }

    for (const [groupId, segments] of tendrilGroups) {
      let strike = this.tendrilStrikeMeshes.get(groupId);
      if (!strike) {
        const ordered = [...segments].sort((a, b) => (a.visualSegmentIndex || 0) - (b.visualSegmentIndex || 0));
        const origin = ordered[0].position;
        const points = [new THREE.Vector3(0, 0, 0), ...ordered.map((segment, index) => new THREE.Vector3(
          segment.position.x - origin.x,
          6 + index * 1.8,
          segment.position.y - origin.y,
        ))];
        const curve = new THREE.CatmullRomCurve3(points);
        strike = new THREE.Group();
        strike.position.set(origin.x, 4, origin.y);
        strike.userData.maxDuration = Math.max(...ordered.map((segment) => segment.duration));
        strike.userData.baseScaleY = 1;

        const outer = new THREE.Mesh(
          new THREE.TubeGeometry(curve, 24, 3.5, 7, false),
          new THREE.MeshStandardMaterial({ color: 0x260944, emissive: 0x7c3aed, emissiveIntensity: 1.15, metalness: 0.38, roughness: 0.3, transparent: true, opacity: 0.78, depthWrite: false })
        );
        strike.add(outer);
        const core = new THREE.Mesh(
          new THREE.TubeGeometry(curve, 24, 1.05, 6, false),
          new THREE.MeshBasicMaterial({ color: 0xe9d5ff, transparent: true, opacity: 0.86, blending: THREE.AdditiveBlending, depthWrite: false })
        );
        strike.add(core);
        const root = new THREE.Mesh(
          new THREE.RingGeometry(13, 20, 20),
          new THREE.MeshBasicMaterial({ color: 0xa855f7, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
        );
        root.rotation.x = -Math.PI / 2;
        strike.add(root);
        const tip = new THREE.Mesh(
          new THREE.SphereGeometry(6, 9, 8),
          new THREE.MeshBasicMaterial({ color: 0xf1d5ff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false })
        );
        tip.position.copy(points[points.length - 1]);
        strike.add(tip);
        this.tendrilStrikeMeshes.set(groupId, strike);
        this.scene.add(strike);
      }

      const remaining = Math.max(...segments.map((segment) => segment.duration));
      const phase = 1 - remaining / Math.max(1, strike.userData.maxDuration as number);
      strike.scale.y = 0.16 + Math.min(0.84, phase * 2.4);
      strike.rotation.y = Math.sin(Date.now() * 0.011 + strike.position.x * 0.02) * 0.11;
      this.pulseTransparentMaterials(strike, 0.82 - phase * 0.42);
    }

    for (const [groupId, strike] of this.tendrilStrikeMeshes) {
      if (tendrilGroups.has(groupId)) continue;
      this.scene.remove(strike);
      this.disposeEffectMesh(strike);
      this.tendrilStrikeMeshes.delete(groupId);
    }
  }

  /** The simulation samples a helix with many projectile beads for collision.
   * Present it as two continuous strands instead of dozens of overlapping
   * meshes, preserving its path while making its DNA silhouette unmistakable. */
  private updateHelixStrikes3D(projectiles: Projectile[], deltaTime: number) {
    const casts = new Map<string, Projectile[]>();
    for (const projectile of projectiles) {
      if (projectile.sourceWeaponId !== 'spectral_helix' && projectile.id !== 'helix') continue;
      const groupId = projectile.visualGroupId || `single:${getProjectileVisualId(projectile)}`;
      const cast = casts.get(groupId) || [];
      cast.push(projectile);
      casts.set(groupId, cast);
    }

    for (const [groupId, samples] of casts) {
      let helix = this.helixStrikeMeshes.get(groupId);
      if (!helix) {
        const strandA = samples.filter((sample) => (sample.visualStrand ?? 0) === 0)
          .sort((a, b) => (a.visualSegmentIndex || 0) - (b.visualSegmentIndex || 0));
        const strandB = samples.filter((sample) => (sample.visualStrand ?? 1) === 1)
          .sort((a, b) => (a.visualSegmentIndex || 0) - (b.visualSegmentIndex || 0));
        const origin = (strandA[0] || samples[0]).position;
        helix = new THREE.Group();
        helix.position.set(origin.x, 24, origin.y);
        helix.userData.initialOrigin = { ...origin };
        helix.userData.maxDuration = Math.max(...samples.map((sample) => sample.duration));

        const createStrand = (strand: Projectile[], color: number) => {
          const points = strand.map((sample, index) => new THREE.Vector3(
            sample.position.x - origin.x,
            Math.sin(index * Math.PI * 0.65) * 8,
            sample.position.y - origin.y,
          ));
          if (points.length < 2) return;
          const curve = new THREE.CatmullRomCurve3(points);
          const glow = new THREE.Mesh(
            new THREE.TubeGeometry(curve, 28, 2.05, 6, false),
            new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.42, blending: THREE.AdditiveBlending, depthWrite: false })
          );
          helix!.add(glow);
          const core = new THREE.Mesh(
            new THREE.TubeGeometry(curve, 28, 0.58, 5, false),
            new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false })
          );
          helix!.add(core);
        };
        createStrand(strandA, 0x42f5ff);
        createStrand(strandB, 0xff78df);

        // Sparse rungs sell the double-helix without adding another cloud of
        // projectile meshes.
        for (let i = 1; i < Math.min(strandA.length, strandB.length); i += 3) {
          const a = new THREE.Vector3(strandA[i].position.x - origin.x, Math.sin(i * Math.PI * 0.65) * 8, strandA[i].position.y - origin.y);
          const b = new THREE.Vector3(strandB[i].position.x - origin.x, Math.sin(i * Math.PI * 0.65) * 8, strandB[i].position.y - origin.y);
          helix.add(new THREE.Line(
            new THREE.BufferGeometry().setFromPoints([a, b]),
            new THREE.LineBasicMaterial({ color: 0xf1d5ff, transparent: true, opacity: 0.62, blending: THREE.AdditiveBlending, depthWrite: false })
          ));
        }
        this.helixStrikeMeshes.set(groupId, helix);
        this.scene.add(helix);
      }

      const anchor = samples.find((sample) => (sample.visualStrand ?? 0) === 0) || samples[0];
      const initialOrigin = helix.userData.initialOrigin as { x: number; y: number };
      helix.position.x = anchor.position.x - initialOrigin.x + initialOrigin.x;
      helix.position.z = anchor.position.y - initialOrigin.y + initialOrigin.y;
      helix.rotation.z += deltaTime * 0.0014;
      const remaining = Math.max(...samples.map((sample) => sample.duration));
      this.pulseTransparentMaterials(helix, 0.5 + remaining / Math.max(1, helix.userData.maxDuration as number) * 0.45);
    }

    for (const [groupId, helix] of this.helixStrikeMeshes) {
      if (casts.has(groupId)) continue;
      this.scene.remove(helix);
      this.disposeEffectMesh(helix);
      this.helixStrikeMeshes.delete(groupId);
    }
  }

  /** Solar's collision model uses many rays, but its presentation is one
   * coherent fire sweep. This avoids high-Amount cone confetti and keeps the
   * whole visual safely in front of a first-person camera. */
  private updateSolarFlareStrikes3D(projectiles: Projectile[], deltaTime: number) {
    const casts = new Map<string, Projectile[]>();
    for (const projectile of projectiles) {
      if (projectile.sourceWeaponId !== 'solar_flare' && projectile.id !== 'flare') continue;
      const groupId = projectile.visualGroupId || `single:${getProjectileVisualId(projectile)}`;
      const cast = casts.get(groupId) || [];
      cast.push(projectile);
      casts.set(groupId, cast);
    }

    for (const [groupId, rays] of casts) {
      let flare = this.solarStrikeMeshes.get(groupId);
      if (!flare) {
        const source = rays[0];
        const origin = source.visualOrigin || source.position;
        const length = Math.min(240, Math.max(70, source.visualLength || 150));
        const direction = source.rotation || 0;
        flare = new THREE.Group();
        // Push the apex beyond the FP lens; collision rays themselves retain
        // their original player-origin position in Engine.
        flare.position.set(origin.x + Math.cos(direction) * 34, 22, origin.y + Math.sin(direction) * 34);
        flare.rotation.y = -direction + Math.PI / 2;
        flare.userData.maxDuration = Math.max(...rays.map((ray) => ray.duration));

        const outer = new THREE.Mesh(
          new THREE.ConeGeometry(length * 0.34, length, 16, 1, true),
          new THREE.MeshBasicMaterial({ color: 0xff5a1f, transparent: true, opacity: 0.24, blending: THREE.AdditiveBlending, depthWrite: false })
        );
        outer.rotation.x = Math.PI / 2;
        outer.position.z = length * 0.46;
        flare.add(outer);
        const core = new THREE.Mesh(
          new THREE.ConeGeometry(length * 0.14, length * 0.92, 12, 1, true),
          new THREE.MeshBasicMaterial({ color: 0xfff3bf, transparent: true, opacity: 0.58, blending: THREE.AdditiveBlending, depthWrite: false })
        );
        core.rotation.x = Math.PI / 2;
        core.position.z = length * 0.42;
        flare.add(core);
        for (const fraction of [0.38, 0.68, 0.94]) {
          const ring = new THREE.Mesh(
            new THREE.TorusGeometry(length * fraction * 0.28, 0.9, 6, 20),
            new THREE.MeshBasicMaterial({ color: fraction > 0.8 ? 0xffe29a : 0xff8a1f, transparent: true, opacity: 0.62, blending: THREE.AdditiveBlending, depthWrite: false })
          );
          ring.position.z = length * fraction;
          flare.add(ring);
        }
        this.solarStrikeMeshes.set(groupId, flare);
        this.scene.add(flare);
      }
      const remaining = Math.max(...rays.map((ray) => ray.duration));
      const phase = remaining / Math.max(1, flare.userData.maxDuration as number);
      flare.scale.setScalar(0.78 + phase * 0.22);
      this.pulseTransparentMaterials(flare, 0.55 + phase * 0.45);
    }

    for (const [groupId, flare] of this.solarStrikeMeshes) {
      if (casts.has(groupId)) continue;
      this.scene.remove(flare);
      this.disposeEffectMesh(flare);
      this.solarStrikeMeshes.delete(groupId);
    }
  }

  /** A swarm should read as one intelligent cloud, not a handful of large
   * tetrahedra emitted into the camera. One instanced mesh covers an entire
   * cast, so high Amount barely changes draw calls or allocation pressure. */
  private updateNanoSwarms3D(projectiles: Projectile[]) {
    const casts = new Map<string, Projectile[]>();
    for (const projectile of projectiles) {
      if (projectile.sourceWeaponId !== 'nano_swarm' && projectile.id !== 'nano') continue;
      const groupId = projectile.visualGroupId || `single:${getProjectileVisualId(projectile)}`;
      const cast = casts.get(groupId) || [];
      cast.push(projectile);
      casts.set(groupId, cast);
    }

    for (const [groupId, samples] of casts) {
      let swarm = this.nanoSwarmMeshes.get(groupId);
      const instanceCount = Math.min(36, Math.max(8, samples.length * 6));
      if (!swarm) {
        swarm = new THREE.Group();
        const nanites = new THREE.InstancedMesh(
          new THREE.TetrahedronGeometry(3.2, 0),
          new THREE.MeshBasicMaterial({ color: 0x5cffb3, transparent: true, opacity: 0.78, blending: THREE.AdditiveBlending, depthWrite: false }),
          instanceCount
        );
        nanites.userData.nanoInstances = true;
        nanites.userData.instanceCount = instanceCount;
        swarm.add(nanites);
        const field = new THREE.Mesh(
          new THREE.IcosahedronGeometry(13, 1),
          new THREE.MeshBasicMaterial({ color: 0x41f7a0, wireframe: true, transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false })
        );
        field.userData.nanoField = true;
        swarm.add(field);
        this.nanoSwarmMeshes.set(groupId, swarm);
        this.scene.add(swarm);
      }

      const nanites = swarm.children.find((child) => child.userData.nanoInstances) as THREE.InstancedMesh;
      const now = Date.now() * 0.001;
      for (let i = 0; i < (nanites.userData.instanceCount as number); i++) {
        const sample = samples[i % samples.length];
        const ring = Math.floor(i / samples.length) + 1;
        const phase = now * (2.8 + ring * 0.35) + i * 2.399;
        const spread = 4.5 + ring * 3.4;
        this.tempInstanceObject.position.set(
          sample.position.x + Math.cos(phase) * spread,
          24 + Math.sin(phase * 1.7) * (2 + ring * 0.7),
          sample.position.y + Math.sin(phase) * spread,
        );
        this.tempInstanceObject.rotation.set(phase * 1.2, phase * 1.8, phase * 0.7);
        const scale = 0.48 + (i % 3) * 0.13;
        this.tempInstanceObject.scale.setScalar(scale);
        this.tempInstanceObject.updateMatrix();
        nanites.setMatrixAt(i, this.tempInstanceObject.matrix);
      }
      nanites.instanceMatrix.needsUpdate = true;
      const field = swarm.children.find((child) => child.userData.nanoField)!;
      const centroid = samples.reduce((sum, sample) => ({ x: sum.x + sample.position.x, y: sum.y + sample.position.y }), { x: 0, y: 0 });
      field.position.set(centroid.x / samples.length, 24, centroid.y / samples.length);
      field.rotation.y += 0.035;
    }

    for (const [groupId, swarm] of this.nanoSwarmMeshes) {
      if (casts.has(groupId)) continue;
      this.scene.remove(swarm);
      this.disposeEffectMesh(swarm);
      this.nanoSwarmMeshes.delete(groupId);
    }
  }

  private createEnemyMesh(enemy: Enemy): THREE.Object3D {
    if (enemy.id.startsWith('coop-enemy-')) return createCoopEnemyRig(enemy);
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
        geo = this.cachedEnemyGeometry(enemy.type, radius, () => new THREE.ConeGeometry(radius * 0.9, radius * 1.8, 4));
        break;
      case 'tank':
        // Armored heavy cube
        geo = this.cachedEnemyGeometry(enemy.type, radius, () => new THREE.BoxGeometry(radius * 1.6, radius * 1.6, radius * 1.6));
        break;
      case 'ranged':
        // Diamond Spire (Octahedron)
        geo = this.cachedEnemyGeometry(enemy.type, radius, () => new THREE.OctahedronGeometry(radius * 1.1, 0));
        break;
      case 'elite':
        // Golden Icosahedron
        geo = this.cachedEnemyGeometry(enemy.type, radius, () => new THREE.IcosahedronGeometry(radius * 1.2, 0));
        break;
      case 'phantom':
        // Ghost sphere + core
        geo = this.cachedEnemyGeometry(enemy.type, radius, () => new THREE.SphereGeometry(radius * 1.1, 10, 10));
        material.wireframe = false;
        material.transparent = true;
        material.opacity = 0.85;
        break;
      case 'titan':
      case 'boss':
        // Giant Star / Mech Colossus
        geo = this.cachedEnemyGeometry(enemy.type, radius, () => new THREE.DodecahedronGeometry(radius * 1.4, 0));
        break;
      case 'basic':
      default:
        // Pulsing geometric pyramid
        geo = this.cachedEnemyGeometry(enemy.type, radius, () => new THREE.ConeGeometry(radius, radius * 1.5, 6));
        break;
    }

    const mainMesh = new THREE.Mesh(geo, material);
    group.add(mainMesh);

    // Glowing red eye / core (cached geometry & shared material)
    const eyeGeo = this.cachedEnemyGeometry('enemy_eye', radius * 0.28, () => new THREE.SphereGeometry(radius * 0.28, 8, 8));
    const eyeMesh = new THREE.Mesh(eyeGeo, this.sharedEnemyEyeMaterial);
    eyeMesh.position.set(0, 0, radius * 0.8);
    group.add(eyeMesh);

    const healthBar = new THREE.Group();
    const healthWidth = radius * 2;
    const healthBackground = new THREE.Mesh(
      this.cachedEnemyGeometry(`hb_bg:${healthWidth}`, healthWidth + 3, () => new THREE.PlaneGeometry(healthWidth + 3, 5)),
      this.sharedHealthBgMaterial,
    );
    const healthFill = new THREE.Mesh(
      this.cachedEnemyGeometry(`hb_fill:${healthWidth}`, healthWidth, () => new THREE.PlaneGeometry(healthWidth, 2.4)),
      this.sharedHealthFillMaterial,
    );
    healthFill.position.z = 0.2;
    healthBar.position.set(0, radius * 1.75, 0);
    healthBar.visible = false;
    healthBar.add(healthBackground, healthFill);
    (group as any)._healthBar = healthBar;
    (group as any)._healthFill = healthFill;
    group.add(healthBar);

    return group;
  }

  private cachedEnemyGeometry(type: string, radius: number, create: () => THREE.BufferGeometry) {
    const key = `${type}:${radius}`;
    let geometry = this.enemyGeometryCache.get(key);
    if (!geometry) { geometry = create(); geometry.userData.rendererEnemyShared = true; this.enemyGeometryCache.set(key, geometry); }
    return geometry;
  }

  private updateProjectiles3D(projectiles: Projectile[], deltaTime: number) {
    const activeProjIds = new Set<string>();

    for (const p of projectiles) {
      // Gameplay ids are deliberately shared by classes of projectiles (all
      // tendril segments are `tendril`, for example). Rendering needs a unique
      // instance key or the last loop iteration overwrites every earlier mesh.
      const visualKind = p.sourceWeaponId || p.id;
      // Damage-tick projectiles are represented by their persistent equipment
      // aura above; rendering them here would reintroduce the old blink.
      if (visualKind === 'void_aura' || visualKind === 'frost_aura'
        || visualKind === 'orbit_drones' || visualKind === 'orbit'
        || visualKind === 'data_scythe' || visualKind === 'scythe'
        || visualKind === 'void_tendrils' || visualKind === 'tendril'
        || visualKind === 'spectral_helix' || visualKind === 'helix'
        || visualKind === 'solar_flare' || visualKind === 'flare'
        || visualKind === 'nano_swarm' || visualKind === 'nano') continue;
      const visualId = getProjectileVisualId(p);
      activeProjIds.add(visualId);
      let mesh = this.projectileMeshes.get(visualId);

      if (!mesh) {
        if (!this.canCreateProjectileVisual(visualKind)) continue;
        mesh = this.createProjectileMesh(p);
        // Moving co-op rounds receive a compact rear tracer in their local
        // flight axis. Because the parent is yawed and pitched below, this is
        // a true 3D line of travel—not a screen-facing billboard that appears
        // horizontal when the player fires up or down.
        if (p.presentationPitch !== undefined && Math.hypot(p.velocity.x, p.velocity.y) > 20) {
          this.attachProjectileFlightTrail(mesh, p);
        }
        const evolution = getEvolutionProfile(p.evolutionId) || this.getEvolutionForVisualKind(visualKind);
        // At most two compact final-form crests per weapon are admitted in a
        // frame. This preserves an unmistakable evolution signature without
        // reintroducing the high-wave "wall of glow" failure mode.
        if (evolution) this.attachEvolutionCrest(mesh, evolution, Math.max(4, this.getCompressedVisualRadius(p)));
        mesh.userData.projectileVisualKind = visualKind;
        this.scene.add(mesh);
        this.projectileMeshes.set(visualId, mesh);
        this.projectileVisualCounts.set(visualKind, (this.projectileVisualCounts.get(visualKind) || 0) + 1);
      }

      // Real-time 3D vertical elevation and pitch tracking
      if (p.vz !== undefined && p.z !== undefined) {
        p.z += p.vz * (deltaTime / 16.666);
      }

      // Height determination based on weapon type
      let defaultHeight = 24;
      if (visualKind === 'void_aura' || visualKind === 'frost_aura' || visualKind === 'aura') {
        defaultHeight = 20;
      } else if (visualKind === 'gravity_well') {
        defaultHeight = 16;
      } else if (visualKind === 'orbit_drones' || visualKind === 'data_scythe' || visualKind === 'orbit' || visualKind === 'scythe') {
        defaultHeight = 22;
      } else if (visualKind === 'void_tendrils' || visualKind === 'tendril') {
        defaultHeight = 8;
      } else if (visualKind === 'arc_weaver' || visualKind === 'arc_web' || visualKind === 'arc_zap') {
        defaultHeight = 18;
      } else if (visualKind === 'stardust') {
        // Meteors fall from sky toward ground
        p.z = Math.max(2, (p.z ?? 140) - deltaTime * 0.25);
      }

      // Auras and player-centered abilities track the player's 3D position directly
      if (visualKind === 'void_aura' || visualKind === 'frost_aura' || visualKind === 'aura') {
        mesh.position.set(p.position.x, 20, p.position.y);
      } else {
        const projHeight = p.z !== undefined ? p.z : defaultHeight;
        mesh.position.set(p.position.x, projHeight, p.position.y);
      }

      // Animation below writes fresh values every frame. Resetting the scale
      // first lets the near-camera safety factor recover smoothly as a swarm
      // leaves the player instead of retaining a tiny spawn scale forever.
      mesh.scale.set(1, 1, 1);
      mesh.visible = true;

      // Projectiles are gameplay-sized in the 2D simulation. Ease their visual
      // size in near the muzzle so they emerge as a tracer instead of filling
      // the camera on their first frame.
      if (p.sourceWeaponId === 'plasma_gun' || p.sourceWeaponId === 'neon_shards') {
        const cameraDistance = mesh.position.distanceTo(this.camera.position);
        const nearMuzzleScale = THREE.MathUtils.smoothstep(cameraDistance, 8, 70);
        mesh.scale.setScalar(THREE.MathUtils.lerp(0.12, 1, nearMuzzleScale));
      }

      const animationTime = Date.now() * 0.001;
      if (visualKind === 'quantum_echo' || visualKind === 'echo') {
        const pulse = 0.92 + Math.sin(Date.now() * 0.012 + p.position.x * 0.03) * 0.08;
        mesh.scale.setScalar(pulse);
        mesh.position.y += Math.sin(Date.now() * 0.008 + p.position.y) * 2.4;
      } else if (visualKind === 'neural_pulse' || visualKind === 'pulse') {
        const phase = THREE.MathUtils.clamp(1 - p.duration / 300, 0, 1);
        mesh.scale.setScalar(0.35 + phase * 0.65);
        this.pulseTransparentMaterials(mesh, 0.45 + (1 - phase) * 0.4);
      } else if (visualKind === 'sonic_boom' || visualKind === 'sonic') {
        const phase = THREE.MathUtils.clamp(1 - p.duration / 500, 0, 1);
        mesh.scale.setScalar(0.5 + phase * 0.65);
        this.pulseTransparentMaterials(mesh, 0.95 - phase * 0.62);
      } else if (visualKind === 'void_aura' || visualKind === 'frost_aura' || visualKind === 'aura') {
        const phase = visualKind === 'frost_aura' ? 1 - p.duration / 800 : 1 - p.duration / 100;
        const pulse = 0.96 + Math.sin(animationTime * 5 + p.position.x * 0.01) * 0.045 + phase * 0.04;
        mesh.scale.setScalar(pulse);
        mesh.rotation.y += deltaTime * (visualKind === 'frost_aura' ? 0.00045 : -0.0007);
        this.pulseTransparentMaterials(mesh, 0.72 + Math.sin(animationTime * 4) * 0.1);
        mesh.traverse((node) => {
          if (!node.userData.auraGlyph) return;
          node.position.y = (node.userData.baseAuraY as number) + Math.sin(animationTime * 4 + node.position.x * 0.08) * 1.3;
          node.rotation.y += deltaTime * 0.0014;
        });
      } else if (visualKind === 'arc_zap') {
        const pulse = 0.72 + Math.sin(animationTime * 22 + p.position.x) * 0.22;
        mesh.scale.setScalar(pulse);
        this.pulseTransparentMaterials(mesh, 0.72 + Math.sin(animationTime * 18) * 0.2);
      } else if (visualKind === 'void_tendrils' || visualKind === 'tendril') {
        const phase = THREE.MathUtils.clamp(1 - p.duration / 580, 0, 1);
        mesh.scale.y = 0.2 + Math.min(1, phase * 2.3);
        mesh.rotation.y = Math.sin(animationTime * 8 + p.position.x * 0.02) * 0.16;
      } else if (visualKind === 'stardust') {
        mesh.scale.setScalar(0.8 + Math.sin(animationTime * 13 + p.position.y) * 0.12);
        mesh.rotation.z += deltaTime * 0.01;
        mesh.traverse((node) => {
          if (!node.userData.stardustMarker) return;
          node.position.set(
            (node.userData.targetX as number) - p.position.x,
            1 - (p.z ?? 24),
            (node.userData.targetY as number) - p.position.y,
          );
          const imminence = THREE.MathUtils.clamp(1 - (p.z ?? 140) / 140, 0, 1);
          node.scale.setScalar(0.65 + imminence * 0.7);
          const markerMat = (node as THREE.Mesh).material as THREE.MeshBasicMaterial;
          markerMat.opacity = 0.28 + imminence * 0.65;
        });
      }

      // Rotations & dynamic animations
      if (visualKind === 'gravity_well') {
        // Accretion disk spinning
        mesh.rotation.y += deltaTime * 0.006;
        this.pulseTransparentMaterials(mesh, 0.62 + Math.sin(animationTime * 6) * 0.14);
      } else if (visualKind === 'orbit_drones' || visualKind === 'orbit') {
        mesh.rotation.y += deltaTime * 0.008;
      } else if (visualKind === 'data_scythe' || visualKind === 'scythe') {
        mesh.rotation.y += deltaTime * 0.016;
        mesh.rotation.z += deltaTime * 0.006;
      } else if (visualKind === 'mirror_shards' || visualKind === 'mirror_shard' || visualKind === 'nano_swarm' || visualKind === 'nano') {
        // Co-op moving rounds already have a host-authoritative yaw/pitch.
        // Roll around their flight axis for shimmer without turning the whole
        // projectile away from the direction it was actually fired.
        if (p.presentationPitch !== undefined && p.rotation !== undefined) {
          mesh.rotation.y = -p.rotation + Math.PI / 2;
          mesh.rotation.x = -p.presentationPitch;
          mesh.rotation.z += deltaTime * 0.005;
        } else {
          mesh.rotation.y += deltaTime * 0.007;
          mesh.rotation.x += deltaTime * 0.005;
        }
        if (visualKind === 'mirror_shards' || visualKind === 'mirror_shard') {
          const flash = THREE.MathUtils.clamp((p.ricochetFlash || 0) / 150, 0, 1);
          if (flash > 0) {
            mesh.scale.multiplyScalar(1 + flash * 0.45);
            this.pulseTransparentMaterials(mesh, 1 + flash * 0.4);
          }
        }
      } else if (visualKind === 'phantom_chain' || visualKind === 'chain_bolt' || visualKind === 'arc_web') {
        // High-frequency electric jitter plus charges that race across the
        // line. The mesh itself stays static, so this costs transforms only.
        if (p.rotation !== undefined) {
          mesh.rotation.y = -p.rotation + Math.PI / 2 + (Math.random() - 0.5) * 0.05;
          if (p.presentationPitch !== undefined) mesh.rotation.x = -p.presentationPitch;
        }
        this.pulseTransparentMaterials(mesh, 0.76 + Math.sin(animationTime * 30) * 0.16);
        mesh.traverse((node) => {
          if (!node.userData.lightningCharge) return;
          const chargeLength = node.userData.chargeLength as number;
          const phase = node.userData.chargePhase as number;
          const travel = (phase + animationTime * 2.8) % 1;
          node.position.z = -chargeLength / 2 + travel * chargeLength;
          node.position.x = Math.sin(animationTime * 30 + phase * 12) * 1.4;
          node.position.y = Math.cos(animationTime * 25 + phase * 9) * 1.4;
          const chargeScale = 0.75 + Math.sin(animationTime * 36 + phase * 15) * 0.25;
          node.scale.setScalar(chargeScale);
        });
      } else if (p.rotation !== undefined) {
        mesh.rotation.y = -p.rotation + Math.PI / 2;
        if (p.presentationPitch !== undefined) {
          // Projectile assets face local +Z. Rotate pitch around local X after
          // yaw so the bolt, its core, and its rear tracer all share the exact
          // host-authoritative 3D flight vector.
          mesh.rotation.x = -p.presentationPitch;
        } else if (p.vz !== undefined) {
          mesh.rotation.x = Math.atan2(p.vz, 18);
        }
      }

      if (p.rotation !== undefined && p.presentationPitch !== undefined
        && Math.hypot(p.velocity.x, p.velocity.y) > 20) {
        this.orientProjectileAlongFlightVector(mesh, p.rotation, p.presentationPitch);
      }

      // A projectile can be perfectly valid in gameplay while spawning inside
      // the first-person camera. Fade/scale it in only after it clears a small
      // protected bubble around the lens. This fixes Nano, Mirror, Helix,
      // Sonic and other player-origin effects without moving their hitboxes.
      const cameraSafety = this.getNearCameraVisualSafety(mesh, visualKind);
      mesh.visible = cameraSafety > 0.015;
      if (mesh.visible && cameraSafety < 1) mesh.scale.multiplyScalar(cameraSafety);
    }

    // Cleanup dead projectiles
    for (const [id, mesh] of this.projectileMeshes.entries()) {
      if (!activeProjIds.has(id)) {
        this.scene.remove(mesh);
        this.disposeEffectMesh(mesh);
        this.projectileMeshes.delete(id);
        const visualKind = mesh.userData.projectileVisualKind as string | undefined;
        if (visualKind) {
          const nextCount = Math.max(0, (this.projectileVisualCounts.get(visualKind) || 1) - 1);
          if (nextCount === 0) this.projectileVisualCounts.delete(visualKind);
          else this.projectileVisualCounts.set(visualKind, nextCount);
        }
      }
    }
  }

  /**
   * Adds a deliberately narrow, physical flight trail once at projectile
   * creation. It lives in local -Z behind the core, so parent yaw/pitch drives
   * it through the same up/down vector as the gameplay projectile.
   */
  private attachProjectileFlightTrail(root: THREE.Object3D, projectile: Projectile) {
    const radius = Math.max(2.4, Math.min(10, this.getCompressedVisualRadius(projectile) * 0.28));
    const length = Math.max(18, Math.min(68, this.getCompressedVisualRadius(projectile) * 3.6));
    const color = parseHexColor(projectile.color, 0x67e8f9);
    const trail = new THREE.Group();
    trail.name = 'projectile-flight-trail';

    const glow = new THREE.Mesh(
      new THREE.CylinderGeometry(radius * 0.12, radius * 0.68, length, 8, 1, true),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    );
    glow.rotation.x = Math.PI / 2;
    glow.position.z = -length * 0.5;
    trail.add(glow);

    const core = new THREE.Mesh(
      new THREE.CylinderGeometry(radius * 0.045, radius * 0.19, length * 0.94, 6, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.72, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    );
    core.rotation.x = Math.PI / 2;
    core.position.z = -length * 0.48;
    trail.add(core);

    root.add(trail);
  }

  /** Maps the projectile asset's local +Z axis to its exact world-space
   * velocity direction in one quaternion operation. This avoids the ambiguous
   * Euler-order behaviour that could make an upward/downward multiplayer shot
   * look parallel to the city floor. */
  private orientProjectileAlongFlightVector(mesh: THREE.Object3D, yaw: number, pitch: number) {
    const horizontal = Math.cos(pitch);
    const direction = new THREE.Vector3(
      Math.cos(yaw) * horizontal,
      Math.sin(pitch),
      Math.sin(yaw) * horizontal,
    );
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), direction.normalize());
  }

  private getNearCameraVisualSafety(mesh: THREE.Object3D, visualKind: string): number {
    if (this.activeViewMode !== 'FIRST_PERSON') return 1;
    // Persistent ground/world-space abilities are already authored to be
    // readable at the player's feet. A projectile leaving the player is not.
    if (visualKind === 'void_aura' || visualKind === 'frost_aura' || visualKind === 'aura'
      || visualKind === 'gravity_well' || visualKind === 'arc_web' || visualKind === 'chain_bolt'
      || visualKind === 'phantom_chain' || visualKind === 'arc_zap') return 1;

    const distance = mesh.position.distanceTo(this.camera.position);
    const wideStart = visualKind === 'sonic' || visualKind === 'sonic_boom'
      || visualKind === 'blade' || visualKind === 'cyber_blade'
      || visualKind === 'flare' || visualKind === 'solar_flare';
    const clearStart = wideStart ? 32 : 18;
    const clearEnd = wideStart ? 105 : 78;
    return THREE.MathUtils.smoothstep(distance, clearStart, clearEnd);
  }

  /** Visual effects have a separate population budget from gameplay. High
   * waves can simulate hundreds of valid projectiles, but rendering every
   * helix bead/tendril link at once hides the enemies the player must read. */
  private canCreateProjectileVisual(visualKind: string): boolean {
    const current = this.projectileVisualCounts.get(visualKind) || 0;
    const limits: Record<string, number> = {
      void_aura: 1,
      frost_aura: 1,
      aura: 1,
      gravity_well: 2,
      neural_pulse: 2,
      pulse: 2,
      orbit_drones: 12,
      orbit: 12,
      data_scythe: 10,
      scythe: 10,
      quantum_echo: 8,
      echo: 8,
      arc_web: 18,
      chain_bolt: 18,
      phantom_chain: 18,
      arc_zap: 18,
      spectral_helix: 40,
      helix: 40,
      void_tendrils: 24,
      tendril: 24,
      nano_swarm: 28,
      nano: 28,
      mirror_shards: 24,
      mirror_shard: 24,
      stardust: 16,
      solar_flare: 22,
      flare: 22,
    };
    return current < (limits[visualKind] ?? 40);
  }

  /**
   * Area still controls hitboxes, duration and damage exactly as before. Only
   * mesh dimensions are soft-compressed, per family, to leave a legible combat
   * lane at absurd end-game upgrade values.
   */
  private getCompressedVisualRadius(p: Projectile): number {
    const visualKind = p.sourceWeaponId || p.id;
    const radius = p.radius || 6;
    switch (visualKind) {
      case 'void_aura':
      case 'frost_aura':
      case 'aura': return compressVisualRadius(radius, 105, 155);
      case 'neural_pulse':
      case 'pulse': return compressVisualRadius(radius, 115, 160);
      case 'gravity_well': return compressVisualRadius(radius, 68, 94);
      case 'cyber_blade':
      case 'blade': return compressVisualRadius(radius, 76, 112);
      case 'sonic_boom':
      case 'sonic': return compressVisualRadius(radius, 65, 96);
      case 'orbit_drones':
      case 'orbit': return compressVisualRadius(radius, 20, 30);
      case 'data_scythe':
      case 'scythe': return compressVisualRadius(radius, 24, 36);
      case 'solar_flare':
      case 'flare': return compressVisualRadius(radius, 22, 34);
      case 'void_tendrils':
      case 'tendril': return compressVisualRadius(radius, 18, 28);
      case 'stardust': return compressVisualRadius(radius, 16, 25);
      case 'spectral_helix':
      case 'helix': return compressVisualRadius(radius, 11, 18);
      case 'nano_swarm':
      case 'nano': return compressVisualRadius(radius, 10, 16);
      case 'mirror_shards':
      case 'mirror_shard': return compressVisualRadius(radius, 11, 19);
      case 'plasma_gun':
      case 'neon_shards': return compressVisualRadius(radius, 14, 22);
      case 'arc_zap': return compressVisualRadius(radius, 18, 26);
      default: return compressVisualRadius(radius, 22, 34);
    }
  }

  /** Preserve authored material opacity while giving persistent effects a
   * subtle living pulse. Materials are tagged lazily, so this works for every
   * bespoke projectile group without hard-coded child ordering. */
  private pulseTransparentMaterials(root: THREE.Object3D, multiplier: number) {
    root.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (!mesh.isMesh) return;
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of materials) {
        if (!material.transparent) continue;
        const baseOpacity = material.userData.fxBaseOpacity ?? material.opacity;
        material.userData.fxBaseOpacity = baseOpacity;
        material.opacity = THREE.MathUtils.clamp(baseOpacity * multiplier, 0, 1);
      }
    });
  }

  /** Projectile effects allocate bespoke geometry; dispose on expiry so long
   * survivor runs do not accumulate GPU buffers after instance rendering. */
  private disposeEffectMesh(root: THREE.Object3D) {
    root.traverse((node) => {
      const renderable = node as THREE.Mesh | THREE.Line;
      if (!(renderable as any).geometry || !(renderable as any).material) return;
      if (!renderable.geometry.userData.rendererEnemyShared) renderable.geometry.dispose();
      const materials = Array.isArray(renderable.material) ? renderable.material : [renderable.material];
      for (const material of materials) {
        if (!material.userData?.rendererMaterialShared) material.dispose();
      }
    });
  }

  /**
   * A premium lightning strike is built from two inexpensive tube passes,
   * lightweight branch lines and a handful of animated charge nodes. This is
   * far cheaper than per-frame geometry regeneration or bloom-heavy sprites.
   */
  private createLightningArc(p: Projectile, visualRadius: number, isWeb: boolean): THREE.Group {
    const group = new THREE.Group();
    group.userData.lightningArc = true;
    const length = Math.max(20, (p.radius || visualRadius) * 2);
    const jitter = isWeb ? 5 : 9;
    const segments = isWeb ? 6 : 8;
    const points: THREE.Vector3[] = [new THREE.Vector3(0, 0, -length / 2)];
    for (let s = 1; s < segments; s++) {
      const t = s / segments - 0.5;
      points.push(new THREE.Vector3((Math.random() - 0.5) * jitter, (Math.random() - 0.5) * jitter, t * length));
    }
    points.push(new THREE.Vector3(0, 0, length / 2));
    const curve = new THREE.CatmullRomCurve3(points);

    const aura = new THREE.Mesh(
      new THREE.TubeGeometry(curve, isWeb ? 12 : 16, isWeb ? 1.35 : 2.05, 6, false),
      new THREE.MeshBasicMaterial({ color: isWeb ? 0x30dfff : 0x00aaff, transparent: true, opacity: 0.46, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    group.add(aura);
    const core = new THREE.Mesh(
      new THREE.TubeGeometry(curve, isWeb ? 12 : 16, isWeb ? 0.42 : 0.7, 5, false),
      new THREE.MeshBasicMaterial({ color: 0xf3fdff, transparent: true, opacity: 0.98, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    group.add(core);

    // Two thin forks create the recognizable violent lightning silhouette at
    // essentially no fill-rate cost.
    const branchMat = new THREE.LineBasicMaterial({ color: isWeb ? 0x6ff6ff : 0x63c9ff, transparent: true, opacity: 0.78, blending: THREE.AdditiveBlending, depthWrite: false });
    for (const fraction of [0.29, 0.68]) {
      const start = curve.getPoint(fraction);
      const direction = new THREE.Vector3((Math.random() - 0.5) * 20, (Math.random() - 0.5) * 20, (Math.random() - 0.5) * length * 0.14);
      const mid = start.clone().addScaledVector(direction, 0.5);
      const end = start.clone().add(direction);
      const branch = new THREE.Line(new THREE.BufferGeometry().setFromPoints([start, mid, end]), branchMat.clone());
      group.add(branch);
    }

    const endpointGeo = new THREE.SphereGeometry(isWeb ? 2.4 : 3.3, 8, 8);
    const endpointMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false });
    for (const z of [-length / 2, length / 2]) {
      const endpoint = new THREE.Mesh(endpointGeo, endpointMat.clone());
      endpoint.position.z = z;
      group.add(endpoint);
    }

    // Charges travel along the local beam axis in the animation step below.
    const chargeGeo = new THREE.SphereGeometry(isWeb ? 1.45 : 1.9, 7, 7);
    for (let i = 0; i < 3; i++) {
      const charge = new THREE.Mesh(chargeGeo, new THREE.MeshBasicMaterial({ color: i === 1 ? 0xffffff : 0x9df9ff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
      charge.userData.lightningCharge = true;
      charge.userData.chargePhase = i / 3;
      charge.userData.chargeLength = length;
      group.add(charge);
    }
    return group;
  }

  /** Auras are persistent operator equipment, not short-lived projectiles.
   * This factory creates a low-profile ritual that can idle continuously and
   * only brighten when its gameplay damage pulse happens. */
  private createAuraVisual(weaponId: 'void_aura' | 'frost_aura', radius: number): THREE.Group {
    const group = new THREE.Group();
    const isFrost = weaponId === 'frost_aura';
    const auraColor = isFrost ? 0x38bdf8 : 0x8b5cf6;
    const glowMat = new THREE.MeshBasicMaterial({ color: auraColor, transparent: true, opacity: 0.72, blending: THREE.AdditiveBlending, depthWrite: false });
    const paleGlowMat = new THREE.MeshBasicMaterial({ color: isFrost ? 0xe0f7ff : 0xf1d5ff, transparent: true, opacity: 0.82, blending: THREE.AdditiveBlending, depthWrite: false });

    const field = new THREE.Mesh(
      new THREE.CircleGeometry(radius * 0.94, 40),
      new THREE.MeshBasicMaterial({ color: auraColor, transparent: true, opacity: 0.075, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
    );
    field.rotation.x = -Math.PI / 2;
    field.position.y = -17.5;
    group.add(field);

    for (const [fraction, tube, tilt] of [[1, 1.4, 0], [0.72, 0.82, 0.16], [0.42, 0.55, -0.12]] as const) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(radius * fraction, tube, 6, 40), glowMat);
      ring.rotation.set(Math.PI / 2 + tilt, 0, 0);
      ring.position.y = -16 + fraction * 2.4;
      group.add(ring);
    }

    const glyphCount = isFrost ? 12 : 9;
    const glyphGeo = isFrost
      ? new THREE.OctahedronGeometry(Math.max(2.4, radius * 0.055), 0)
      : new THREE.TetrahedronGeometry(Math.max(2.8, radius * 0.065), 0);
    for (let i = 0; i < glyphCount; i++) {
      const angle = (i / glyphCount) * Math.PI * 2;
      const glyph = new THREE.Mesh(glyphGeo, i % 3 === 0 ? paleGlowMat : glowMat);
      glyph.position.set(Math.cos(angle) * radius * 0.86, isFrost ? -7 : -10, Math.sin(angle) * radius * 0.86);
      glyph.rotation.set(0.35 + (i % 2) * 0.4, angle, 0);
      glyph.userData.auraGlyph = true;
      glyph.userData.baseAuraY = glyph.position.y;
      group.add(glyph);
    }

    if (isFrost) {
      const shardGeo = new THREE.ConeGeometry(Math.max(1.7, radius * 0.035), Math.max(7, radius * 0.16), 5);
      for (let i = 0; i < 6; i++) {
        const angle = (i / 6) * Math.PI * 2 + 0.2;
        const shard = new THREE.Mesh(shardGeo, paleGlowMat);
        shard.position.set(Math.cos(angle) * radius * 0.56, -10, Math.sin(angle) * radius * 0.56);
        shard.rotation.z = (Math.random() - 0.5) * 0.35;
        group.add(shard);
      }
    } else {
      const sigilGeo = new THREE.TorusGeometry(Math.max(3, radius * 0.075), 0.65, 5, 14);
      for (let i = 0; i < 4; i++) {
        const angle = (i / 4) * Math.PI * 2 + 0.4;
        const sigil = new THREE.Mesh(sigilGeo, paleGlowMat);
        sigil.position.set(Math.cos(angle) * radius * 0.53, 5, Math.sin(angle) * radius * 0.53);
        sigil.rotation.set(Math.PI / 2, 0, angle);
        group.add(sigil);
      }
    }

    group.userData.baseVisualRadius = radius;
    group.userData.currentAreaScale = 1;
    return group;
  }

  private getEvolutionForVisualKind(visualKind: string): EvolutionProfile | undefined {
    const aliases: Record<string, string> = {
      orbit: 'orbit_drones', scythe: 'data_scythe', blade: 'cyber_blade',
      sonic: 'sonic_boom', nano: 'nano_swarm', chain_bolt: 'phantom_chain',
      gravity_well: 'gravity_well', mirror_shard: 'mirror_shards', helix: 'spectral_helix',
      tendril: 'void_tendrils', flare: 'solar_flare', echo: 'quantum_echo',
      frost_aura: 'frost_aura', pulse: 'neural_pulse', arc_web: 'arc_weaver',
      arc_zap: 'arc_weaver', stardust: 'stardust', aura: 'void_aura',
    };
    const baseWeaponId = aliases[visualKind] || visualKind;
    return this.activeEvolutionProfiles.get(baseWeaponId);
  }

  /**
   * A profile-specific crest is a very small layer on the existing effect—not
   * a full-screen post effect. Motifs deliberately differ in silhouette, so a
   * final form communicates its mechanic even in first- and third-person.
   */
  private attachEvolutionCrest(root: THREE.Object3D, profile: EvolutionProfile, radius: number) {
    const count = this.evolutionCrestCounts.get(profile.weaponId) || 0;
    if (count >= 2) return;
    this.evolutionCrestCounts.set(profile.weaponId, count + 1);

    const crest = new THREE.Group();
    crest.userData.evolutionCrest = profile.id;
    const color = profile.color;
    const accent = profile.accent;
    const lineMaterial = (hex: number, opacity = 0.72) => new THREE.MeshBasicMaterial({
      color: hex, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const addRing = (scale: number, tilt = 0, hex = color) => {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(radius * scale, Math.max(0.32, radius * 0.045), 5, 16), lineMaterial(hex));
      ring.rotation.set(Math.PI / 2 + tilt, tilt * 0.55, 0);
      crest.add(ring);
    };
    const addCore = (scale: number, hex = accent) => crest.add(new THREE.Mesh(
      new THREE.OctahedronGeometry(radius * scale, 0), lineMaterial(hex, 0.82)
    ));

    switch (profile.motif) {
      case 'nova':
        addCore(0.24); addRing(0.52, 0.28); addRing(0.8, -0.35, accent); break;
      case 'satellite':
        addRing(0.9, 0.42); addRing(0.62, -0.42, accent);
        for (let i = 0; i < 3; i++) {
          const node = new THREE.Mesh(new THREE.SphereGeometry(radius * 0.12, 6, 5), lineMaterial(accent));
          const a = i / 3 * Math.PI * 2; node.position.set(Math.cos(a) * radius * 0.9, 0, Math.sin(a) * radius * 0.9); crest.add(node);
        }
        break;
      case 'prism': case 'kaleidoscope':
        crest.add(new THREE.Mesh(new THREE.IcosahedronGeometry(radius * 0.68, 0), new THREE.MeshBasicMaterial({ color, wireframe: true, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false })));
        addCore(0.18); break;
      case 'singularity':
        addCore(0.28, 0x05000a); addRing(0.55, 0.24); addRing(0.82, -0.3, accent); break;
      case 'synapse': case 'neural': case 'storm':
        for (let i = 0; i < 3; i++) addRing(0.42 + i * 0.2, (i - 1) * 0.36, i === 1 ? accent : color);
        break;
      case 'reaper': case 'edge':
        crest.add(new THREE.Mesh(new THREE.TorusGeometry(radius * 0.72, Math.max(0.4, radius * 0.075), 5, 18, Math.PI * 1.25), lineMaterial(color)));
        addRing(0.36, 0.45, accent); break;
      case 'sonic':
        addRing(0.38, 0); addRing(0.64, 0, accent); addRing(0.9, 0); break;
      case 'nanite':
        for (let i = 0; i < 4; i++) {
          const node = new THREE.Mesh(new THREE.TetrahedronGeometry(radius * 0.18, 0), lineMaterial(i % 2 ? accent : color));
          const a = i / 4 * Math.PI * 2; node.position.set(Math.cos(a) * radius * 0.58, (i % 2 ? 1 : -1) * radius * 0.16, Math.sin(a) * radius * 0.58); crest.add(node);
        }
        break;
      case 'genome':
        addRing(0.52, 0.6); addRing(0.52, -0.6, accent); addCore(0.16); break;
      case 'eldritch':
        for (let i = 0; i < 3; i++) {
          const spike = new THREE.Mesh(new THREE.ConeGeometry(radius * 0.16, radius * 1.15, 5), lineMaterial(i === 1 ? accent : color));
          spike.rotation.z = (i - 1) * 0.72; crest.add(spike);
        }
        break;
      case 'parallel':
        addRing(0.52, 0.2); addRing(0.7, -0.28, accent); addCore(0.16); break;
      case 'cryo':
        for (let i = 0; i < 3; i++) {
          const spoke = new THREE.Mesh(new THREE.BoxGeometry(radius * 0.08, radius * 1.35, radius * 0.08), lineMaterial(i === 1 ? accent : color));
          spoke.rotation.z = i * Math.PI / 3; crest.add(spoke);
        }
        break;
      case 'meteor':
        addCore(0.34); addRing(0.72, 0.6, accent); break;
    }
    root.add(crest);
  }

  private createProjectileMesh(p: Projectile): THREE.Object3D {
    const color = parseHexColor(p.color, 0x00f0ff);
    const radius = Math.max(3, this.getCompressedVisualRadius(p));
    const weaponId = p.sourceWeaponId || p.id;

    // PLASMA GUN — a layered, muzzle-readable bolt rather than the old shared
    // fallback. The hot core, magnetic rings and rear ion tail make its travel
    // direction obvious in both close FP and an over-the-shoulder camera.
    if (weaponId === 'plasma_gun') {
      const group = new THREE.Group();
      const outer = new THREE.Mesh(
        new THREE.CapsuleGeometry(radius * 0.38, radius * 2.5, 4, 10),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.42, blending: THREE.AdditiveBlending, depthWrite: false })
      );
      outer.rotation.x = Math.PI / 2;
      group.add(outer);
      const core = new THREE.Mesh(
        new THREE.CapsuleGeometry(radius * 0.16, radius * 2.85, 4, 8),
        new THREE.MeshBasicMaterial({ color: 0xffffff, blending: THREE.AdditiveBlending, depthWrite: false })
      );
      core.rotation.x = Math.PI / 2;
      group.add(core);
      for (const z of [-radius * 1.15, radius * 0.8]) {
        const ring = new THREE.Mesh(
          new THREE.TorusGeometry(radius * 0.48, Math.max(0.35, radius * 0.055), 6, 14),
          new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false })
        );
        ring.position.z = z;
        group.add(ring);
      }
      const exhaust = new THREE.Mesh(
        new THREE.ConeGeometry(radius * 0.5, radius * 2.4, 8, 1, true),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false })
      );
      exhaust.rotation.x = -Math.PI / 2;
      exhaust.position.z = -radius * 2.2;
      group.add(exhaust);
      return group;
    }

    // NEON SHARDS — deliberately angular prism rounds with chromatic edge
    // bands. This differentiates precision shard fire from plasma at a glance.
    if (weaponId === 'neon_shards') {
      const group = new THREE.Group();
      const shard = new THREE.Mesh(
        new THREE.OctahedronGeometry(radius * 0.95, 0),
        new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.5, metalness: 0.72, roughness: 0.14 })
      );
      shard.scale.set(0.55, 0.55, 1.9);
      shard.rotation.x = Math.PI / 2;
      group.add(shard);
      const edge = new THREE.Mesh(
        new THREE.OctahedronGeometry(radius * 1.18, 0),
        new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true, transparent: true, opacity: 0.58, blending: THREE.AdditiveBlending, depthWrite: false })
      );
      edge.scale.set(0.55, 0.55, 1.9);
      edge.rotation.x = Math.PI / 2;
      group.add(edge);
      const flare = new THREE.Mesh(
        new THREE.TorusGeometry(radius * 0.62, Math.max(0.35, radius * 0.06), 6, 14),
        new THREE.MeshBasicMaterial({ color: 0xff4dff, transparent: true, opacity: 0.72, blending: THREE.AdditiveBlending, depthWrite: false })
      );
      flare.position.z = -radius * 1.4;
      group.add(flare);
      return group;
    }

    // QUANTUM ECHO — a readable, translucent operator afterimage. This used
    // to fall into the generic plasma-bolt fallback, erasing the weapon's core
    // identity outside top-down mode.
    if (weaponId === 'quantum_echo' || weaponId === 'echo') {
      const group = new THREE.Group();
      const echoMat = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.32,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      });
      const torso = new THREE.Mesh(new THREE.CapsuleGeometry(radius * 0.42, radius * 0.85, 4, 10), echoMat);
      torso.position.y = radius * 0.68;
      group.add(torso);
      const head = new THREE.Mesh(new THREE.SphereGeometry(radius * 0.34, 10, 8), echoMat);
      head.position.y = radius * 1.55;
      group.add(head);
      const halo = new THREE.Mesh(
        new THREE.TorusGeometry(radius * 0.75, Math.max(0.7, radius * 0.06), 6, 20),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false })
      );
      halo.rotation.x = Math.PI / 2;
      halo.position.y = 0.7;
      group.add(halo);
      return group;
    }

    // 1. PHANTOM CHAIN / CHAIN LIGHTNING — articulated electric strike.
    if (weaponId === 'phantom_chain' || weaponId === 'chain_bolt') {
      return this.createLightningArc(p, radius, false);
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

    // Aura meshes are maintained continuously by `updatePersistentAuras`.
    if (weaponId === 'void_aura' || weaponId === 'frost_aura') {
      return this.createAuraVisual(weaponId, radius);
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

      // The expanding pulse is primarily a ground shockwave. A faint dome
      // remains for depth, but no longer whites out a first-person camera.
      const domeGeo = new THREE.SphereGeometry(radius, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.5);
      const domeMat = new THREE.MeshBasicMaterial({
        color: 0x00f0ff,
        transparent: true,
        opacity: 0.11,
        blending: THREE.AdditiveBlending,
        depthWrite: false
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

      const nucleus = new THREE.Mesh(
        new THREE.SphereGeometry(radius * 0.48, 10, 8),
        new THREE.MeshBasicMaterial({ color: 0xffffff, blending: THREE.AdditiveBlending, depthWrite: false })
      );
      group.add(nucleus);
      // Two counter-rotating phosphate rings sell the DNA identity even when
      // many small helix segments are on screen at the same time.
      for (const [phase, strandColor] of [[0, color], [Math.PI / 2, new THREE.Color(0xff70de)]] as const) {
        const strand = new THREE.Mesh(
          new THREE.TorusGeometry(radius * 1.08, Math.max(0.36, radius * 0.085), 6, 18),
          new THREE.MeshBasicMaterial({ color: strandColor, transparent: true, opacity: 0.82, blending: THREE.AdditiveBlending, depthWrite: false })
        );
        strand.rotation.set(phase, Math.PI / 3, 0);
        group.add(strand);
      }
      const bond = new THREE.Mesh(
        new THREE.CylinderGeometry(Math.max(0.32, radius * 0.07), Math.max(0.32, radius * 0.07), radius * 2.0, 6),
        new THREE.MeshBasicMaterial({ color: 0xe9d5ff, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false })
      );
      bond.rotation.z = Math.PI / 2;
      group.add(bond);

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
      diamond.scale.set(0.72, 0.72, 1.65);
      group.add(diamond);

      for (let i = 0; i < 2; i++) {
        const splinter = new THREE.Mesh(
          new THREE.TetrahedronGeometry(radius * 0.46, 0),
          new THREE.MeshBasicMaterial({ color: i === 0 ? 0xffffff : 0x54e8ff, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false })
        );
        splinter.position.set((i === 0 ? -1 : 1) * radius * 0.62, radius * 0.36, -radius * 0.8);
        group.add(splinter);
      }

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

      const swarmField = new THREE.Mesh(
        new THREE.IcosahedronGeometry(radius * 1.25, 1),
        new THREE.MeshBasicMaterial({ color: 0x65ffba, wireframe: true, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false })
      );
      group.add(swarmField);

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

      const corona = new THREE.Mesh(
        new THREE.OctahedronGeometry(radius * 1.25, 0),
        new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false })
      );
      group.add(corona);

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

      // Ground telegraph lives in world space through a local counter-offset
      // updated below. It makes incoming meteors readable before impact.
      if (p.visualTarget) {
        const marker = new THREE.Mesh(
          new THREE.RingGeometry(radius * 1.25, radius * 1.8, 20),
          new THREE.MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.72, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
        );
        marker.rotation.x = -Math.PI / 2;
        marker.userData.stardustMarker = true;
        marker.userData.targetX = p.visualTarget.x;
        marker.userData.targetY = p.visualTarget.y;
        group.add(marker);
      }

      return group;
    }

    // 14. ARC WEAVER — Electric Web Filaments & Zap Orbs
    if (weaponId === 'arc_web') {
      return this.createLightningArc(p, radius, true);
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

      const root = new THREE.Mesh(
        new THREE.RingGeometry(radius * 0.78, radius * 1.16, 18),
        new THREE.MeshBasicMaterial({ color: 0x9d4edd, side: THREE.DoubleSide, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false })
      );
      root.rotation.x = -Math.PI / 2;
      group.add(root);
      // Three sine-curved tube limbs read as a lashing creature, rather than a
      // static cone popping out of the floor.
      for (let limb = 0; limb < 3; limb++) {
        const offset = (limb - 1) * radius * 0.26;
        const curve = new THREE.CatmullRomCurve3([
          new THREE.Vector3(offset * 0.28, 0, 0),
          new THREE.Vector3(offset * 0.8, radius * 0.72, offset * 0.45),
          new THREE.Vector3(-offset * 0.4, radius * 1.55, -offset * 0.35),
          new THREE.Vector3(offset * 0.25, radius * 2.35, offset * 0.15),
        ]);
        const limbMesh = new THREE.Mesh(
          new THREE.TubeGeometry(curve, 12, Math.max(1.4, radius * 0.14), 7, false),
          new THREE.MeshStandardMaterial({ color: 0x37105f, emissive: 0x8b5cf6, emissiveIntensity: 1.05, metalness: 0.48, roughness: 0.28 })
        );
        group.add(limbMesh);
      }
      const tip = new THREE.Mesh(
        new THREE.SphereGeometry(Math.max(2.2, radius * 0.28), 9, 8),
        new THREE.MeshBasicMaterial({ color: 0xe9d5ff, transparent: true, opacity: 0.82, blending: THREE.AdditiveBlending, depthWrite: false })
      );
      tip.position.y = radius * 2.25;
      group.add(tip);

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
        mesh = this.createItemMesh(item);
        this.scene.add(mesh);
        this.itemMeshes.set(item.id, mesh);
      }

      const floatY = 12 + Math.sin(now * 0.005 + item.position.x) * 4;
      mesh.position.set(item.position.x, floatY, item.position.y);
      mesh.rotation.y += deltaTime * 0.004;
      mesh.rotation.z = item.type === 'magnet' ? Math.PI / 2 : Math.PI / 12;
      const pulse = 1 + Math.sin(now * 0.006 + item.position.y) * 0.08;
      mesh.scale.setScalar(pulse);
    }

    for (const [id, mesh] of this.itemMeshes.entries()) {
      if (!activeItemIds.has(id)) {
        this.scene.remove(mesh);
        this.itemMeshes.delete(id);
      }
    }
  }

  /** Keeps pickups recognisable at eye level instead of rendering every reward
   * as the same coin-sized cylinder. Geometry is intentionally compact: there
   * can be many drops in a survivor-style wave. */
  private createItemMesh(item: WorldItem): THREE.Object3D {
    let template = this.itemTemplates.get(item.type);
    if (!template) {
      template = this.createItemTemplate(item);
      this.itemTemplates.set(item.type, template);
    }
    return template.clone(true);
  }

  /** Item meshes are cloned from a small immutable template set. This keeps
   * every visual detail, but avoids allocating fresh GPU geometry/materials
   * for a large pickup burst on every wave. */
  private createItemTemplate(item: WorldItem): THREE.Object3D {
    const group = new THREE.Group();
    const color = parseHexColor(item.color, 0xffd700);
    const metal = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 1.1,
      metalness: 0.82,
      roughness: 0.22,
    });
    const glow = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.52,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const groundHalo = new THREE.Mesh(new THREE.RingGeometry(9, 14, 18), glow);
    groundHalo.rotation.x = -Math.PI / 2;
    groundHalo.position.y = -10;
    group.add(groundHalo);

    if (item.type.startsWith('coin')) {
      const coin = new THREE.Mesh(new THREE.CylinderGeometry(9, 9, 3.5, 16), metal);
      coin.rotation.x = Math.PI / 2;
      group.add(coin);
      const inset = new THREE.Mesh(new THREE.CylinderGeometry(5.8, 5.8, 3.8, 12), glow);
      inset.rotation.x = Math.PI / 2;
      group.add(inset);
      if (item.type === 'coin_diamond') {
        const diamond = new THREE.Mesh(new THREE.OctahedronGeometry(8, 0), new THREE.MeshBasicMaterial({ color: 0xe8fbff }));
        diamond.position.y = 5;
        group.add(diamond);
      }
    } else if (item.type === 'self_revive') {
      const caseMesh = new THREE.Mesh(new THREE.BoxGeometry(19, 13, 6), new THREE.MeshStandardMaterial({ color: 0x38121e, emissive: 0xfb7185, emissiveIntensity: .7, metalness: .55, roughness: .25 }));
      group.add(caseMesh);
      const barMaterial = new THREE.MeshBasicMaterial({ color: 0xffd6e0, toneMapped: false });
      const horizontal = new THREE.Mesh(new THREE.BoxGeometry(11, 3.5, 6.5), barMaterial);
      const vertical = new THREE.Mesh(new THREE.BoxGeometry(3.5, 11, 6.5), barMaterial);
      group.add(horizontal, vertical);
      const beacon = new THREE.Mesh(new THREE.TorusGeometry(12, 1.2, 6, 18), glow);
      beacon.rotation.x = Math.PI / 2;
      group.add(beacon);
    } else if (item.type === 'hp') {
      const heartShape = new THREE.Shape();
      const x = 0, y = 0;
      heartShape.moveTo(x, y + 4);
      heartShape.bezierCurveTo(x, y + 7, x - 5, y + 10, x - 9, y + 6);
      heartShape.bezierCurveTo(x - 13, y + 2, x - 11, y - 4, x, y - 10);
      heartShape.bezierCurveTo(x + 11, y - 4, x + 13, y + 2, x + 9, y + 6);
      heartShape.bezierCurveTo(x + 5, y + 10, x, y + 7, x, y + 4);

      const extrudeSettings = {
        depth: 4.5,
        bevelEnabled: true,
        bevelSegments: 3,
        steps: 1,
        bevelSize: 1.6,
        bevelThickness: 1.6,
      };
      const heartGeometry = new THREE.ExtrudeGeometry(heartShape, extrudeSettings);
      heartGeometry.center();
      const heartMaterial = new THREE.MeshStandardMaterial({
        color: 0xff1e56,
        emissive: 0xff0055,
        emissiveIntensity: 1.35,
        metalness: 0.35,
        roughness: 0.18,
      });
      const heartMesh = new THREE.Mesh(heartGeometry, heartMaterial);
      heartMesh.scale.set(0.95, 0.95, 0.95);
      group.add(heartMesh);

      const innerGlow = new THREE.Mesh(
        new THREE.SphereGeometry(4.5, 12, 10),
        new THREE.MeshBasicMaterial({
          color: 0xff6699,
          transparent: true,
          opacity: 0.65,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      group.add(innerGlow);
    } else if (item.type === 'magnet') {
      const horseshoe = new THREE.Mesh(new THREE.TorusGeometry(8, 2.6, 8, 18, Math.PI * 1.45), metal);
      horseshoe.rotation.z = Math.PI;
      group.add(horseshoe);
      for (const side of [-1, 1]) {
        const pole = new THREE.Mesh(new THREE.BoxGeometry(4.5, 6, 5), new THREE.MeshStandardMaterial({ color: side < 0 ? 0xef4444 : 0x60a5fa, emissive: side < 0 ? 0x7f1d1d : 0x1e3a8a, emissiveIntensity: 1.15 }));
        pole.position.set(side * 6.2, -7, 0);
        group.add(pole);
      }
    } else if (item.type === 'bomb') {
      const shell = new THREE.Mesh(new THREE.SphereGeometry(9, 12, 10), new THREE.MeshStandardMaterial({ color: 0x2d3748, emissive: color, emissiveIntensity: 0.35, metalness: 0.75, roughness: 0.3 }));
      group.add(shell);
      const fuse = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 9, 6), glow);
      fuse.position.set(2.5, 10, 0);
      fuse.rotation.z = -0.45;
      group.add(fuse);
      const core = new THREE.Mesh(new THREE.SphereGeometry(3.8, 8, 8), glow);
      core.position.y = 1;
      group.add(core);
    } else { // data_core
      const core = new THREE.Mesh(new THREE.OctahedronGeometry(9, 0), metal);
      core.rotation.x = Math.PI / 4;
      group.add(core);
      const cage = new THREE.Mesh(new THREE.OctahedronGeometry(13, 0), new THREE.MeshBasicMaterial({ color: 0xe0f2fe, wireframe: true, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }));
      group.add(cage);
    }

    return group;
  }

  private updateShops3D(shops: Shop[], player: { position: { x: number; y: number } }, deltaTime: number) {
    const activeShopIds = new Set<string>();
    const now = performance.now() * 0.001;

    for (const shop of shops) {
      activeShopIds.add(shop.id);
      let group = this.shopMeshes.get(shop.id);
      if (!group) {
        group = this.createShopMesh(shop);
        this.scene.add(group);
        this.shopMeshes.set(shop.id, group);
      }

      group.position.set(shop.position.x, 0, shop.position.y);
      const distance = Math.hypot(player.position.x - shop.position.x, player.position.y - shop.position.y);
      const proximity = 1 - THREE.MathUtils.smoothstep(distance, shop.radius * 0.7, shop.radius * 1.45);
      const pulse = 0.62 + Math.sin(now * 2.4 + shop.position.x * 0.01) * 0.18 + proximity * 0.45;
      const data = group.userData as {
        ring: THREE.Mesh;
        innerRing: THREE.Mesh;
        beacon: THREE.Mesh;
        hologram: THREE.Mesh;
        sign: THREE.Group;
        light: THREE.PointLight;
      };
      (data.ring.material as THREE.MeshBasicMaterial).opacity = 0.35 + pulse * 0.36;
      (data.innerRing.material as THREE.MeshBasicMaterial).opacity = 0.14 + proximity * 0.26;
      // Visible above the skyline, deliberately restrained near the terminal.
      // The station mesh itself already provides close-range interaction flair.
      (data.beacon.material as THREE.MeshBasicMaterial).opacity = 0.16 + pulse * 0.11;
      data.hologram.rotation.y += deltaTime * 0.0014;
      data.hologram.position.y = 54 + Math.sin(now * 2.2) * 3;
      data.sign.rotation.y = Math.atan2(this.camera.position.x - shop.position.x, this.camera.position.z - shop.position.y);
      data.light.intensity = 2.2 + proximity * 4.8 + Math.max(0, pulse - 0.62) * 2;
    }

    for (const [id, mesh] of this.shopMeshes.entries()) {
      if (!activeShopIds.has(id)) {
        this.scene.remove(mesh);
        this.disposeEffectMesh(mesh);
        this.shopMeshes.delete(id);
      }
    }
  }

  private createShopMesh(shop: Shop): THREE.Group {
    const group = new THREE.Group();
    group.name = `shop:${shop.id}`;
    const cyan = new THREE.Color(0x22d3ee);
    const darkMetal = new THREE.MeshStandardMaterial({ color: 0x0a1727, emissive: 0x061d2a, emissiveIntensity: 0.9, metalness: 0.9, roughness: 0.24 });
    const panelMetal = new THREE.MeshStandardMaterial({ color: 0x173047, emissive: 0x0a5065, emissiveIntensity: 0.75, metalness: 0.82, roughness: 0.2 });
    const emissive = new THREE.MeshBasicMaterial({ color: cyan, transparent: true, opacity: 0.72, blending: THREE.AdditiveBlending, depthWrite: false });
    const floorGlow = new THREE.MeshBasicMaterial({ color: cyan, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });

    const platform = new THREE.Mesh(new THREE.CylinderGeometry(shop.radius * 0.96, shop.radius, 5, 48), darkMetal);
    platform.position.y = 2.5;
    group.add(platform);
    const deck = new THREE.Mesh(new THREE.CylinderGeometry(shop.radius * 0.9, shop.radius * 0.9, 0.8, 48), floorGlow);
    deck.position.y = 5.5;
    group.add(deck);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(shop.radius, 2.2, 8, 48), emissive);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 7;
    group.add(ring);
    const innerRing = new THREE.Mesh(new THREE.TorusGeometry(shop.radius * 0.63, 1.1, 6, 40), new THREE.MeshBasicMaterial({ color: 0x67e8f9, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false }));
    innerRing.rotation.x = Math.PI / 2;
    innerRing.position.y = 7.2;
    group.add(innerRing);

    const kioskBase = new THREE.Mesh(new THREE.CylinderGeometry(28, 36, 12, 12), panelMetal);
    kioskBase.position.y = 12;
    group.add(kioskBase);
    const console = new THREE.Mesh(new RoundedBoxGeometry(42, 54, 26, 5, 3), darkMetal);
    console.position.set(0, 43, 0);
    group.add(console);
    const screen = new THREE.Mesh(new RoundedBoxGeometry(31, 25, 1.4, 3, 2), new THREE.MeshBasicMaterial({ color: 0x8df7ff, transparent: true, opacity: 0.86, blending: THREE.AdditiveBlending, depthWrite: false }));
    screen.position.set(0, 46, 13.8);
    group.add(screen);
    const scanner = new THREE.Mesh(new THREE.BoxGeometry(48, 3, 4), emissive);
    scanner.position.set(0, 23, 15);
    group.add(scanner);

    const hologram = new THREE.Mesh(new THREE.OctahedronGeometry(17, 0), new THREE.MeshBasicMaterial({ color: 0xb9fbff, transparent: true, opacity: 0.78, blending: THREE.AdditiveBlending, depthWrite: false, wireframe: true }));
    hologram.position.y = 54;
    group.add(hologram);
    const holoRing = new THREE.Mesh(new THREE.TorusGeometry(23, 1.4, 6, 28), emissive);
    holoRing.position.y = 54;
    holoRing.rotation.x = Math.PI / 2;
    hologram.add(holoRing);

    const sign = new THREE.Group();
    sign.position.set(0, 83, 0);
    const signPlate = new THREE.Mesh(new RoundedBoxGeometry(70, 22, 4, 4, 2), new THREE.MeshStandardMaterial({ color: 0x06131f, emissive: 0x073d4f, emissiveIntensity: 1.2, metalness: 0.8, roughness: 0.2 }));
    sign.add(signPlate);
    const signBar = new THREE.Mesh(new THREE.BoxGeometry(51, 2.2, 5), emissive);
    signBar.position.y = -3.5;
    sign.add(signBar);
    for (const x of [-25, 25]) {
      const marker = new THREE.Mesh(new THREE.OctahedronGeometry(4, 0), new THREE.MeshBasicMaterial({ color: 0xe0faff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending }));
      marker.position.set(x, 2, 3);
      sign.add(marker);
    }
    group.add(sign);

    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const pylon = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 5.8, 58, 8), panelMetal);
      pylon.position.set(Math.cos(angle) * 67, 34, Math.sin(angle) * 67);
      group.add(pylon);
      const cap = new THREE.Mesh(new THREE.SphereGeometry(5, 8, 8), emissive);
      cap.position.set(Math.cos(angle) * 67, 64, Math.sin(angle) * 67);
      group.add(cap);
    }

    // Buy Stations are strategic destinations in co-op. This column reaches
    // practically to the sky dome, so a player can navigate to one from any
    // district rather than hunting through the city blocks for a tiny kiosk.
    const beacon = new THREE.Mesh(new THREE.CylinderGeometry(22, 82, 10_500, 28, 1, true), new THREE.MeshBasicMaterial({ color: cyan, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    beacon.position.y = 5_250;
    group.add(beacon);
    const beaconCore = new THREE.Mesh(new THREE.CylinderGeometry(6, 13, 10_700, 18, 1, true), new THREE.MeshBasicMaterial({ color: 0xe0faff, transparent: true, opacity: 0.48, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    beaconCore.position.y = 5_350;
    group.add(beaconCore);
    const light = new THREE.PointLight(cyan, 2.4, 300, 1.7);
    light.position.y = 36;
    group.add(light);
    group.userData = { ring, innerRing, beacon, hologram, sign, light };
    return group;
  }

  private updateTreasures3D(treasures: Treasure[], deltaTime: number) {
    const activeTreasureIds = new Set<string>();
    const now = performance.now() * 0.001;

    for (const treasure of treasures) {
      activeTreasureIds.add(treasure.id);
      let group = this.treasureMeshes.get(treasure.id);

      if (!group) {
        group = this.createTreasureMesh(treasure);
        this.scene.add(group);
        this.treasureMeshes.set(treasure.id, group);
      }

      const data = group.userData as { lid: THREE.Group; core: THREE.Mesh; rings: THREE.Mesh[]; beam: THREE.Mesh; light: THREE.PointLight; bornAt: number };
      const spawn = THREE.MathUtils.smoothstep((performance.now() - data.bornAt) / 620, 0, 1);
      const bob = Math.sin(now * 2 + treasure.position.x * 0.015) * 2.5;
      const pulse = 0.76 + Math.sin(now * 4.2 + treasure.position.y * 0.012) * 0.24;
      group.position.set(treasure.position.x, 4 + bob, treasure.position.y);
      group.scale.setScalar(Math.max(0.01, spawn));
      group.rotation.y = Math.sin(now * 0.8 + treasure.position.x * 0.003) * 0.08;
      data.lid.rotation.x = -0.06 + Math.sin(now * 1.3) * 0.025;
      data.core.rotation.y += deltaTime * 0.0035;
      data.core.scale.setScalar(pulse);
      data.rings.forEach((ring, index) => {
        ring.rotation.z += deltaTime * (0.0015 + index * 0.0007);
        ring.scale.setScalar(0.9 + pulse * (0.08 + index * 0.03));
      });
      (data.beam.material as THREE.MeshBasicMaterial).opacity = 0.09 + pulse * 0.16;
      data.light.intensity = 1.5 + pulse * 2.6;
    }

    for (const [id, group] of this.treasureMeshes.entries()) {
      if (!activeTreasureIds.has(id)) {
        this.scene.remove(group);
        this.disposeEffectMesh(group);
        this.treasureMeshes.delete(id);
      }
    }
  }

  private createTreasureMesh(treasure: Treasure): THREE.Group {
    const group = new THREE.Group();
    group.name = `treasure:${treasure.id}`;
    const tier = treasure.tier;
    const colors = tier === 'legendary'
      ? { body: 0x7a2e00, trim: 0xffa21d, core: 0xff4b4b, beam: 0xff9d24 }
      : tier === 'epic'
        ? { body: 0x341253, trim: 0xb76cff, core: 0xe9d5ff, beam: 0xa855f7 }
        : { body: 0x4d3910, trim: 0xe9bb40, core: 0x67e8f9, beam: 0xffd34e };
    const body = new THREE.MeshStandardMaterial({ color: colors.body, emissive: colors.body, emissiveIntensity: 0.42, metalness: 0.78, roughness: 0.24 });
    const trim = new THREE.MeshStandardMaterial({ color: colors.trim, emissive: colors.trim, emissiveIntensity: 0.72, metalness: 0.88, roughness: 0.16 });
    const glow = new THREE.MeshBasicMaterial({ color: colors.core, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false });

    const shadow = new THREE.Mesh(new THREE.CircleGeometry(37, 24), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.34, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = -3.7;
    shadow.scale.set(1, 0.55, 1);
    group.add(shadow);
    const halo = new THREE.Mesh(new THREE.RingGeometry(30, tier === 'legendary' ? 51 : 45, 32), new THREE.MeshBasicMaterial({ color: colors.beam, transparent: true, opacity: 0.26, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    halo.rotation.x = -Math.PI / 2;
    halo.position.y = -2.9;
    group.add(halo);

    const base = new THREE.Mesh(new RoundedBoxGeometry(54, 28, 38, 5, 3), body);
    base.position.y = 14;
    group.add(base);
    const lowerTrim = new THREE.Mesh(new THREE.BoxGeometry(56, 4, 41), trim);
    lowerTrim.position.y = 6;
    group.add(lowerTrim);
    const seam = new THREE.Mesh(new THREE.BoxGeometry(57, 4.2, 42), trim);
    seam.position.y = 28;
    group.add(seam);
    const lid = new THREE.Group();
    lid.position.set(0, 30, 16);
    const lidShell = new THREE.Mesh(new RoundedBoxGeometry(54, 21, 38, 7, 4), body);
    lidShell.position.set(0, 10, -16);
    lid.add(lidShell);
    const lidTrim = new THREE.Mesh(new THREE.BoxGeometry(56, 3.6, 40), trim);
    lidTrim.position.set(0, 4, -16);
    lid.add(lidTrim);
    group.add(lid);
    for (const x of [-20, 20]) {
      const band = new THREE.Mesh(new THREE.BoxGeometry(4, 46, 42), trim);
      band.position.set(x, 24, 0);
      group.add(band);
    }
    const lockPlate = new THREE.Mesh(new RoundedBoxGeometry(16, 18, 4, 3, 2), trim);
    lockPlate.position.set(0, 27, 21);
    group.add(lockPlate);
    const core = new THREE.Mesh(new THREE.OctahedronGeometry(7.5, 0), glow);
    core.position.set(0, 28, 24);
    core.rotation.x = Math.PI / 4;
    group.add(core);
    const rings: THREE.Mesh[] = [];
    for (let i = 0; i < (tier === 'legendary' ? 3 : 2); i++) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(13 + i * 5, 0.7, 6, 20), new THREE.MeshBasicMaterial({ color: colors.core, transparent: true, opacity: 0.52 - i * 0.1, blending: THREE.AdditiveBlending, depthWrite: false }));
      ring.position.set(0, 28, 25);
      ring.rotation.x = Math.PI / 2 + i * 0.38;
      group.add(ring);
      rings.push(ring);
    }
    const beam = new THREE.Mesh(new THREE.ConeGeometry(tier === 'legendary' ? 13 : 9, tier === 'legendary' ? 360 : 260, 16, 1, true), new THREE.MeshBasicMaterial({ color: colors.beam, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    beam.position.y = tier === 'legendary' ? 180 : 130;
    group.add(beam);
    const light = new THREE.PointLight(colors.beam, 3, 230, 1.8);
    light.position.set(0, 36, 0);
    group.add(light);
    group.userData = { lid, core, rings, beam, light, bornAt: performance.now() };
    return group;
  }

  private updateExfillPortal3D(portal: { position: { x: number; y: number }; radius: number; active: boolean } | null, deltaTime: number) {
    if (!portal?.active) {
      if (this.exfillPortalMesh) {
        this.scene.remove(this.exfillPortalMesh);
        this.disposeEffectMesh(this.exfillPortalMesh);
        this.exfillPortalMesh = null;
      }
      return;
    }

    if (!this.exfillPortalMesh) {
      this.exfillPortalMesh = this.createExfillPortalMesh(portal.radius);
      this.scene.add(this.exfillPortalMesh);
    }

    const group = this.exfillPortalMesh;
    const now = performance.now() * 0.001;
    const data = group.userData as { rings: THREE.Mesh[]; beacon: THREE.Mesh; core: THREE.Mesh; light: THREE.PointLight; pylons: THREE.Mesh[] };
    const pulse = 0.8 + Math.sin(now * 3.3) * 0.2;
    group.position.set(portal.position.x, 0, portal.position.y);
    data.rings.forEach((ring, index) => {
      ring.rotation.z += deltaTime * (0.0015 + index * 0.00065) * (index % 2 === 0 ? 1 : -1);
      ring.scale.setScalar(0.94 + pulse * (0.07 + index * 0.025));
    });
    data.core.rotation.y += deltaTime * 0.004;
    data.core.scale.setScalar(pulse);
    data.pylons.forEach((pylon, index) => {
      pylon.position.y = 53 + Math.sin(now * 2.6 + index * 1.57) * 4;
    });
    (data.beacon.material as THREE.MeshBasicMaterial).opacity = 0.16 + pulse * 0.13;
    data.light.intensity = 3.5 + pulse * 4;
  }

  private createExfillPortalMesh(radius: number): THREE.Group {
    const group = new THREE.Group();
    group.name = 'exfill-portal';
    const gold = 0xfbbf24;
    const hot = 0xfff1b5;
    const metal = new THREE.MeshStandardMaterial({ color: 0x17130a, emissive: 0x3f2705, emissiveIntensity: 0.85, metalness: 0.88, roughness: 0.2 });
    const glow = new THREE.MeshBasicMaterial({ color: gold, transparent: true, opacity: 0.78, blending: THREE.AdditiveBlending, depthWrite: false });
    const platform = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 1.07, 7, 48), metal);
    platform.position.y = 3.5;
    group.add(platform);
    const deck = new THREE.Mesh(new THREE.CircleGeometry(radius * 0.9, 48), new THREE.MeshBasicMaterial({ color: 0x6f4a07, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    deck.rotation.x = -Math.PI / 2;
    deck.position.y = 7.1;
    group.add(deck);

    const rings: THREE.Mesh[] = [];
    for (let i = 0; i < 3; i++) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(31 + i * 14, 1.7 - i * 0.25, 8, 32), new THREE.MeshBasicMaterial({ color: i === 1 ? hot : gold, transparent: true, opacity: 0.65 - i * 0.12, blending: THREE.AdditiveBlending, depthWrite: false }));
      ring.position.y = 59;
      ring.rotation.x = Math.PI / 2 + i * 0.6;
      group.add(ring);
      rings.push(ring);
    }
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(15, 1), new THREE.MeshBasicMaterial({ color: hot, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
    core.position.y = 59;
    group.add(core);
    // Extraction is the final, map-scale call to action. Match the station's
    // visibility language but give it a distinct amber beam.
    const beacon = new THREE.Mesh(new THREE.CylinderGeometry(20, Math.max(80, radius), 10_500, 28, 1, true), new THREE.MeshBasicMaterial({ color: gold, transparent: true, opacity: 0.30, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    beacon.position.y = 5_250;
    group.add(beacon);
    const pylons: THREE.Mesh[] = [];
    for (let i = 0; i < 4; i++) {
      const angle = i * Math.PI / 2 + Math.PI / 4;
      const pylon = new THREE.Mesh(new THREE.CylinderGeometry(3.8, 7, 92, 8), metal);
      pylon.position.set(Math.cos(angle) * radius * 0.72, 53, Math.sin(angle) * radius * 0.72);
      group.add(pylon);
      pylons.push(pylon);
      const cap = new THREE.Mesh(new THREE.OctahedronGeometry(6, 0), glow);
      cap.position.set(Math.cos(angle) * radius * 0.72, 100, Math.sin(angle) * radius * 0.72);
      group.add(cap);
    }
    const light = new THREE.PointLight(gold, 4.5, 360, 1.7);
    light.position.y = 64;
    group.add(light);
    group.userData = { rings, beacon, core, light, pylons };
    return group;
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
    // Engine particles are append-only within their lifetime. In heavy combat,
    // retain the newest feedback (impacts, muzzle bursts) rather than the
    // oldest trail noise, which would otherwise fill the entire screen.
    const firstParticle = Math.max(0, particles.length - this.MAX_3D_PARTICLES);
    let count = Math.min(particles.length, this.MAX_3D_PARTICLES);

    for (let i = 0; i < count; i++) {
      const p = particles[firstParticle + i];
      const idx = i * 3;
      this.particlePositions[idx] = p.x;
      this.particlePositions[idx + 1] = p.z ?? (8 + Math.min(12, p.size || 2) * 0.65);
      this.particlePositions[idx + 2] = p.y;

      const c = parseHexColor(p.color, 0x00f0ff);
      this.particleColors[idx] = c.r;
      this.particleColors[idx + 1] = c.g;
      this.particleColors[idx + 2] = c.b;
      // Screenspace caps prevent large upgraded explosions from becoming a
      // white flash while still letting their color and timing read clearly.
      this.particleSizes[i] = Math.min(32, 6 + (p.size || 2) * 3.2);
      const lifeAlpha = (p.life || 0) / Math.max(1, p.maxLife || 1);
      this.particleAlphas[i] = THREE.MathUtils.clamp(lifeAlpha * 0.82, 0, 0.82);
    }

    // Zero out unused slots
    for (let i = count; i < this.MAX_3D_PARTICLES; i++) {
      const idx = i * 3;
      this.particlePositions[idx + 1] = -9999;
      this.particleSizes[i] = 0;
      this.particleAlphas[i] = 0;
    }

    this.particleGeo.attributes.position.needsUpdate = true;
    this.particleGeo.attributes.color.needsUpdate = true;
    this.particleGeo.attributes.size.needsUpdate = true;
    this.particleGeo.attributes.alpha.needsUpdate = true;
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
    for (const label of this.enemyDamageNumbers) this.disposeEnemyDamageNumber(label);
    this.enemyDamageNumbers.length = 0;
    for (const sprite of this.enemyDamageNumberPool) (sprite.material as THREE.SpriteMaterial).dispose();
    this.enemyDamageNumberPool.length = 0;
    for (const entry of this.enemyDamageNumberTextures.values()) entry.texture.dispose();
    this.enemyDamageNumberTextures.clear();
    for (const enemy of this.enemyMeshes.values()) {
      if (enemy.userData.coopRig) disposeCoopEnemyRig(enemy);
      else this.disposeEffectMesh(enemy);
    }
    this.enemyMeshes.clear();
    this.coopEnemyBatchRenderer?.dispose();
    for (const geometry of this.enemyGeometryCache.values()) geometry.dispose();
    this.enemyGeometryCache.clear();
    for (const telegraph of this.enemyAttackTelegraphs.values()) { telegraph.geometry.dispose(); (telegraph.material as THREE.Material).dispose(); }
    this.enemyAttackTelegraphs.clear();
    for (const aura of this.persistentAuraMeshes.values()) this.disposeEffectMesh(aura);
    for (const orbit of this.persistentOrbitMeshes.values()) this.disposeEffectMesh(orbit);
    for (const strike of this.tendrilStrikeMeshes.values()) this.disposeEffectMesh(strike);
    for (const helix of this.helixStrikeMeshes.values()) this.disposeEffectMesh(helix);
    for (const flare of this.solarStrikeMeshes.values()) this.disposeEffectMesh(flare);
    for (const swarm of this.nanoSwarmMeshes.values()) this.disposeEffectMesh(swarm);
    for (const treasure of this.treasureMeshes.values()) this.disposeEffectMesh(treasure);
    for (const shop of this.shopMeshes.values()) this.disposeEffectMesh(shop);
    for (const template of this.itemTemplates.values()) this.disposeEffectMesh(template);
    if (this.exfillPortalMesh) this.disposeEffectMesh(this.exfillPortalMesh);
    this.coopPremiumViewmodelRing.geometry.dispose();
    this.coopPremiumViewmodelRing.material.dispose();
    this.coopPremiumViewmodelParticles.geometry.dispose();
    this.coopPremiumViewmodelParticles.material.dispose();
    this.persistentAuraMeshes.clear();
    this.persistentOrbitMeshes.clear();
    this.tendrilStrikeMeshes.clear();
    this.helixStrikeMeshes.clear();
    this.solarStrikeMeshes.clear();
    this.nanoSwarmMeshes.clear();
    this.itemMeshes.clear();
    this.itemTemplates.clear();
    this.treasureMeshes.clear();
    this.shopMeshes.clear();
    this.exfillPortalMesh = null;
    this.speedLineMesh.geometry.dispose();
    this.speedLineMaterial.dispose();
    this.unmount();
    this.renderer.dispose();
  }
}
