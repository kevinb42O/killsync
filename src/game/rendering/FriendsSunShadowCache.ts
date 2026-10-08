import * as THREE from 'three';

/** Reuse only an identical directional shadow render. Collection runs after
 * world matrices update and only when the renderer would update shadows.
 * Unknown custom depth/animation hooks always fall back to Three's render. */
export class FriendsSunShadowCache {
  private previous: unknown[] = [];
  private current: unknown[] = [];
  private projectionKey: unknown[] = [];
  private map: THREE.DirectionalLight['shadow']['map'] = null;
  private pending = false;
  private renderPending = false;
  private restoreAutoUpdate?: boolean;
  private before: THREE.Scene['onBeforeRender'];
  private after: THREE.Scene['onAfterRender'];
  private beforeHook: THREE.Scene['onBeforeRender'];
  private afterHook: THREE.Scene['onAfterRender'];
  private contextRestored = () => this.invalidate();
  private mapDisposed = () => this.invalidate();
  renders = 0;
  reuses = 0;
  checks = 0;
  constructor(private scene: THREE.Scene, private renderer: THREE.WebGLRenderer, private light: THREE.DirectionalLight) {
    this.before = scene.onBeforeRender; this.after = scene.onAfterRender;
    this.beforeHook = (r,s,c,t) => { this.before.call(scene,r,s,c,t); if(r===renderer)this.prepare(c); };
    this.afterHook = (r,s,c) => { if(r===renderer)this.finish(); this.after.call(scene,r,s,c); };
    scene.onBeforeRender = this.beforeHook; scene.onAfterRender = this.afterHook;
    renderer.domElement?.addEventListener('webglcontextrestored',this.contextRestored);
  }
  invalidate() {
    this.previous.length = 0; this.projectionKey.length = 0;
    this.map?.removeEventListener('dispose',this.mapDisposed);this.map = null;
  }
  private restore() {
    if(this.restoreAutoUpdate!==undefined){this.light.shadow.autoUpdate=this.restoreAutoUpdate;this.restoreAutoUpdate=undefined;}
  }
  private prepare(camera: THREE.Camera) {
    // Also recover the temporary flag if an earlier render threw.
    this.restore(); this.pending = false; this.renderPending = false;
    const r = this.renderer, light = this.light, shadow = light.shadow;
    if(!r.shadowMap.enabled || (!r.shadowMap.autoUpdate&&!r.shadowMap.needsUpdate))return;
    if(!light.castShadow || (!shadow.autoUpdate&&!shadow.needsUpdate)
      || !light.layers.test(camera.layers)) { this.invalidate(); return; }
    for(let parent: THREE.Object3D | null=light;parent;parent=parent.parent)if(!parent.visible){this.invalidate();return;}
    this.renderPending = true;
    if(!shadow.autoUpdate || shadow.needsUpdate || r.shadowMap.type===THREE.VSMShadowMap){this.invalidate();return;}
    // The shadow renderer uses the light's current world transform and target.
    shadow.updateMatrices(light);
    const values = this.current; values.length = 0;
    values.push(r.shadowMap.type,r.localClippingEnabled,r.clippingPlanes.length,camera.layers.mask,shadow.mapSize.x,shadow.mapSize.y,
      shadow.camera.coordinateSystem,shadow.camera.reversedDepth,
      ...shadow.camera.projectionMatrix.elements,...shadow.camera.matrixWorld.elements);
    for(const plane of r.clippingPlanes)values.push(plane,plane.normal.x,plane.normal.y,plane.normal.z,plane.constant);
    if(r.localClippingEnabled || r.clippingPlanes.length)values.push(...camera.matrixWorldInverse.elements,...camera.projectionMatrix.elements);
    // During a moving sun or a shifting shadow projection, reuse is already
    // impossible. Avoid walking the scene in that common case. A stable new
    // projection gets a fresh caster snapshot on its next scheduled render.
    const projectionChanged = this.projectionKey.length > 0 && (this.projectionKey.length !== values.length
      || values.some((value,index)=>value!==this.projectionKey[index]));
    this.projectionKey.length = values.length;
    for(let i=0;i<values.length;i++)this.projectionKey[i]=values[i];
    if(projectionChanged){this.previous.length=0;this.map?.removeEventListener('dispose',this.mapDisposed);this.map=null;return;}
    let safe = true;
    const visit = (object: THREE.Object3D) => {
      if(!safe || !object.visible)return;
      if((object instanceof THREE.Line || object instanceof THREE.Points) && object.castShadow && object.layers.test(camera.layers)) {
        safe=false;return;
      }
      if(object instanceof THREE.Mesh && object.castShadow && object.layers.test(camera.layers)) {
        // Match Three.js's shadow eligibility before considering the snapshot.
        if(!object.frustumCulled || shadow.getFrustum().intersectsObject(object)) {
          if(object instanceof THREE.SkinnedMesh || object instanceof THREE.BatchedMesh || object.customDepthMaterial
            || (object instanceof THREE.InstancedMesh && object.morphTexture)
            || object.onBeforeShadow!==THREE.Object3D.prototype.onBeforeShadow
            || object.onAfterShadow!==THREE.Object3D.prototype.onAfterShadow) { safe=false; return; }
          const geometry: THREE.BufferGeometry = object.geometry;
          values.push(object,geometry,geometry.index,geometry.index?.version,geometry.index?.count,
            geometry.drawRange.start,geometry.drawRange.count,...object.matrixWorld.elements);
          const attributes = Object.entries(geometry.attributes);
          values.push(attributes.length);
          for(const [name,attribute] of attributes) {
            if(attribute instanceof THREE.GLBufferAttribute){safe=false;return;}
            const buffer = attribute instanceof THREE.InterleavedBufferAttribute ? attribute.data : attribute;
            values.push(name,attribute,buffer.array,buffer.version,attribute.count,attribute.itemSize,attribute.normalized);
            if(attribute instanceof THREE.InterleavedBufferAttribute)values.push(attribute.offset,attribute.data.stride);
            if(attribute instanceof THREE.InstancedBufferAttribute)values.push(attribute.meshPerAttribute);
            if(buffer instanceof THREE.InstancedInterleavedBuffer)values.push(buffer.meshPerAttribute);
          }
          if(geometry instanceof THREE.InstancedBufferGeometry)values.push(geometry.instanceCount);
          // Morph input changes are independent of ordinary attribute versions.
          const morphs = Object.entries(geometry.morphAttributes);
          values.push(morphs.length);
          for(const [name,attributes] of morphs) {
            values.push(name,attributes.length);
            for(const attribute of attributes) {
              const buffer = attribute instanceof THREE.InterleavedBufferAttribute ? attribute.data : attribute;
              values.push(attribute,buffer.array,buffer.version);
            }
          }
          values.push(geometry.morphTargetsRelative,object.morphTargetInfluences?.length||0,...object.morphTargetInfluences||[]);
          if(object instanceof THREE.InstancedMesh)values.push(object.count,object.instanceMatrix,object.instanceMatrix.version);
          values.push(geometry.groups.length);
          for(const group of geometry.groups)values.push(group.start,group.count,group.materialIndex);
          const materials = Array.isArray(object.material)?object.material:[object.material];
          values.push(materials.length);
          for(const m of materials) {
            const material = m as THREE.MeshStandardMaterial;
            values.push(material,material.version,material.visible,material.side,material.shadowSide,
              material.alphaTest,material.alphaToCoverage,material.wireframe,material.wireframeLinewidth,
              material.clipShadows,material.clipIntersection,material.displacementScale,material.displacementBias);
            for(const texture of [material.map,material.alphaMap,material.displacementMap]) {
              values.push(texture);
              if(texture){
                if(texture instanceof THREE.VideoTexture || texture.isRenderTargetTexture){safe=false;return;}
                values.push(texture.version,texture.source,texture.source.version,texture.channel,
                texture.matrixAutoUpdate,texture.wrapS,texture.wrapT,texture.minFilter,texture.magFilter,
                texture.offset.x,texture.offset.y,texture.repeat.x,texture.repeat.y,texture.center.x,texture.center.y,texture.rotation);
                if(!texture.matrixAutoUpdate)values.push(...texture.matrix.elements);}
            }
            values.push(material.clippingPlanes?.length||0);
            for(const plane of material.clippingPlanes||[])values.push(plane,plane.normal.x,plane.normal.y,plane.normal.z,plane.constant);
          }
        }
      }
      for(const child of object.children)visit(child);
    };
    visit(this.scene); this.checks++;
    if(!safe){this.invalidate();return;}
    const same=this.map===shadow.map && this.previous.length===values.length
      && values.every((value,index)=>value===this.previous[index]);
    if(same){this.restoreAutoUpdate=shadow.autoUpdate;shadow.autoUpdate=false;this.renderPending=false;this.reuses++;}
    else this.pending=true;
  }
  private finish() {
    this.restore();
    if(this.pending && this.light.shadow.map){
      [this.previous,this.current]=[this.current,this.previous];
      if(this.map!==this.light.shadow.map){
        this.map?.removeEventListener('dispose',this.mapDisposed);
        this.map=this.light.shadow.map;this.map.addEventListener('dispose',this.mapDisposed);
      }
    }
    if(this.renderPending && this.light.shadow.map)this.renders++;
    this.renderPending=false;
    this.pending=false;
  }
  dispose() {
    this.restore();this.invalidate();this.current.length=0;
    if(this.scene.onBeforeRender===this.beforeHook)this.scene.onBeforeRender=this.before;
    if(this.scene.onAfterRender===this.afterHook)this.scene.onAfterRender=this.after;
    this.renderer.domElement?.removeEventListener('webglcontextrestored',this.contextRestored);
  }
}
