import fs from 'node:fs/promises';
import * as THREE from 'three';
import {SimplifyModifier} from 'three/examples/jsm/modifiers/SimplifyModifier.js';
import {mergeVertices} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
const source=await fs.readFile('public/models/friends/pier-interior/chair.glb'),jsonLength=source.readUInt32LE(12),g=JSON.parse(source.subarray(20,20+jsonLength)),bin=source.subarray(28+jsonLength);
const read=i=>{const a=g.accessors[i],v=g.bufferViews[a.bufferView],sizes={SCALAR:1,VEC2:2,VEC3:3},types={5126:Float32Array,5125:Uint32Array,5123:Uint16Array},T=types[a.componentType];return new THREE.BufferAttribute(new T(bin.buffer,bin.byteOffset+(v.byteOffset||0)+(a.byteOffset||0),a.count*sizes[a.type]),sizes[a.type]);};
const primitive=g.meshes[0].primitives[0],geometry=new THREE.BufferGeometry();for(const [key,name]of [['POSITION','position'],['NORMAL','normal'],['TEXCOORD_0','uv']])geometry.setAttribute(name,read(primitive.attributes[key]));geometry.setIndex(read(primitive.indices));
const welded=mergeVertices(geometry),lod=new SimplifyModifier().modify(welded,welded.attributes.position.count-2200);lod.computeVertexNormals();lod.computeBoundingBox();
const views=[],accessors=[],chunks=[];let offset=0;
const append=bytes=>{const pad=Buffer.alloc((4-offset%4)%4);chunks.push(pad);offset+=pad.length;const index=views.length;views.push({buffer:0,byteOffset:offset,byteLength:bytes.length});chunks.push(bytes);offset+=bytes.length;return index;};
const attribute=(a,type)=>{const view=append(Buffer.from(a.array.buffer,a.array.byteOffset,a.array.byteLength)),accessor={bufferView:view,componentType:a.array instanceof Float32Array?5126:a.array instanceof Uint32Array?5125:5123,count:a.count,type};accessors.push(accessor);return accessors.length-1;};
const attrs={};for(const [key,name,type]of [['POSITION','position','VEC3'],['NORMAL','normal','VEC3'],['TEXCOORD_0','uv','VEC2']])attrs[key]=attribute(lod.attributes[name],type);
accessors[attrs.POSITION].min=lod.boundingBox.min.toArray();accessors[attrs.POSITION].max=lod.boundingBox.max.toArray();const indices=attribute(lod.index,'SCALAR');
for(const image of g.images){const v=g.bufferViews[image.bufferView];image.bufferView=append(bin.subarray(v.byteOffset,v.byteOffset+v.byteLength));}
g.bufferViews=views;g.accessors=accessors;primitive.attributes=attrs;primitive.indices=indices;chunks.push(Buffer.alloc((4-offset%4)%4));const newBin=Buffer.concat(chunks);g.buffers=[{byteLength:newBin.length}];g.asset.generator='Poly Haven Dining Chair 02 / offline simplified game LOD';
let json=Buffer.from(JSON.stringify(g));json=Buffer.concat([json,Buffer.alloc((4-json.length%4)%4,32)]);const h=Buffer.alloc(12),jh=Buffer.alloc(8),bh=Buffer.alloc(8);h.writeUInt32LE(0x46546c67);h.writeUInt32LE(2,4);h.writeUInt32LE(28+json.length+newBin.length,8);jh.writeUInt32LE(json.length);jh.writeUInt32LE(0x4e4f534a,4);bh.writeUInt32LE(newBin.length);bh.writeUInt32LE(0x004e4942,4);await fs.writeFile('public/models/friends/pier-interior/chair-lod.glb',Buffer.concat([h,jh,json,bh,newBin]));console.log({originalTriangles:geometry.index.count/3,lodTriangles:lod.index.count/3,vertices:lod.attributes.position.count});
