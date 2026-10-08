import type { ConstructionState } from '../game/multiplayer/FriendsConstructionControls';
import { useEffect, useRef, useState } from 'react';
import { Hammer, Library, Search, RotateCcw, RotateCw, Undo2, Redo2, X, Paintbrush, Copy, Move, Pin, TrainFront, Download, Upload, ArrowRight, SlidersHorizontal } from 'lucide-react';
import { FRIENDS_BUILD_CATALOG, FRIENDS_FINISHES, FRIENDS_BUILD_LIMIT, isFriendsShape, type FriendsBuildShape, type FriendsBuildFinish, type FriendsBuildingSnapshot } from '../game/multiplayer/FriendsBuilding';
import { BUILD_CATEGORIES, BuildWheelGesture, buildCategory, buildDimensions, cycleBuildToolbar, filterBuildLibrary, type BuildCategory } from '../game/multiplayer/FriendsBuildControls';
import { FriendsToolWheel } from '../game/multiplayer/FriendsToolControls';
import { buildCost, MATERIAL_NAMES, type FrontierRequest, type Materials, type Resource } from '../game/multiplayer/FriendsFrontier';
import { PLAYER_TRAIN_COST, isPlayerRail } from '../game/world/FriendsPlayerRail';
import type { FriendsSnapshot } from '../game/multiplayer/FriendsExpedition';
import { FriendsPieceIcon } from './FriendsPieceIcon';
import './friends-building.css';

const finishGroups: { label: string; finishes: FriendsBuildFinish[] }[] = [
  { label: 'From the world', finishes: ['grass', 'soil', 'stone', 'copper', 'iron'] },
  { label: 'Crafted finishes', finishes: ['timber', 'teal', 'plaster', 'rose'] },
];
const materialTexture = (finish: FriendsBuildFinish) => ['grass', 'soil'].includes(finish) ? 'Ground037' : ['stone', 'copper', 'iron'].includes(finish) ? 'Rock030' : finish === 'timber' ? 'WoodFloor051' : undefined;

const BUILD_DRAG_TYPE = 'application/x-sunline-build-piece';

