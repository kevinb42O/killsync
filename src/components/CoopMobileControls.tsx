import { useRef, type PointerEvent, type ReactNode } from 'react';
import { Backpack, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Crosshair, Hammer, Map, MapPin, MessageSquare, RotateCcw, ShieldPlus, Wrench, X } from 'lucide-react';
import type { CoopStructureType } from '../game/multiplayer/CoopFieldEngineering';

export type MobileCoopAction =
  | { type: 'move'; x: number; y: number }
  | { type: 'look'; deltaX: number; deltaY: number }
  | { type: 'hold'; control: 'fire' | 'aim' | 'jump' | 'slide' | 'sprint' | 'interact'; pressed: boolean }
  | { type: 'tap'; control: 'reload' | 'previousWeapon' | 'nextWeapon' | 'toggleBuild' | 'placeBuild' | 'ping' | 'backpack' | 'map' | 'chat' | 'buildRotateLeft' | 'buildRotateRight' | 'buildActivate' | 'buildRelocate' | 'buildDismantle' }
  | { type: 'buildType'; buildType: CoopStructureType };

type Props = {
  buildMode: boolean;
  buildType: CoopStructureType;
  onAction: (action: MobileCoopAction) => void;
};

const BUILD_LABELS: Record<CoopStructureType, string> = {
  barricade: 'WALL',
  arc_fence: 'ARC',
  recovery_relay: 'HEAL',
  decoy_beacon: 'DECOY',
  bridge_segment: 'BRIDGE',
};

const BUILD_TYPES: readonly CoopStructureType[] = ['barricade', 'arc_fence', 'recovery_relay', 'decoy_beacon', 'bridge_segment'];

function clamp(value: number) { return Math.max(-1, Math.min(1, value)); }

function TapButton({ label, title, className = '', onAction, children }: { label: string; title?: string; className?: string; onAction: () => void; children?: ReactNode }) {
  return <button type="button" className={`coop-touch-button ${className}`} aria-label={title || label} onPointerDown={event => { event.preventDefault(); event.stopPropagation(); onAction(); }}>
    {children}<span>{label}</span>
  </button>;
}

function HoldButton({ label, title, className = '', control, onAction, children }: { label: string; title?: string; className?: string; control: Extract<MobileCoopAction, { type: 'hold' }>['control']; onAction: Props['onAction']; children?: ReactNode }) {
  const release = (event: PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    onAction({ type: 'hold', control, pressed: false });
  };
  return <button type="button" className={`coop-touch-button ${className}`} aria-label={title || label}
    onPointerDown={event => { event.preventDefault(); event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId); onAction({ type: 'hold', control, pressed: true }); }}
    onPointerUp={release} onPointerCancel={release} onLostPointerCapture={release}>
    {children}<span>{label}</span>
  </button>;
}

/** Mobile-only co-op HUD. It emits high-level actions; MultiplayerArena keeps
 * authority, prediction, and all input sequencing in one place. */
