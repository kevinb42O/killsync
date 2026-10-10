import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { FriendsModeSetup, type FriendsModeSetupProps } from './FriendsModeSetup';

const noop = () => {};
const base: FriendsModeSetupProps = {
  mode:'choose',language:'en',nickname:'Lena',nicknameValid:true,codeInput:'',roomCode:'MEADOW-01',lobbies:[],
  localPlayer:{id:'host',label:'Lena',color:'#486b57'},guestPlayers:[],rosterPlayers:[],connected:false,spectating:false,
  loading:false,discoveryLoading:false,discoveryError:false,status:'',error:null,copiedCode:false,copiedLink:false,offerCode:'',answerCode:'',
  onNickname:noop,onNormalizeNickname:noop,onCode:noop,onLanguage:noop,onClose:noop,onLeave:noop,onHost:noop,onSolo:noop,onJoinCode:noop,onJoinRoom:noop,onRefresh:noop,onLaunch:noop,onCopyCode:noop,onCopyLink:noop,onManualHost:noop,onManualGuest:noop,onOffer:noop,onAnswer:noop,onCreateAnswer:noop,onAcceptAnswer:noop,onCopyText:noop,
};
describe('Friends setup presentation', () => {
  it('offers a host launch with just one person, without operator configuration', () => {
    const html = renderToStaticMarkup(<FriendsModeSetup {...base} mode="host"/>);
    expect(html).toContain('Head into the island'); expect(html).toContain('Room for 5 more'); expect(html).toContain('1 of 6'); expect(html).toContain('Copy invite link');
    expect(html).not.toContain('Operator'); expect(html).not.toContain('Deploy');
  });
  it('updates open slots as guests join and removes the invitation at capacity', () => {
    const guests = Array.from({ length: 5 }, (_, i) => ({ id: `guest-${i}`, label: `Guest ${i}`, color: '#486b57' }));
    const partial = renderToStaticMarkup(<FriendsModeSetup {...base} mode="host" guestPlayers={guests.slice(0, 2)}/>);
    expect(partial).toContain('Room for 3 more'); expect(partial).toContain('3 of 6');
    const full = renderToStaticMarkup(<FriendsModeSetup {...base} mode="host" guestPlayers={guests}/>);
    expect(full).toContain('6 of 6'); expect(full).not.toContain('Room for');
  });
  it('explains the guest waiting state and correctly identifies spectator connections', () => {
    const guest = renderToStaticMarkup(<FriendsModeSetup {...base} mode="guest" connected rosterPlayers={[base.localPlayer]}/>);
    expect(guest).toContain('Waiting for the host'); expect(guest).not.toContain('Head into the island');
    const watch = renderToStaticMarkup(<FriendsModeSetup {...base} mode="guest" spectating/>);
    expect(watch).toContain('Joining as a viewer');
  });
  it('offers manual connection help and Russian copy', () => {
    const html = renderToStaticMarkup(<FriendsModeSetup {...base} initialRoomCode="CODE-01" language="ru"/>);
    expect(html).toContain('Где встречаемся?'); expect(html).toContain('Помощь с подключением');
    expect(html).toContain('Ваше имя'); expect(html).not.toContain('callsign');
  });
});
