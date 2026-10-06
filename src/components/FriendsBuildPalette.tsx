import { useEffect, useRef, useState } from 'react';
import { Hammer, Library, Search, RotateCcw, RotateCw, Undo2, Redo2, X, Paintbrush, Copy, Move, Pin, TrainFront, Download, Upload, ArrowRight, ChevronDown } from 'lucide-react';
import { FRIENDS_BUILD_CATALOG, FRIENDS_FINISHES, FRIENDS_BUILD_LIMIT, type FriendsBuildShape, type FriendsBuildFinish, type FriendsBuildingSnapshot } from '../game/multiplayer/FriendsBuilding';
import { BUILD_CATEGORIES, buildCategory, buildDimensions, filterBuildLibrary, type BuildCategory } from '../game/multiplayer/FriendsBuildControls';
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

export function FriendsBuildPalette({ shape, finish, toolbar, rotation, building, friends, materials, freeBuild, expanded, message, placementHint, saveStatus, host, moving, onShape, onFinish, onAssign, onExpand, onAction, onTrainAction, onExport, onImport }: {
  shape: FriendsBuildShape; finish: FriendsBuildFinish; toolbar: FriendsBuildShape[]; rotation: number;
  building?: FriendsBuildingSnapshot; friends?: FriendsSnapshot; materials?: Partial<Materials>; freeBuild?: boolean; expanded: boolean;
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

  const choose = (next: FriendsBuildShape) => { setTrainSelected(false); onShape(next); };
  const toolbarView = <div className="build-toolbar" aria-label="Construction toolbar">
    {toolbar.map((s, i) => <button type="button" key={`${i}-${s}`} aria-label={`Slot ${i + 1}: ${FRIENDS_BUILD_CATALOG[s].name}`} aria-pressed={shape === s && !trainSelected} onClick={() => choose(s)} title={`${i + 1} · ${FRIENDS_BUILD_CATALOG[s].name}`}>
      <kbd>{i + 1}</kbd><FriendsPieceIcon shape={s} finish={finish} /><span>{FRIENDS_BUILD_CATALOG[s].name}</span>
    </button>)}
  </div>;
  const controls = <div className="build-controls" aria-label="Edit tools">
    <button type="button" onClick={() => onAction('rotate_left')} title="Rotate left · Shift R" aria-label="Rotate left"><RotateCcw size={15} /></button>
    <span className="build-controls__angle" aria-label={`Rotation ${rotation} degrees`}>{rotation}°</span>
    <button type="button" onClick={() => onAction('rotate_right')} title="Rotate right · R" aria-label="Rotate right"><RotateCw size={15} /></button>
    <i />
    <button type="button" onClick={() => onAction('paint')} title="Paint aimed piece · E"><Paintbrush size={15} /><span>Paint</span></button>
    <button type="button" onClick={() => onAction('copy')} title="Copy aimed piece · I"><Copy size={15} /><span>Copy</span></button>
    <button type="button" onClick={() => onAction('move')} title="Move aimed piece · C" aria-pressed={moving}><Move size={15} /><span>Move</span></button>
    <button type="button" onClick={() => onAction('remove')} title="Remove aimed piece · X" aria-label="Remove aimed piece"><X size={15} /></button>
    <i /><button type="button" onClick={() => onAction('undo')} title="Undo · Ctrl/Cmd Z" aria-label="Undo"><Undo2 size={15} /></button>
    <button type="button" onClick={() => onAction('redo')} title="Redo · Ctrl/Cmd Shift Z" aria-label="Redo"><Redo2 size={15} /></button>
  </div>;

  return <div className={`build-system ${expanded ? 'build-system--library' : ''}`} onPointerDown={e => e.stopPropagation()} onMouseDown={e => e.stopPropagation()} onWheel={e => e.stopPropagation()}>
    {expanded && <button className="build-library-backdrop" type="button" tabIndex={-1} aria-label="Return to building" onClick={() => onExpand(false)} />}
    <section ref={dialog} className={expanded ? 'build-library' : 'build-dock'} aria-label={expanded ? 'Construction library' : 'Construction controls'} role={expanded ? 'dialog' : undefined} aria-modal={expanded || undefined}
      onKeyDown={e => {
        if (!expanded) return;
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onExpand(false); }
        if (e.key === 'Tab') {
          const nodes = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input, select, [tabindex="0"]') || []) as HTMLElement[];
          const first = nodes[0], last = nodes.at(-1);
          if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
          else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
        }
      }}>
      <header className="build-system__header">
        <div><span className="build-eyebrow"><Hammer size={13} /> SUNLINE CONSTRUCTION</span><h2>{expanded ? 'Build something worth finding.' : moving ? 'Move your piece' : selected.name}</h2></div>
        <div className="build-system__meta"><span>{building?.pieces.length || 0} / {FRIENDS_BUILD_LIMIT} pieces</span><small>{saveStatus}</small></div>
        <button type="button" className="build-icon-button" onClick={() => onExpand(!expanded)} aria-label={expanded ? 'Close construction library' : 'Open construction library'}>{expanded ? <X size={19} /> : <Library size={19} />}</button>
      </header>
      {!expanded ? <>
        {toolbarView}
        <div className="build-dock__actions">{controls}<button type="button" className="build-library-toggle" onClick={() => onExpand(true)}><Library size={15} /> Library <kbd>Tab</kbd></button></div>
        <div className="build-dock__finish"><button type="button" onClick={() => onExpand(true)}><i style={{ background: FRIENDS_FINISHES[finish].color }} />{rails ? 'Steel rails · timber sleepers' : FRIENDS_FINISHES[finish].name}<ChevronDown size={13} /></button><span>{buildDimensions(shape)}</span><span>World grid · 32 units</span></div>
        <div className="build-placement" role="status"><span className={placementHint?.startsWith('Ready') ? 'build-placement--ready' : ''}>{placementHint && !placementHint.startsWith('Ready') ? placementHint : message || placementHint || 'Aim at a surface to place a piece.'}</span>{!permitted && <b>Host-only building</b>}</div>
        <p className="build-key-guide"><kbd>Click</kbd> place <kbd>Scroll / R</kbd> rotate <kbd>Shift + R</kbd> reverse <kbd>1–8</kbd> toolbar <kbd>B</kbd> exit</p>
      </> : <>
        <div className="build-library__body">
          <aside className="build-library__categories"><span className="build-section-label">PIECE LIBRARY</span>{BUILD_CATEGORIES.map(c => <button key={c.id} type="button" aria-pressed={category === c.id && !query} onClick={() => { setCategory(c.id); setQuery(''); setTrainSelected(false); }}><strong>{c.label}</strong><small>{c.hint}</small>{c.id === 'railway' && <TrainFront size={17} />}</button>)}
            <div className="build-library__grid-note"><span>32</span><p>One block.<br />The same grid as your world.</p></div>
            {host && <div className="build-world-actions"><button type="button" onClick={onExport}><Download size={14} /> Back up world</button><button type="button" onClick={onImport}><Upload size={14} /> Restore backup</button></div>}
          </aside>
          <main className="build-library__browse">
            <label className="build-search"><Search size={17} /><input ref={search} value={query} onChange={e => setQuery(e.target.value)} placeholder="Search blocks, roofs, tracks…" aria-label="Search construction pieces" autoComplete="off" />{query && <button type="button" onClick={() => setQuery('')} aria-label="Clear piece search"><X size={14} /></button>}</label>
            <div className="build-library__heading"><h3>{query ? 'Search results' : BUILD_CATEGORIES.find(c => c.id === category)?.label}</h3><span>{pieces.length + Number(showTrain)} {pieces.length + Number(showTrain) === 1 ? 'piece' : 'pieces'}</span></div>
            <div className="build-piece-grid">{pieces.map(s => <button type="button" className="build-piece-card" key={s} aria-pressed={shape === s && !trainSelected} onClick={() => choose(s)}>
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
              : <div className="build-slot-assignment"><label htmlFor="build-slot">Keep in your toolbar</label><div><select id="build-slot" value={assignSlot} onChange={e => setAssignSlot(Number(e.target.value))}>{toolbar.map((s, i) => <option key={i} value={i}>Slot {i + 1} · {FRIENDS_BUILD_CATALOG[s].name}</option>)}</select><button type="button" onClick={() => onAssign(assignSlot, shape)} aria-label={`Assign ${selected.name} to slot ${assignSlot + 1}`}><Pin size={16} /></button></div><button type="button" className="build-primary-button" onClick={() => onExpand(false)}>Build with this piece <ArrowRight size={16} /></button></div>}
          </aside>
        </div>
        <section className={`build-materials ${rails || trainSelected ? 'build-materials--rail' : ''}`} aria-label="Construction materials">{rails || trainSelected ? <><span className="build-section-label">RAILWAY MATERIALS</span><p>Steel rails and timber sleepers have a fixed finish.</p></> : finishGroups.map(group => <div key={group.label}><span className="build-section-label">{group.label}</span><div className="build-materials__row">{group.finishes.map(f => <button type="button" key={f} aria-pressed={f === finish} onClick={() => onFinish(f)}><i style={{ backgroundColor: FRIENDS_FINISHES[f].color, backgroundImage: materialTexture(f) ? `linear-gradient(${FRIENDS_FINISHES[f].color}66,${FRIENDS_FINISHES[f].color}66),url(${import.meta.env.BASE_URL}textures/frontier/${materialTexture(f)}_1K-JPG_Color.jpg)` : undefined }} /><span>{FRIENDS_FINISHES[f].name}</span></button>)}</div></div>)}</section>
        <div className="build-library__toolbar"><span className="build-section-label">YOUR TOOLBAR <small>1–8 to select · Shift scroll to cycle</small></span>{toolbarView}</div>
        <footer className="build-library__footer"><div role="status">{message || (moving ? 'Select a destination, then place your moved piece.' : 'Choose a piece and material. Close the library to place it.')}</div>{host && <label><input type="checkbox" checked={building?.guestsCanBuild !== false} onChange={() => onAction('permissions')} /> Friends can build</label>}<button type="button" className="build-primary-button" onClick={() => onExpand(false)}>Return to building <ArrowRight size={16} /></button></footer>
      </>}
    </section>
  </div>;
}
