import { STONE_TOOL } from '../game/multiplayer/FriendsStones';
import { SEEDS_TOOL } from '../game/multiplayer/FriendsBirds';
import { MARSHMALLOW_TOOL } from '../game/multiplayer/FriendsCampfireSimulation';
import { Bird } from 'lucide-react';

export function FriendsFunBar({visible,tool,onStone,onSeeds,onMarshmallow,onClose}:{visible:boolean;tool:number;onStone:()=>void;onSeeds:()=>void;onMarshmallow:()=>void;onClose:()=>void}){
  return <section className="frontier-toolbelt friends-fun-bar" data-visible={visible} aria-hidden={!visible} inert={!visible} aria-label="Fun bar" onMouseDown={e=>e.stopPropagation()} onPointerDown={e=>e.stopPropagation()}>
    <div className="frontier-toolbelt__slots"><span className="friends-fun-label">FUN</span><button type="button" aria-pressed={tool===STONE_TOOL} data-tool={STONE_TOOL} onClick={onStone} title="Stone"><kbd>1</kbd><svg width="22" height="19" viewBox="0 0 24 20" aria-hidden="true"><path d="M3 13 5 6 12 3 19 6 22 13 17 17 8 18Z" fill="currentColor" opacity=".8"/><path d="m5 6 7 5 7-5M12 11l5 6" fill="none" stroke="#27302b" strokeWidth="1.2"/></svg><span>Stone</span></button><button type="button" aria-pressed={tool===SEEDS_TOOL} data-tool={SEEDS_TOOL} onClick={onSeeds} title="Bird seeds"><kbd>2</kbd><Bird size={21}/><span>Seeds</span></button><button type="button" aria-pressed={tool===MARSHMALLOW_TOOL} data-tool={MARSHMALLOW_TOOL} onClick={onMarshmallow} title="Marshmallow"><kbd>3</kbd><svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path d="m4 21 11-12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/><rect x="12" y="3" width="9" height="10" rx="3" transform="rotate(40 16.5 8)" fill="currentColor"/></svg><span>Marshmallow</span></button><button type="button" className="friends-fun-close" onClick={onClose} title="Close Fun bar" aria-label="Close Fun bar"><kbd>T</kbd>×</button></div>
  </section>;
}
