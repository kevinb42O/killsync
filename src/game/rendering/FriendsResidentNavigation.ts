export type ResidentPoint = { x:number; y:number; z:number };
export type ResidentProbe = (x:number,y:number,from:ResidentPoint)=>ResidentPoint|undefined;
type Node = ResidentPoint & { cost:number; score:number; parent?:Node };
const key=(p:ResidentPoint)=>`${Math.round(p.x)},${Math.round(p.y)},${p.z}`;

/** String-pull short sections through the same swept collision probe used for
 * walking. Keep obstacle corners, remove the grid's visible staircase turns. */
export function smoothResidentPath(start:ResidentPoint,points:readonly ResidentPoint[],probe:ResidentProbe) {
  const result:ResidentPoint[]=[];let from=start,index=0;
  while(index<points.length) {
    let next=index;
    for(let candidate=Math.min(points.length-1,index+7);candidate>index;candidate--) {
      if(probe(points[candidate].x,points[candidate].y,from)){next=candidate;break;}
    }
    from=points[next];result.push(from);index=next+1;
  }
  return result;
}

/** Small incremental A*: a caller shares the expansion budget among residents.
 * A 32-unit grid follows the world's voxel steps. Four-way edges prevent
 * cutting diagonally through walls; probes check the middle of each edge too. */
export class FriendsResidentPath {
  readonly points:ResidentPoint[]=[];
  status:'searching'|'found'|'unreachable'='searching';
  expansions=0;
  private readonly open:Node[]=[];
  private readonly costs=new Map<string,number>();
  private readonly closed=new Set<string>();
  constructor(private readonly start:ResidentPoint,private readonly goal:{x:number;y:number},private readonly probe:ResidentProbe) {
    const node={...start,cost:0,score:this.distance(start)};
    this.open.push(node);this.costs.set(key(node),0);
  }
  private distance(p:ResidentPoint){return Math.hypot(p.x-this.goal.x,p.y-this.goal.y);}
  step(budget=12) {
    for(let i=0;i<budget&&this.status==='searching';i++) {
      if(!this.open.length||this.expansions>=600){this.status='unreachable';break;}
      let best=0;for(let j=1;j<this.open.length;j++)if(this.open[j].score<this.open[best].score)best=j;
      const node=this.open.splice(best,1)[0],id=key(node);
      if(this.closed.has(id)){i--;continue;}
      this.closed.add(id);this.expansions++;
      if(this.distance(node)<32) {
        const end=this.probe(this.goal.x,this.goal.y,node);
        if(end) {
          this.points.push(end);let cursor:Node|undefined=node;
          while(cursor?.parent){this.points.push({x:cursor.x,y:cursor.y,z:cursor.z});cursor=cursor.parent;}
          this.points.reverse();this.status='found';break;
        }
      }
      for(const [dx,dy]of [[32,0],[-32,0],[0,32],[0,-32]]) {
        const x=node.x+dx,y=node.y+dy;
        // Bound detours to the local commons rather than searching the world.
        if(x<Math.min(this.start.x,this.goal.x)-192||x>Math.max(this.start.x,this.goal.x)+192||
          y<Math.min(this.start.y,this.goal.y)-192||y>Math.max(this.start.y,this.goal.y)+192)continue;
        const middle=this.probe(node.x+dx/2,node.y+dy/2,node);
        const point=middle&&this.probe(x,y,middle);if(!point)continue;
        const nextId=key(point),cost=node.cost+32+Math.abs(point.z-node.z)*.3;
        if(this.closed.has(nextId)||cost>=(this.costs.get(nextId)??Infinity))continue;
        this.costs.set(nextId,cost);this.open.push({...point,cost,score:cost+this.distance(point),parent:node});
      }
    }
    return this.status;
  }
}
