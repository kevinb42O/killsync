import React, { useEffect, useState, useRef } from 'react';

export type CinematicProfile = 'full' | 'subtle' | 'off';

export interface CinematicVignetteOverlayProps {
  /** Player health ratio between 0 (dead) and 1 (full health). */
  healthRatio?: number;
  /** Timestamp or incrementing counter whenever player takes damage. */
  lastHitTime?: number;
  /** Whether Overdrive / Frenzy mode is currently active. */
  isOverdrive?: boolean;
  /** Whether the operator is actively sprinting. */
  isSprinting?: boolean;
  /** Whether the operator is aiming down sights. */
  isAimingDownSights?: boolean;
  /** ADS progress from 0 (hipfire) to 1 (full ADS). */
  adsProgress?: number;
  /** Whether the active wave is in Nightmare / Boss encounter mode. */
  isNightmare?: boolean;
  /** Raw chromatic aberration intensity from engine impacts (0 to 50+). */
  chromaticIntensity?: number;
  /** Whether operative is downed in co-op mode. */
  isDowned?: boolean;
  /** Whether operative is currently inside toxic gas zone in co-op. */
  isInGas?: boolean;
  /** Whether player is currently spectating a teammate in co-op. */
  isSpectating?: boolean;
  /** Quality profile for player customization ('full' | 'subtle' | 'off'). */
  profile?: CinematicProfile;
  /** Optional extra CSS class names. */
  className?: string;
}

// Inlined self-contained SVG noise texture: zero network round-trip, zero layout shift, ~200 bytes.
const OFFLINE_NOISE_SVG = `data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E`;

/**
 * CinematicVignetteOverlay
 *
 * An ultra-high-performance, GPU-composited atmospheric post-processing layer.
 * Uses hardware-accelerated CSS compositor planes (transform: translateZ(0))
 * to ensure zero draw-call overhead on Three.js WebGL and preserve rock-solid 60+ FPS.
 */
