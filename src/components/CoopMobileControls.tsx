import { useRef, useState, type PointerEvent, type ReactNode } from 'react';
import { Backpack, ChevronLeft, ChevronRight, Crosshair, Hammer, Map, MapPin, MessageSquare, MoreHorizontal, RotateCcw, ShieldPlus, Wrench, X } from 'lucide-react';
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

/** One low-profile movement button covers the two continuous movement actions:
 * hold for sprint and double tap for an immediate slide. Jump is intentionally
 * a tap anywhere in the free-look field, like modern touch shooters. */
function MovementGestureButton({ onAction }: { onAction: Props['onAction'] }) {
  const holdTimerRef = useRef<number | null>(null);
  const lastTapAtRef = useRef(0);
  const sprintingRef = useRef(false);
  const activePointerRef = useRef<number | null>(null);
  const finish = (event: PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    if (activePointerRef.current !== event.pointerId) return;
    activePointerRef.current = null;
    if (holdTimerRef.current !== null) { window.clearTimeout(holdTimerRef.current); holdTimerRef.current = null; }
    if (sprintingRef.current) {
      sprintingRef.current = false;
      onAction({ type: 'hold', control: 'sprint', pressed: false });
      return;
    }
    const now = performance.now();
    if (now - lastTapAtRef.current < 280) {
      lastTapAtRef.current = 0;
      onAction({ type: 'hold', control: 'slide', pressed: true });
      window.setTimeout(() => onAction({ type: 'hold', control: 'slide', pressed: false }), 180);
    } else lastTapAtRef.current = now;
  };
  return <button type="button" className="coop-touch-button coop-touch-button--motion" aria-label="Hold to sprint, double tap to slide"
    onPointerDown={event => {
      event.preventDefault(); event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId);
      activePointerRef.current = event.pointerId;
      holdTimerRef.current = window.setTimeout(() => { sprintingRef.current = true; onAction({ type: 'hold', control: 'sprint', pressed: true }); }, 180);
    }}
    onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={finish}>
    <span>MOTION</span><small>hold run · 2× slide</small>
  </button>;
}

/** Mobile-only co-op HUD. It emits high-level actions; MultiplayerArena keeps
 * authority, prediction, and all input sequencing in one place. */
