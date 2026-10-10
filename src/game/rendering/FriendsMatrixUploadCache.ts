/** Three caches individual matrices, but uploads shadow matrix arrays again for
 * each material. Cache identical full array writes at the context boundary.
 * Values are compared, never inferred from scene state or a frame counter. */
export class FriendsMatrixUploadCache {
  private enabled = true;
  private values = new WeakMap<WebGLUniformLocation, Uint32Array>();
  private owners = new WeakMap<WebGLUniformLocation, {program:WebGLProgram; generation:number; array:boolean}>();
  private generations = new WeakMap<WebGLProgram,number>();
  private current:WebGLProgram|null = null;
  readonly stats = { uploads:0, skipped:0 };
  private reset = () => { this.values=new WeakMap();this.owners=new WeakMap();this.generations=new WeakMap();this.current=null; };
  private originalUniform:WebGL2RenderingContext['uniformMatrix4fv'];
  private originalLocation:WebGL2RenderingContext['getUniformLocation'];
  private originalUse:WebGL2RenderingContext['useProgram'];
  private originalLink:WebGL2RenderingContext['linkProgram'];
  private uniform:WebGL2RenderingContext['uniformMatrix4fv'];
  private location:WebGL2RenderingContext['getUniformLocation'];
  private use:WebGL2RenderingContext['useProgram'];
  private link:WebGL2RenderingContext['linkProgram'];
  constructor(private gl:WebGL2RenderingContext,private canvas:EventTarget) {
    this.originalUniform=gl.uniformMatrix4fv;this.originalLocation=gl.getUniformLocation;
    this.originalUse=gl.useProgram;this.originalLink=gl.linkProgram;
    this.location=(program,name)=>{
      const location=this.originalLocation.call(gl,program,name);
      if(location)this.owners.set(location,{program,generation:this.generations.get(program)??0,array:name.endsWith('[0]')});
      return location;
    };
    this.use=program=>{this.originalUse.call(gl,program);this.current=program;};
    this.link=program=>{
      this.originalLink.call(gl,program);
      this.generations.set(program,(this.generations.get(program)??0)+1);
      this.values=new WeakMap();
    };
    this.uniform=(location,transpose,data,offset?,length?)=>{
      const owner=location&&this.owners.get(location);
      // Unknown/invalid locations and partial writes retain native validation.
      // Scalar matrices already have Three's cache and stay on the fast path.
      if(!this.enabled||!location||!owner?.array||owner.program!==this.current
        ||owner.generation!==(this.generations.get(owner.program)??0)||transpose
        ||!(data instanceof Float32Array)||offset!==undefined||length!==undefined
        ||(typeof SharedArrayBuffer!=='undefined'&&data.buffer instanceof SharedArrayBuffer)) {
        if(location)this.values.delete(location);
        this.stats.uploads++;
        if(offset===undefined&&length===undefined)this.originalUniform.call(gl,location,transpose,data);
        else this.originalUniform.call(gl,location,transpose,data,offset,length);
        return;
      }
      const bits=new Uint32Array(data.buffer,data.byteOffset,data.length);
      const previous=this.values.get(location);
      if(previous&&previous.length===data.length) {
        let same=true;for(let i=0;i<data.length;i++)if(previous[i]!==bits[i]){same=false;break;}
        if(same){this.stats.skipped++;return;}
      }
      this.stats.uploads++;this.originalUniform.call(gl,location,transpose,data);
      if(data.length%16===0&&data.length>0){
        if(previous?.length===data.length)previous.set(bits);
        else this.values.set(location,bits.slice());
      }else this.values.delete(location);
    };
    gl.uniformMatrix4fv=this.uniform;gl.getUniformLocation=this.location;gl.useProgram=this.use;gl.linkProgram=this.link;
    canvas.addEventListener('webglcontextrestored',this.reset);
  }
  setEnabled(enabled:boolean){this.enabled=enabled;this.values=new WeakMap();}
  dispose(){
    const gl=this.gl;
    if(gl.uniformMatrix4fv===this.uniform)gl.uniformMatrix4fv=this.originalUniform;
    if(gl.getUniformLocation===this.location)gl.getUniformLocation=this.originalLocation;
    if(gl.useProgram===this.use)gl.useProgram=this.originalUse;
    if(gl.linkProgram===this.link)gl.linkProgram=this.originalLink;
    this.canvas.removeEventListener('webglcontextrestored',this.reset);this.reset();
  }
}
