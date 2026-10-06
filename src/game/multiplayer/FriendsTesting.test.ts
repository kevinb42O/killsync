import {describe,expect,it} from 'vitest';
import {FriendsFrontier,emptyMaterials,isFrontierSave} from './FriendsFrontier';
import {railExpedition} from './friendsRailTestFixtures';
import {FriendsBuilding} from './FriendsBuilding';
const actor={id:'host',label:'Test',x:8000,y:8000,z:0,lifeState:'alive'};
describe('Friends temporary testing rules',()=>{
  it('builds, paints, undoes and redoes without consuming or refunding resources',()=>{
    const f=new FriendsFrontier(),b=new FriendsBuilding();Object.assign(f.pack(actor),emptyMaterials());
    const transition=(before:Parameters<FriendsFrontier['buildTransition']>[1],after:Parameters<FriendsFrontier['buildTransition']>[2])=>f.buildTransition(actor,before,after);
    expect(b.request(actor,{requestId:1,action:'place',shape:'cube',finish:'teal',pose:{x:8096,y:8000,z:0,rotation:0}},'host',[actor],transition).ok).toBe(true);
    expect(b.request(actor,{requestId:2,action:'undo'},'host',[actor],transition).ok).toBe(true);expect(b.request(actor,{requestId:3,action:'redo'},'host',[actor],transition).ok).toBe(true);
    expect(f.pack(actor)).toEqual(emptyMaterials());expect(f.snapshot().stock).toEqual(emptyMaterials());expect(f.snapshot().testing).toBe(true);
    expect(f.purchaseTrain(actor)).toBeUndefined();f.refund(actor,{wood:8});expect(f.snapshot().stock.wood).toBe(0);
  });
  it('moves a large shipment between the uncapped field pack and train cargo',()=>{
    const f=new FriendsFrontier(),e=railExpedition(),v=e.vehicles().find(v=>v.kind==='train'&&!v.closed)!,p={...actor,x:v.x,y:v.y,z:v.z};f.pack(p).stone=10000;
    expect(f.request(p,{requestId:1,action:'load'},0,[],[v]).ok).toBe(true);expect(f.snapshot().cargo.stone).toBe(10000);expect(f.pack(p).stone).toBe(0);
    expect(f.request(p,{requestId:2,action:'unload'},0,[],[v]).ok).toBe(true);expect(f.pack(p).stone).toBe(10000);expect(f.snapshot().cargo.stone).toBe(0);
  });
  it('continues harvesting beyond the old pack limit and saves large inventories',()=>{
    const f=new FriendsFrontier();f.terrain.addGrade([8000,8000,0,512]);f.pack(actor).wood=1_500_000;
    f.tool(actor,3,{x:8000,y:8000,z:26,dx:0,dy:0,dz:-1},1000,[]);expect(f.pack(actor).soil).toBe(1);
    const saved=f.snapshot();expect(isFrontierSave(saved)).toBe(true);expect(new FriendsFrontier(saved).pack(actor).wood).toBe(1_500_000);
    f.tool(actor,4,{x:8000,y:8000,z:26,dx:0,dy:0,dz:-1},1400,[]);expect(f.pack(actor).soil).toBe(1);
  });
});
