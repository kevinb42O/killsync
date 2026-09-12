import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { CinematicVignetteOverlay } from './CinematicVignetteOverlay';

describe('CinematicVignetteOverlay', () => {
  it('renders default optical lens vignette and embedded noise without external URLs', () => {
    const markup = renderToStaticMarkup(<CinematicVignetteOverlay />);
    expect(markup).toContain('radial-gradient');
    expect(markup).toContain('data:image/svg+xml');
    expect(markup).not.toContain('grainy-gradients.vercel.app');
  });

  it('renders low-health arterial pulse when health ratio is critical', () => {
    const healthyMarkup = renderToStaticMarkup(<CinematicVignetteOverlay healthRatio={1.0} />);
    expect(healthyMarkup).not.toContain('animate-pulse');

    const lowHpMarkup = renderToStaticMarkup(<CinematicVignetteOverlay healthRatio={0.2} />);
    expect(lowHpMarkup).toContain('animate-pulse');
    expect(lowHpMarkup).toContain('rgba(225, 29, 72');
  });

  it('activates overdrive cyan aura when isOverdrive is true', () => {
    const normalMarkup = renderToStaticMarkup(<CinematicVignetteOverlay isOverdrive={false} />);
    const overdriveMarkup = renderToStaticMarkup(<CinematicVignetteOverlay isOverdrive={true} />);
    expect(overdriveMarkup).toContain('rgba(6, 182, 212');
  });

  it('renders sprint kinetic compression when isSprinting is true', () => {
    const markup = renderToStaticMarkup(<CinematicVignetteOverlay isSprinting={true} />);
    expect(markup).toContain('linear-gradient(90deg, rgba(2, 6, 12, 0.82)');
    expect(markup).toContain('linear-gradient(270deg, rgba(2, 6, 12, 0.82)');
    expect(markup).not.toContain('linear-gradient(112deg');
  });

  it('activates the ADS focus aperture from the authoritative aiming state', () => {
    const hipMarkup = renderToStaticMarkup(<CinematicVignetteOverlay isAimingDownSights={false} adsProgress={0} />);
    const adsMarkup = renderToStaticMarkup(<CinematicVignetteOverlay isAimingDownSights adsProgress={1} />);
    expect(hipMarkup).toContain('opacity:0');
    expect(adsMarkup).toContain('opacity:0.78');
    expect(adsMarkup).toContain('rgba(45, 212, 191, 0.14)');
    expect(adsMarkup).toContain('inset 0 0 82px');
  });

  it('renders chromatic aberration fringe when chromaticIntensity is elevated', () => {
    const zeroMarkup = renderToStaticMarkup(<CinematicVignetteOverlay chromaticIntensity={0} />);
    expect(zeroMarkup).not.toContain('mix-blend-screen');

    const explosionMarkup = renderToStaticMarkup(<CinematicVignetteOverlay chromaticIntensity={25} />);
    expect(explosionMarkup).toContain('mix-blend-screen');
    expect(explosionMarkup).toContain('box-shadow');
  });

  it('renders nothing when profile is off', () => {
    const markup = renderToStaticMarkup(<CinematicVignetteOverlay profile="off" />);
    expect(markup).toBe('');
  });

  it('renders toxic emerald atmospheric haze when operative is in gas zone in co-op', () => {
    const outsideGas = renderToStaticMarkup(<CinematicVignetteOverlay isInGas={false} />);
    expect(outsideGas).not.toContain('rgba(16, 185, 129');

    const inGas = renderToStaticMarkup(<CinematicVignetteOverlay isInGas={true} />);
    expect(inGas).toContain('rgba(16, 185, 129');
  });

  it('renders spectator tactical recon framing when spectating a teammate in co-op', () => {
    const normal = renderToStaticMarkup(<CinematicVignetteOverlay isSpectating={false} />);
    expect(normal).not.toContain('rgba(15, 23, 42, 0.6)');

    const spectating = renderToStaticMarkup(<CinematicVignetteOverlay isSpectating={true} />);
    expect(spectating).toContain('rgba(15, 23, 42, 0.6)');
  });
});
