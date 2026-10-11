import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {dedup,prune,weld,simplify,join,textureCompress} from '@gltf-transform/functions';
import {MeshoptSimplifier} from 'meshoptimizer';
import sharp from 'sharp';
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS),doc=await io.read(process.argv[2]);
// Standard PBR avoids the offscreen transmission pass for this single prop.
for(const m of doc.getRoot().listMaterials()){
 for(const e of m.listExtensions())m.setExtension(e.extensionName,null);

}
// Remove glazing geometry while keeping the opaque authored window frames.
for(const mesh of doc.getRoot().listMeshes())for(const p of mesh.listPrimitives())if(p.getMaterial()?.getName().includes('glazing'))p.dispose();
// Replace the narrow closed rear door/wall with a walkable authored frame.
for(const node of doc.getRoot().listNodes())if(/Working pilothouse (rear |recessed closed boarding door|door handle|seated door hinge)/.test(node.getName()))node.dispose();
// Open fishing deck: remove perimeter rails, stanchions, flanges and cabin grabrails.
for(const node of doc.getRoot().listNodes())if(/^(Peripheral rail |Working pilothouse (side grabrail|grabrail seat)|Working gantry upright |Gantry load roller)/.test(node.getName()))node.dispose();
const hullMaterial=doc.getRoot().listMaterials()[8].clone().setName('Harbour navy hull');
for(const mesh of doc.getRoot().listMeshes())if(mesh.getName()==='Finite lofted hull and transom')for(const p of mesh.listPrimitives())p.setMaterial(hullMaterial);
for(const extension of doc.getRoot().listExtensionsUsed())if(extension.extensionName!=='KHR_texture_transform')extension.dispose();
await MeshoptSimplifier.ready;
await doc.transform(weld(),simplify({simplifier:MeshoptSimplifier,ratio:.18,error:.002}),join(),dedup(),prune(),textureCompress({encoder:sharp,targetFormat:'webp',resize:[512,512],quality:80}));
await io.write(process.argv[3],doc);
console.log(doc.getRoot().listMeshes().map(m=>({name:m.getName(),primitives:m.listPrimitives().length,triangles:m.listPrimitives().reduce((s,p)=>s+p.getIndices().getCount()/3,0)})));