export function CoopMobileControls({ buildMode, buildType, onAction }: Props) {
  const joystickRef = useRef<HTMLDivElement>(null);
  const joystickPointerRef = useRef<number | null>(null);
  const lookPointerRef = useRef<number | null>(null);
  const lastLookRef = useRef<{ x: number; y: number } | null>(null);
  const lookStartRef = useRef<{ x: number; y: number } | null>(null);
  const lookMovedRef = useRef(false);
  const [utilityOpen, setUtilityOpen] = useState(false);

  const moveJoystick = (event: PointerEvent<HTMLDivElement>) => {
    const element = joystickRef.current;
    if (!element || joystickPointerRef.current !== event.pointerId) return;
    const rect = element.getBoundingClientRect();
    const x = clamp((event.clientX - (rect.left + rect.width / 2)) / (rect.width * .32));
    const y = clamp((event.clientY - (rect.top + rect.height / 2)) / (rect.height * .32));
    // Native-looking thumb feedback makes the stick usable without looking at
    // a player's thumb, while the movement value remains normalized.
    element.style.setProperty('--stick-x', `${Math.round(x * rect.width * .22)}px`);
    element.style.setProperty('--stick-y', `${Math.round(y * rect.height * .22)}px`);
    onAction({ type: 'move', x, y });
  };
  const releaseJoystick = (event: PointerEvent<HTMLDivElement>) => {
    if (joystickPointerRef.current !== event.pointerId) return;
    joystickPointerRef.current = null;
    joystickRef.current?.style.setProperty('--stick-x', '0px');
    joystickRef.current?.style.setProperty('--stick-y', '0px');
    onAction({ type: 'move', x: 0, y: 0 });
  };
  const moveLook = (event: PointerEvent<HTMLDivElement>) => {
    if (lookPointerRef.current !== event.pointerId || !lastLookRef.current) return;
    const deltaX = event.clientX - lastLookRef.current.x;
    const deltaY = event.clientY - lastLookRef.current.y;
    lastLookRef.current = { x: event.clientX, y: event.clientY };
    if (lookStartRef.current && Math.abs(event.clientX - lookStartRef.current.x) + Math.abs(event.clientY - lookStartRef.current.y) > 8) lookMovedRef.current = true;
    if (deltaX || deltaY) onAction({ type: 'look', deltaX, deltaY });
  };
  const releaseLook = (event: PointerEvent<HTMLDivElement>, jumpOnTap: boolean) => {
    if (lookPointerRef.current !== event.pointerId) return;
    const wasTap = !lookMovedRef.current;
    lookPointerRef.current = null;
    lastLookRef.current = null;
    lookStartRef.current = null;
    lookMovedRef.current = false;
    // A motionless touch is a jump. A dragged touch is camera-only, preventing
    // accidental jumps while aiming. Each pointer is independent, so this can
    // happen while the other thumbs hold MOVE and FIRE.
    if (jumpOnTap && wasTap) {
      onAction({ type: 'hold', control: 'jump', pressed: true });
      onAction({ type: 'hold', control: 'jump', pressed: false });
    }
  };

  return <div className="coop-mobile-controls" aria-label="Mobile co-op controls">
    <div className="coop-touch-utility">
      <TapButton label="MENU" title="Open quick actions" onAction={() => setUtilityOpen(open => !open)} className={utilityOpen ? 'coop-touch-button--active' : ''}><MoreHorizontal size={21} /></TapButton>
      {utilityOpen && <div className="coop-touch-utility__tray" aria-label="Quick actions">
        <TapButton label="PACK" title="Open backpack" onAction={() => onAction({ type: 'tap', control: 'backpack' })}><Backpack size={16} /></TapButton>
        <TapButton label="MAP" title="Open tactical map" onAction={() => onAction({ type: 'tap', control: 'map' })}><Map size={16} /></TapButton>
        <TapButton label="PING" title="Ping current target" onAction={() => onAction({ type: 'tap', control: 'ping' })}><MapPin size={16} /></TapButton>
        <TapButton label="CHAT" title="Open squad chat" onAction={() => onAction({ type: 'tap', control: 'chat' })}><MessageSquare size={16} /></TapButton>
        <TapButton label="RELOAD" onAction={() => onAction({ type: 'tap', control: 'reload' })}><RotateCcw size={16} /></TapButton>
        <TapButton label="PREV" title="Previous weapon" onAction={() => onAction({ type: 'tap', control: 'previousWeapon' })}><ChevronLeft size={19} /></TapButton>
        <TapButton label="NEXT" title="Next weapon" onAction={() => onAction({ type: 'tap', control: 'nextWeapon' })}><ChevronRight size={19} /></TapButton>
        <TapButton label="BUILD" onAction={() => onAction({ type: 'tap', control: 'toggleBuild' })} className={buildMode ? 'coop-touch-button--active' : ''}><Hammer size={17} /></TapButton>
      </div>}
    </div>

    <div ref={joystickRef} className="coop-touch-stick" aria-label="Move joystick"
      onPointerDown={event => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); joystickPointerRef.current = event.pointerId; moveJoystick(event); }}
      onPointerMove={moveJoystick} onPointerUp={releaseJoystick} onPointerCancel={releaseJoystick} onLostPointerCapture={releaseJoystick}>
      <i /><b>MOVE</b>
    </div>

    <div className="coop-touch-look" aria-label="Swipe anywhere outside controls to look around"
      onPointerDown={event => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); lookPointerRef.current = event.pointerId; lookMovedRef.current = false; lookStartRef.current = { x: event.clientX, y: event.clientY }; lastLookRef.current = { x: event.clientX, y: event.clientY }; }}
      onPointerMove={moveLook} onPointerUp={event => releaseLook(event, true)} onPointerCancel={event => releaseLook(event, false)} onLostPointerCapture={event => releaseLook(event, false)}>
    </div>

    <div className="coop-touch-combat">
      <HoldButton label="AIM" control="aim" onAction={onAction} className="coop-touch-button--aim"><Crosshair size={17} /></HoldButton>
      <HoldButton label="FIRE" control="fire" onAction={onAction} className="coop-touch-button--fire"><Crosshair size={28} /></HoldButton>
      <HoldButton label="USE" control="interact" onAction={onAction} className="coop-touch-button--use"><ShieldPlus size={19} /></HoldButton>
      <MovementGestureButton onAction={onAction} />
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