export const CinematicVignetteOverlay: React.FC<CinematicVignetteOverlayProps> = ({
  healthRatio = 1,
  lastHitTime = 0,
  isOverdrive = false,
  isSprinting = false,
  isAimingDownSights = false,
  adsProgress = 0,
  isNightmare = false,
  chromaticIntensity = 0,
  isDowned = false,
  isInGas = false,
  isSpectating = false,
  profile = 'full',
  className = '',
}) => {
  const [hitFlashActive, setHitFlashActive] = useState(false);
  const prevHitTimeRef = useRef(lastHitTime);

  // Trigger brief punchy peripheral flash on hit
  useEffect(() => {
    if (lastHitTime > 0 && lastHitTime !== prevHitTimeRef.current) {
      prevHitTimeRef.current = lastHitTime;
      setHitFlashActive(true);
      const timer = setTimeout(() => {
        setHitFlashActive(false);
      }, 220);
      return () => clearTimeout(timer);
    }
  }, [lastHitTime]);

  if (profile === 'off') {
    return null;
  }

  const isSubtle = profile === 'subtle';

  // Danger thresholding: danger starts under 35% health, accelerates under 18%
  const clampedHp = Math.max(0, Math.min(1, healthRatio));
  const isLowHealth = clampedHp < 0.35 || isDowned;
  const dangerSeverity = isDowned ? 1 : Math.max(0, (0.35 - clampedHp) / 0.35); // 0 (calm) to 1 (critical)

  // Calibrate intensity by profile
  const baseVignetteOpacity = isSubtle ? 0.35 : 0.55;
  const grainOpacity = isSubtle ? 0.015 : 0.025;
  const dynamicAds = Math.max(isAimingDownSights ? 1 : 0, adsProgress);
  const adsFocusOpacity = dynamicAds * (isSubtle ? 0.38 : 0.78);

  // Dynamic lens sizing: sprint slightly tightens tunnel vision horizontally; ADS slightly deepens corners
  const ellipseX = isSprinting ? '78%' : '88%';
  const ellipseY = isSprinting ? '68%' : '76%';

  // Dynamic chromatic aberration: scale to 0-1
  const normChromatic = Math.min(1, Math.max(0, chromaticIntensity / 25));

  return (
    <div
      className={`pointer-events-none absolute inset-0 z-20 overflow-hidden select-none ${className}`}
      style={{ transform: 'translateZ(0)', willChange: 'opacity' }}
      aria-hidden="true"
    >
      {/* Layer 1: Master Optical Lens Vignette (Gentle slate/carbon corner framing) */}
      <div
        className="absolute inset-0 transition-opacity duration-500 ease-out"
        style={{
          opacity: baseVignetteOpacity,
          background: `radial-gradient(ellipse ${ellipseX} ${ellipseY} at 50% 50%, transparent 56%, rgba(3, 7, 18, 0.28) 80%, rgba(1, 3, 8, 0.82) 100%)`,
        }}
      />

      {/* Layer 2: ADS Tactical Focus Aperture (Tunnel focus when zooming down sights) */}
      <div
        className="absolute inset-0 transition-opacity duration-300 ease-out"
        style={{
          // This intentionally uses a visible cyan/emerald focus fringe. The
          // former all-black gradient was swallowed by the base vignette, so
          // ADS could be active without any readable visual confirmation.
          opacity: adsFocusOpacity,
          background: 'radial-gradient(ellipse 64% 54% at 50% 50%, transparent 38%, rgba(0, 0, 0, 0.18) 57%, rgba(0, 0, 0, 0.76) 88%, rgba(0, 0, 0, 0.94) 100%), radial-gradient(ellipse 88% 78% at 50% 50%, transparent 64%, rgba(45, 212, 191, 0.14) 84%, rgba(34, 211, 238, 0.32) 100%)',
          boxShadow: 'inset 0 0 82px 12px rgba(0, 0, 0, 0.56), inset 0 0 0 1px rgba(52, 211, 153, 0.20)',
        }}
      />

      {/* Layer 3: Sprint Kinetic Edge Compression */}
      <div
        className="absolute inset-0 transition-opacity duration-300 ease-out"
        style={{
          opacity: isSprinting && !dynamicAds ? (isSubtle ? 0.35 : 0.68) : 0,
          // Keep sprint feedback at the viewport edges. Diagonal streaks
          // crossed at screen centre and read as a distracting giant X.
          background: 'linear-gradient(90deg, rgba(2, 6, 12, 0.82) 0%, rgba(8, 145, 178, 0.18) 13%, transparent 30%), linear-gradient(270deg, rgba(2, 6, 12, 0.82) 0%, rgba(8, 145, 178, 0.18) 13%, transparent 30%)',
        }}
      />

      {/* Layer 4: Overdrive Electric Azure Halo */}
      <div
        className="absolute inset-0 transition-opacity duration-400 ease-out"
        style={{
          opacity: isOverdrive ? (isSubtle ? 0.35 : 0.65) : 0,
          background: 'radial-gradient(ellipse 90% 80% at 50% 50%, transparent 62%, rgba(6, 182, 212, 0.12) 82%, rgba(34, 211, 238, 0.28) 100%)',
        }}
      />

      {/* Layer 5: Nightmare / High Corruption Atmospheric Hue */}
      <div
        className="absolute inset-0 transition-opacity duration-700 ease-out"
        style={{
          opacity: isNightmare ? (isSubtle ? 0.28 : 0.5) : 0,
          background: 'radial-gradient(ellipse 85% 75% at 50% 50%, transparent 58%, rgba(88, 28, 135, 0.16) 82%, rgba(59, 7, 100, 0.36) 100%)',
        }}
      />

      {/* Layer 5b: Co-op Toxic Gas Storm Encroachment */}
      {isInGas && (
        <div
          className="absolute inset-0 transition-opacity duration-500 ease-out"
          style={{
            opacity: isSubtle ? 0.45 : 0.75,
            background: 'radial-gradient(ellipse 75% 65% at 50% 50%, transparent 40%, rgba(16, 185, 129, 0.22) 74%, rgba(5, 46, 22, 0.7) 100%)',
          }}
        />
      )}

      {/* Layer 5c: Co-op Spectator Tactical Recon Framing */}
      {isSpectating && (
        <div
          className="absolute inset-0 transition-opacity duration-300 pointer-events-none"
          style={{
            opacity: 0.65,
            background: 'radial-gradient(ellipse at 50% 50%, transparent 64%, rgba(15, 23, 42, 0.6) 88%, rgba(2, 6, 12, 0.92) 100%)',
          }}
        />
      )}

      {/* Layer 6: Low-Health Arterial Warning Pulse (Ruby/Crimson rhythmic heart-throb) */}
      {isLowHealth && (
        <div
          className="absolute inset-0 animate-pulse"
          style={{
            animationDuration: dangerSeverity > 0.6 ? '0.85s' : '1.4s',
            opacity: dangerSeverity * (isSubtle ? 0.45 : 0.8),
            background: isDowned
              ? 'radial-gradient(ellipse at center, transparent 48%, rgba(245, 158, 11, 0.16) 75%, rgba(220, 38, 38, 0.45) 100%)'
              : 'radial-gradient(ellipse at center, transparent 52%, rgba(225, 29, 72, 0.18) 78%, rgba(185, 28, 28, 0.5) 100%)',
          }}
        />
      )}

      {/* Layer 7: Damage Impact Shockwave (Instant peripheral red flash with cubic-bezier decay) */}
      <div
        className="absolute inset-0 transition-opacity duration-200"
        style={{
          transitionTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)',
          opacity: hitFlashActive ? (isSubtle ? 0.35 : 0.65) : 0,
          background: 'radial-gradient(ellipse 80% 70% at 50% 50%, transparent 48%, rgba(239, 68, 68, 0.32) 78%, rgba(153, 27, 27, 0.72) 100%)',
        }}
      />

      {/* Layer 8: Edge Chromatic Aberration Fringe (Explosions, Heavy Impacts) */}
      {normChromatic > 0.05 && (
        <div
          className="absolute inset-0 pointer-events-none mix-blend-screen"
          style={{
            opacity: normChromatic * (isSubtle ? 0.4 : 0.75),
            boxShadow: 'inset 0 0 60px 10px rgba(6, 182, 212, 0.35), inset 0 0 35px 5px rgba(244, 63, 94, 0.35)',
          }}
        />
      )}

      {/* Layer 9: Self-Contained Tactile Film Grain (Zero external requests, pure offline SVG) */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          opacity: grainOpacity,
          backgroundImage: `url("${OFFLINE_NOISE_SVG}")`,
          backgroundRepeat: 'repeat',
        }}
      />
    </div>
  );
};
export default CinematicVignetteOverlay;
