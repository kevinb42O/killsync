// Offline only: the game loads the resulting index lists, not the simplifier.
// meshoptimizer is available in the workspace dependency tree (MIT).
import fs from 'node:fs/promises';
import path from 'node:path';
import { MeshoptSimplifier } from 'meshoptimizer';
await MeshoptSimplifier.ready;
const directory=path.resolve('public/models/friends/quaternius');
for(const name of ['PineTree_1','BirchTree_1','MapleTree_1']){
  const file=await fs.readFile(path.join(directory,name+'.glb'));
  const jsonSize=file.readUInt32LE(12),document=JSON.parse(file.subarray(20,20+jsonSize).toString());
  const data=file.subarray(28+jsonSize);
  function accessor(index){
    const a=document.accessors[index],view=document.bufferViews[a.bufferView],offset=(view.byteOffset||0)+(a.byteOffset||0);
    const dimensions={SCALAR:1,VEC2:2,VEC3:3,VEC4:4}[a.type],componentSize={5123:2,5125:4,5126:4}[a.componentType];
    const result=new Float32Array(a.count*dimensions);
    for(let i=0;i<a.count;i++)for(let j=0;j<dimensions;j++){
      const at=offset+i*(view.byteStride||dimensions*componentSize)+j*componentSize;
      result[i*dimensions+j]=a.componentType===5126?data.readFloatLE(at):a.componentType===5125?data.readUInt32LE(at):data.readUInt16LE(at);
    }
    return result;
  }
  const primitive=document.meshes.flatMap(m=>m.primitives).find(p=>document.materials[p.material].name.endsWith('_Bark'));
  const positions=accessor(primitive.attributes.POSITION),normals=accessor(primitive.attributes.NORMAL),uv=accessor(primitive.attributes.TEXCOORD_0),indices=new Uint32Array(accessor(primitive.indices));
  const attributes=new Float32Array(positions.length/3*5);
  for(let i=0;i<positions.length/3;i++)attributes.set([...normals.subarray(i*3,i*3+3),...uv.subarray(i*2,i*2+2)],i*5);
  const scale=MeshoptSimplifier.getScale(positions,3),levels=[];
  for(const [ratio,error]of[[.3,.008],[.10,.035]]){
    const [reduced,relativeError]=MeshoptSimplifier.simplifyWithAttributes(indices,positions,3,attributes,5,[.02,.02,.02,.05,.05],null,Math.floor(indices.length*ratio/3)*3,error,['LockBorder']);
    levels.push({error:relativeError*scale,indices:Array.from(reduced)});
  }
  const result={sourceIndices:indices.length,sourceVertices:positions.length/3,levels};
  await fs.writeFile(path.join(directory,name+'_BarkLOD.json'),JSON.stringify(result));
  console.log(`${name}: bark ${indices.length/3} → ${levels.map(l=>l.indices.length/3).join(' → ')} triangles; foliage unchanged`);
}