export function CoopMobileControls({ buildMode, buildType, onAction }: Props) {
  const joystickRef = useRef<HTMLDivElement>(null);
  const joystickPointerRef = useRef<number | null>(null);
  const lookPointerRef = useRef<number | null>(null);
  const lastLookRef = useRef<{ x: number; y: number } | null>(null);

  const moveJoystick = (event: PointerEvent<HTMLDivElement>) => {
    const element = joystickRef.current;
    if (!element || joystickPointerRef.current !== event.pointerId) return;
    const rect = element.getBoundingClientRect();
    onAction({ type: 'move', x: clamp((event.clientX - (rect.left + rect.width / 2)) / (rect.width * .32)), y: clamp((event.clientY - (rect.top + rect.height / 2)) / (rect.height * .32)) });
  };
  const releaseJoystick = (event: PointerEvent<HTMLDivElement>) => {
    if (joystickPointerRef.current !== event.pointerId) return;
    joystickPointerRef.current = null;
    onAction({ type: 'move', x: 0, y: 0 });
  };
  const moveLook = (event: PointerEvent<HTMLDivElement>) => {
    if (lookPointerRef.current !== event.pointerId || !lastLookRef.current) return;
    const deltaX = event.clientX - lastLookRef.current.x;
    const deltaY = event.clientY - lastLookRef.current.y;
    lastLookRef.current = { x: event.clientX, y: event.clientY };
    if (deltaX || deltaY) onAction({ type: 'look', deltaX, deltaY });
  };
  const releaseLook = (event: PointerEvent<HTMLDivElement>) => {
    if (lookPointerRef.current !== event.pointerId) return;
    lookPointerRef.current = null;
    lastLookRef.current = null;
  };

  return <div className="coop-mobile-controls" aria-label="Mobile co-op controls">
    <div className="coop-touch-utility coop-touch-utility--left">
      <TapButton label="PACK" title="Open backpack" onAction={() => onAction({ type: 'tap', control: 'backpack' })}><Backpack size={16} /></TapButton>
      <TapButton label="MAP" title="Open tactical map" onAction={() => onAction({ type: 'tap', control: 'map' })}><Map size={16} /></TapButton>
      <TapButton label="PING" title="Ping current target" onAction={() => onAction({ type: 'tap', control: 'ping' })}><MapPin size={16} /></TapButton>
      <TapButton label="CHAT" title="Open squad chat" onAction={() => onAction({ type: 'tap', control: 'chat' })}><MessageSquare size={16} /></TapButton>
    </div>

    <div ref={joystickRef} className="coop-touch-stick" aria-label="Move joystick"
      onPointerDown={event => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); joystickPointerRef.current = event.pointerId; moveJoystick(event); }}
      onPointerMove={moveJoystick} onPointerUp={releaseJoystick} onPointerCancel={releaseJoystick} onLostPointerCapture={releaseJoystick}>
      <i /><b>MOVE</b>
    </div>

    <div className="coop-touch-look" aria-label="Look area"
      onPointerDown={event => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); lookPointerRef.current = event.pointerId; lastLookRef.current = { x: event.clientX, y: event.clientY }; }}
      onPointerMove={moveLook} onPointerUp={releaseLook} onPointerCancel={releaseLook} onLostPointerCapture={releaseLook}>
      <span>LOOK</span>
    </div>

    <div className="coop-touch-combat">
      <HoldButton label="AIM" control="aim" onAction={onAction} className="coop-touch-button--aim"><Crosshair size={17} /></HoldButton>
      <HoldButton label="SPRINT" control="sprint" onAction={onAction}><ChevronUp size={18} /></HoldButton>
      <HoldButton label="SLIDE" control="slide" onAction={onAction}><ChevronDown size={18} /></HoldButton>
      <HoldButton label="JUMP" control="jump" onAction={onAction} className="coop-touch-button--jump"><ChevronUp size={22} /></HoldButton>
      <HoldButton label="FIRE" control="fire" onAction={onAction} className="coop-touch-button--fire"><Crosshair size={28} /></HoldButton>
      <HoldButton label="USE" control="interact" onAction={onAction} className="coop-touch-button--use"><ShieldPlus size={19} /></HoldButton>
      <TapButton label="RELOAD" onAction={() => onAction({ type: 'tap', control: 'reload' })}><RotateCcw size={16} /></TapButton>
      <TapButton label="PREV" title="Previous weapon" onAction={() => onAction({ type: 'tap', control: 'previousWeapon' })}><ChevronLeft size={19} /></TapButton>
      <TapButton label="NEXT" title="Next weapon" onAction={() => onAction({ type: 'tap', control: 'nextWeapon' })}><ChevronRight size={19} /></TapButton>
      <TapButton label="BUILD" onAction={() => onAction({ type: 'tap', control: 'toggleBuild' })} className={buildMode ? 'coop-touch-button--active' : ''}><Hammer size={17} /></TapButton>
    </div>

    {buildMode && <div className="coop-touch-build" aria-label="Build controls">
      <div className="coop-touch-build__types">{BUILD_TYPES.map(type => <button key={type} type="button" data-selected={type === buildType} onPointerDown={event => { event.preventDefault(); onAction({ type: 'buildType', buildType: type }); }}>{BUILD_LABELS[type]}</button>)}</div>
      <div className="coop-touch-build__actions">
        <TapButton label="ROT L" onAction={() => onAction({ type: 'tap', control: 'buildRotateLeft' })}><RotateCcw size={14} /></TapButton>
        <TapButton label="PLACE" onAction={() => onAction({ type: 'tap', control: 'placeBuild' })} className="coop-touch-button--place"><Hammer size={19} /></TapButton>
        <TapButton label="ROT R" onAction={() => onAction({ type: 'tap', control: 'buildRotateRight' })}><RotateCcw size={14} /></TapButton>
        <TapButton label="POWER" onAction={() => onAction({ type: 'tap', control: 'buildActivate' })}><Wrench size={14} /></TapButton>
        <TapButton label="MOVE" onAction={() => onAction({ type: 'tap', control: 'buildRelocate' })}><Crosshair size={14} /></TapButton>
        <TapButton label="SALVAGE" onAction={() => onAction({ type: 'tap', control: 'buildDismantle' })}><X size={15} /></TapButton>
      </div>
    </div>}
  </div>;
}