export function FriendsBuildPalette({ construction, shape, finish, toolbar, rotation, building, friends, materials, freeBuild, expanded, visible = true, message, placementHint, saveStatus, host, moving, onActivity, onShape, onFinish, onAssign, onExpand, onAction, onTrainAction, onExport, onImport }: {
  construction?: ConstructionState;
  shape: FriendsBuildShape; finish: FriendsBuildFinish; toolbar: FriendsBuildShape[]; rotation: number;
  building?: FriendsBuildingSnapshot; friends?: FriendsSnapshot; materials?: Partial<Materials>; freeBuild?: boolean; expanded: boolean;
  visible?: boolean; onActivity?: () => void;
  message: string | null; placementHint: string | null; saveStatus: string; host: boolean; moving: boolean;
  onShape: (shape: FriendsBuildShape) => void; onFinish: (finish: FriendsBuildFinish) => void;
  onAssign: (slot: number, shape: FriendsBuildShape) => void; onExpand: (open: boolean) => void;
  onAction: (action: string) => void; onTrainAction: (action: FrontierRequest['action']) => void;
  onExport: () => void; onImport: () => void;
}) {
  const [category, setCategory] = useState<BuildCategory>(() => buildCategory(shape));
  const [query, setQuery] = useState('');
  const [trainSelected, setTrainSelected] = useState(false);
  const [assignSlot, setAssignSlot] = useState(0);
  const [controlsOpen, setControlsOpen] = useState(false);
  const [dropSlot, setDropSlot] = useState<number | null>(null);
  const slotWheel = useRef(new FriendsToolWheel());
  const rotationWheel = useRef(new BuildWheelGesture());
  const slots = useRef<HTMLDivElement>(null);
  const detail = useRef<HTMLElement>(null), dialog = useRef<HTMLElement>(null), search = useRef<HTMLInputElement>(null);
  const selected = FRIENDS_BUILD_CATALOG[shape], rails = isPlayerRail(shape);
  const permitted = host || building?.guestsCanBuild !== false;
  const pieces = filterBuildLibrary(category, query, toolbar);
  const showTrain = (category === 'railway' && !query.trim()) || /train|locomotive|railway/i.test(query);
  const train = friends?.vehicles.find(v => v.kind === 'train');
  const testing=freeBuild===true || friends?.frontier?.testing===true;
  const cost = testing ? {} : trainSelected ? PLAYER_TRAIN_COST : buildCost(shape, finish);
  const heading = trainSelected ? 'Train' : selected.name;

  useEffect(() => {
    if (!expanded) return;
    setCategory(buildCategory(shape)); setQuery(''); setTrainSelected(false);
    const previous = document.activeElement as HTMLElement | null;
    search.current?.focus();
    return () => { if (previous?.isConnected) previous.focus(); };
  }, [expanded]);

  useEffect(() => { if (detail.current) detail.current.scrollTop = 0; }, [shape, trainSelected]);
  useEffect(() => {
    if (!visible || expanded) setControlsOpen(false);
    if (!expanded) setTrainSelected(false);
  }, [visible, expanded]);
  useEffect(() => {
    slots.current?.querySelector<HTMLElement>('[aria-pressed="true"]')?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }, [shape, expanded]);

  const choose = (next: FriendsBuildShape) => { setTrainSelected(false); onShape(next); };
  const toolbarView = <div ref={slots} className="build-toolbar" aria-label="Construction toolbar" onWheel={e => {
    e.stopPropagation();
    if (expanded) return;
    if (e.shiftKey) {
      const step = rotationWheel.current.push(e, performance.now());
      if (step) { onActivity?.(); onAction(step > 0 ? 'rotate_right' : 'rotate_left'); }
      return;
    }
    const step = slotWheel.current.push(e, performance.now());
    if (step) { onActivity?.(); choose(cycleBuildToolbar(toolbar, shape, step)); }
  }}>
    {toolbar.map((s, i) => <button type="button" key={`${i}-${s}`} draggable data-drop-target={dropSlot === i || undefined} aria-label={`Slot ${i + 1}: ${FRIENDS_BUILD_CATALOG[s].name}`} aria-pressed={shape === s && !trainSelected} onClick={() => choose(s)} title={`${i + 1} · ${FRIENDS_BUILD_CATALOG[s].name} · Scroll to select · Shift scroll to rotate · Drag to reorder; right-click to replace`}
      onContextMenu={e => { e.preventDefault(); setAssignSlot(i); onExpand(true); }}
      onDragStart={e => { e.dataTransfer.setData(BUILD_DRAG_TYPE, s); e.dataTransfer.effectAllowed = 'move'; onActivity?.(); }}
      onDragEnd={() => setDropSlot(null)}
      onDragOver={e => { if (e.dataTransfer.types.includes(BUILD_DRAG_TYPE)) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDropSlot(i); onActivity?.(); } }}
      onDragLeave={() => setDropSlot(null)}
      onDrop={e => { e.preventDefault(); setDropSlot(null); const next = e.dataTransfer.getData(BUILD_DRAG_TYPE); if (isFriendsShape(next)) onAssign(i, next); }}>
      <kbd>{i + 1}</kbd><FriendsPieceIcon shape={s} finish={finish} /><span>{FRIENDS_BUILD_CATALOG[s].name}</span>
    </button>)}
  </div>;
  const controls = <div className="build-controls" aria-label="Edit tools">
    <button type="button" onClick={() => onAction('rotate_left')} title="Rotate left · Shift R" aria-label="Rotate left"><RotateCcw size={15} /></button>
    <span className="build-controls__angle" aria-label={`Rotation ${rotation} degrees`}>{rotation}°</span>
    <button type="button" onClick={() => onAction('rotate_right')} title="Rotate right · R" aria-label="Rotate right"><RotateCw size={15} /></button>
    <i />
    <button type="button" onClick={() => onAction('paint')} title="Paint aimed piece · E" aria-label="Paint aimed piece"><Paintbrush size={15} /></button>
    <button type="button" onClick={() => onAction('copy')} title="Copy aimed piece · I" aria-label="Copy aimed piece"><Copy size={15} /></button>
    <button type="button" onClick={() => onAction('move')} title="Move aimed piece · C" aria-label="Move aimed piece" aria-pressed={moving}><Move size={15} /></button>
    <button type="button" onClick={() => onAction('remove')} title="Remove aimed piece · X" aria-label="Remove aimed piece"><X size={15} /></button>
    <i /><button type="button" onClick={() => onAction('undo')} title="Undo · Ctrl/Cmd Z" aria-label="Undo"><Undo2 size={15} /></button>
    <button type="button" onClick={() => onAction('redo')} title="Redo · Ctrl/Cmd Shift Z" aria-label="Redo"><Redo2 size={15} /></button>
  </div>;

  const gestures = <div className="build-flow-controls" aria-label="Construction gestures">
    {(['single','line','rectangle'] as const).map(mode=><button key={mode} type="button" aria-pressed={(construction?.mode||'single')===mode} disabled={rails||moving} onClick={()=>onAction('mode_'+mode)}>{mode==='single'?'Single':mode==='line'?'Line':'Rectangle'}</button>)}
    <button type="button" aria-pressed={construction?.locked||false} onClick={()=>onAction('lock_plane')} title="Lock the placement plane · P">{construction?.locked?'Unlock plane':'Lock plane'}</button>
    {construction?.anchored&&<button type="button" onClick={()=>onAction('cancel_gesture')}>Cancel selection</button>}
    <details><summary>Adjust position</summary><div>{[['0_-1','←'],['0_1','→'],['1_-1','Forward'],['1_1','Back'],['2_1','↑'],['2_-1','↓']].map(([action,label])=><button key={action} type="button" onClick={()=>onAction('nudge_'+action)}>{label}</button>)}<button type="button" onClick={()=>onAction('reset_offset')}>Reset</button></div></details>
  </div>;

  if (!expanded) return <div className="build-system" onPointerDown={e => e.stopPropagation()} onMouseDown={e => e.stopPropagation()} onWheel={e => e.stopPropagation()}>
    <section className="build-quickbar" aria-label="Construction quick bar" data-visible={visible} aria-hidden={!visible} inert={!visible}
      onPointerEnter={() => onActivity?.()} onPointerDown={() => onActivity?.()} onFocusCapture={() => onActivity?.()} onKeyDown={e => {
        if (e.key === 'Escape' && controlsOpen) { e.preventDefault(); e.stopPropagation(); setControlsOpen(false); }
      }}>
      {controlsOpen && <div id="build-quickbar-controls" className="build-quickbar__controls" aria-label="Construction controls">{controls}{gestures}</div>}
      <div className="build-quickbar__row">
        {toolbarView}
        <div className="build-quickbar__actions">
          <button type="button" className="build-icon-button build-quickbar__finish" onClick={() => onExpand(true)} aria-label={`Construction material: ${FRIENDS_FINISHES[finish].name}`} title={`Material: ${FRIENDS_FINISHES[finish].name}`}><i style={{ background: FRIENDS_FINISHES[finish].color }} /></button>
          <button type="button" className="build-icon-button" aria-label="Construction controls" aria-expanded={controlsOpen} aria-controls="build-quickbar-controls" title="Construction controls" onClick={() => setControlsOpen(!controlsOpen)}><SlidersHorizontal size={17} /></button>
          <button type="button" className="build-icon-button" onClick={() => onExpand(true)} aria-label="Open construction library" title="Build library · Tab · Drag pieces into slots"><Library size={19} /></button>
        </div>
      </div>
    </section>
    {visible && (!permitted || message || placementHint && !placementHint.startsWith('Ready')) && <div className="build-quickbar-feedback" data-controls-open={controlsOpen} role="status">{!permitted ? 'Host-only building' : message || placementHint}</div>}
  </div>;

  return <div className="build-system build-system--library" onPointerDown={e => e.stopPropagation()} onMouseDown={e => e.stopPropagation()} onWheel={e => e.stopPropagation()}>
    <button className="build-library-backdrop" type="button" tabIndex={-1} aria-label="Return to building" onClick={() => onExpand(false)} />
    <section ref={dialog} className="build-library" aria-label="Construction library" role="dialog" aria-modal="true"
      onKeyDown={e => {
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onExpand(false); }
        if (e.key === 'Tab') {
          const nodes = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input, select, [tabindex="0"]') || []) as HTMLElement[];
          const first = nodes[0], last = nodes.at(-1);
          if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
          else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
        }
      }}>
      <header className="build-system__header">
        <div><span className="build-eyebrow"><Hammer size={13} /> SUNLINE CONSTRUCTION</span><h2>Build something worth finding.</h2></div>
        <div className="build-system__meta"><span>{building?.pieces.length || 0} / {FRIENDS_BUILD_LIMIT} pieces</span><small>{saveStatus}</small></div>
        <button type="button" className="build-icon-button" onClick={() => onExpand(false)} aria-label="Close construction library"><X size={19} /></button>
      </header>
        <div className="build-library__body">
          <aside className="build-library__categories"><span className="build-section-label">PIECE LIBRARY</span>{BUILD_CATEGORIES.map(c => <button key={c.id} type="button" aria-pressed={category === c.id && !query} onClick={() => { setCategory(c.id); setQuery(''); setTrainSelected(false); }}><strong>{c.label}</strong><small>{c.hint}</small>{c.id === 'railway' && <TrainFront size={17} />}</button>)}
            <div className="build-library__grid-note"><span>32</span><p>One block.<br />The same grid as your world.</p></div>
            {host && <div className="build-world-actions"><button type="button" onClick={onExport}><Download size={14} /> Back up world</button><button type="button" onClick={onImport}><Upload size={14} /> Restore backup</button></div>}
          </aside>
          <main className="build-library__browse">
            <label className="build-search"><Search size={17} /><input ref={search} value={query} onChange={e => setQuery(e.target.value)} placeholder="Search blocks, roofs, tracks…" aria-label="Search construction pieces" autoComplete="off" />{query && <button type="button" onClick={() => setQuery('')} aria-label="Clear piece search"><X size={14} /></button>}</label>
            <div className="build-library__heading"><h3>{query ? 'Search results' : BUILD_CATEGORIES.find(c => c.id === category)?.label}</h3><span>{pieces.length + Number(showTrain)} {pieces.length + Number(showTrain) === 1 ? 'piece' : 'pieces'}</span></div>
            <div className="build-piece-grid">{pieces.map(s => <button type="button" className="build-piece-card" key={s} draggable onDragStart={e => { e.dataTransfer.setData(BUILD_DRAG_TYPE, s); e.dataTransfer.effectAllowed = 'copyMove'; }} onDragEnd={() => setDropSlot(null)} aria-pressed={shape === s && !trainSelected} onClick={() => choose(s)}>
              {toolbar.includes(s) && <span className="build-piece-card__pin"><Pin size={11} /> {toolbar.indexOf(s) + 1}</span>}
              <FriendsPieceIcon shape={s} finish={finish} /><strong>{FRIENDS_BUILD_CATALOG[s].name}</strong><small>{buildDimensions(s)}</small>
            </button>)}{showTrain && <button type="button" className="build-piece-card build-piece-card--train" aria-pressed={trainSelected} onClick={() => setTrainSelected(true)}><TrainFront size={64} strokeWidth={1} /><strong>Train</strong><small>{train ? 'Your railway is running' : 'Assemble on your tracks'}</small></button>}</div>
            {!pieces.length && !showTrain && <div className="build-empty"><Search size={28} /><strong>No matching pieces</strong><p>Try “block”, “window” or “train”.</p><button type="button" onClick={() => setQuery('')}>Clear search</button></div>}
            {category === 'railway' && !query && <div className="build-railway-guide"><TrainFront size={21} /><div><strong>Your railway, from the first sleeper.</strong><p>Lay tracks on level ground or a supported bridge. Matching ends snap together. Add a train, then board it to travel.</p></div></div>}
          </main>
          <aside ref={detail} className="build-piece-detail" aria-label="Selected construction piece">
            <div className="build-piece-detail__preview">{trainSelected ? <TrainFront size={100} strokeWidth={1} /> : <FriendsPieceIcon shape={shape} finish={finish} large />}</div>
            <span className="build-section-label">{trainSelected || rails ? 'RAILWAY' : 'SELECTED PIECE'}</span><h3>{heading}</h3><p>{trainSelected ? 'A locomotive and carriages for the railway you build. Cargo stays with your expedition.' : selected.description}</p>
            {!trainSelected && <div className="build-detail-metrics"><span>Footprint<b>{selected.w / 32} × {selected.d / 32} blocks</b></span><span>Height<b>{selected.h / 32} blocks</b></span></div>}
            <div className="build-material-cost"><span className="build-section-label">{testing ? 'FREE DURING TESTING' : trainSelected ? 'ASSEMBLY MATERIALS' : 'COST PER PIECE'}</span>{freeBuild ? <p className="build-free-materials">Materials supplied in this world.</p> : Object.entries(cost).map(([r, n]) => <div key={r}><span>{MATERIAL_NAMES[r as Resource]}</span><b>{n}</b>{!trainSelected && <small className={(materials?.[r as Resource] || 0) >= n ? '' : 'build-cost--missing'}>{materials?.[r as Resource] || 0} in pack</small>}</div>)}</div>
            {trainSelected ? <div className="build-train-actions"><button type="button" className="build-primary-button" disabled={!permitted || Boolean(train)} onClick={() => onTrainAction('train_place')}><TrainFront size={16} />{train ? 'Train already assembled' : 'Assemble train on track'}</button>{train && <><button type="button" disabled={!permitted} onClick={() => onTrainAction('train_depart')}>Depart / resume</button><button type="button" disabled={!permitted} onClick={() => onTrainAction('train_hold')}>Hold for loading</button><button type="button" disabled={!permitted} onClick={() => onTrainAction('train_remove')}>Dismantle train</button></>}<small>Stand beside your track or train to operate it.</small></div>
              : <div className="build-slot-assignment"><label htmlFor="build-slot">Keep in your toolbar · or drag to a slot</label><div><select id="build-slot" value={assignSlot} onChange={e => setAssignSlot(Number(e.target.value))}>{toolbar.map((s, i) => <option key={i} value={i}>Slot {i + 1} · {FRIENDS_BUILD_CATALOG[s].name}</option>)}</select><button type="button" onClick={() => onAssign(assignSlot, shape)} aria-label={`Assign ${selected.name} to slot ${assignSlot + 1}`}><Pin size={16} /></button></div><button type="button" className="build-primary-button" onClick={() => onExpand(false)}>Build with this piece <ArrowRight size={16} /></button></div>}
          </aside>
        </div>
        <section className={`build-materials ${rails || trainSelected ? 'build-materials--rail' : ''}`} aria-label="Construction materials">{rails || trainSelected ? <><span className="build-section-label">RAILWAY MATERIALS</span><p>Steel rails and timber sleepers have a fixed finish.</p></> : finishGroups.map(group => <div key={group.label}><span className="build-section-label">{group.label}</span><div className="build-materials__row">{group.finishes.map(f => <button type="button" key={f} aria-pressed={f === finish} onClick={() => onFinish(f)}><i style={{ backgroundColor: FRIENDS_FINISHES[f].color, backgroundImage: materialTexture(f) ? `linear-gradient(${FRIENDS_FINISHES[f].color}66,${FRIENDS_FINISHES[f].color}66),url(${import.meta.env.BASE_URL}textures/frontier/${materialTexture(f)}_1K-JPG_Color.jpg)` : undefined }} /><span>{FRIENDS_FINISHES[f].name}</span></button>)}</div></div>)}</section>
        <div className="build-library__toolbar"><span className="build-section-label">YOUR TOOLBAR <small>1–8 / scroll to select · Drag to arrange</small></span>{toolbarView}</div>
        <footer className="build-library__footer"><div role="status">{message || (moving ? 'Select a destination, then place your moved piece.' : 'Choose a piece and material. Close the library to place it.')}</div>{host && <label><input type="checkbox" checked={building?.guestsCanBuild !== false} onChange={() => onAction('permissions')} /> Friends can build</label>}<button type="button" className="build-primary-button" onClick={() => onExpand(false)}>Return to building <ArrowRight size={16} /></button></footer>
    </section>
  </div>;
}
