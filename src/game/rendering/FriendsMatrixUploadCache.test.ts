import {describe,it,expect,vi} from 'vitest';
import {FriendsMatrixUploadCache} from './FriendsMatrixUploadCache';
function fixture(){
  const uploads=vi.fn(),locations=new Map<string,WebGLUniformLocation>();
  const gl={uniformMatrix4fv:uploads,getUniformLocation:vi.fn((_p:WebGLProgram,name:string)=>{const loc={} as WebGLUniformLocation;locations.set(name,loc);return loc;}),useProgram:vi.fn(),linkProgram:vi.fn()} as unknown as WebGL2RenderingContext;
  const canvas=new EventTarget(),cache=new FriendsMatrixUploadCache(gl,canvas),program={} as WebGLProgram;
  gl.linkProgram(program);gl.useProgram(program);const location=gl.getUniformLocation(program,'spotLightMatrix[0]')!;
  return {gl,canvas,cache,program,location,uploads};
}
describe('exact matrix array upload cache',()=>{
  it('skips duplicate contents while forwarding changed matrices and copied arrays',()=>{
    const {gl,cache,location,uploads}=fixture(),v=new Float32Array(32);v[0]=1;
    gl.uniformMatrix4fv(location,false,v);gl.uniformMatrix4fv(location,false,v.slice());
    expect(uploads).toHaveBeenCalledTimes(1);expect(cache.stats.skipped).toBe(1);
    v[31]=2;gl.uniformMatrix4fv(location,false,v);expect(uploads).toHaveBeenCalledTimes(2);
    v[31]=0;gl.uniformMatrix4fv(location,false,v);expect(uploads).toHaveBeenCalledTimes(3);
    gl.uniformMatrix4fv(location,false,new Float32Array(16));expect(uploads).toHaveBeenCalledTimes(4);
  });
  it('compares bit patterns, including signed zero and NaN payloads',()=>{
    const {gl,location,uploads}=fixture(),v=new Float32Array(16),bits=new Uint32Array(v.buffer);
    gl.uniformMatrix4fv(location,false,v);v[0]=-0;gl.uniformMatrix4fv(location,false,v);
    bits[0]=0x7fc00001;gl.uniformMatrix4fv(location,false,v);bits[0]=0x7fc00002;gl.uniformMatrix4fv(location,false,v);
    expect(uploads).toHaveBeenCalledTimes(4);
  });
  it('keeps partial writes, scalar matrices and unknown or wrong-program locations on the native path',()=>{
    const {gl,program,location,uploads}=fixture(),v=new Float32Array(32);
    gl.uniformMatrix4fv(location,false,v);gl.uniformMatrix4fv(location,false,v,0,16);gl.uniformMatrix4fv(location,false,v);
    const scalar=gl.getUniformLocation(program,'modelMatrix')!;
    gl.uniformMatrix4fv(scalar,false,v);gl.uniformMatrix4fv(scalar,false,v);
    gl.uniformMatrix4fv({} as WebGLUniformLocation,false,v);
    gl.useProgram({} as WebGLProgram);gl.uniformMatrix4fv(location,false,v);gl.uniformMatrix4fv(location,false,v);
    expect(uploads).toHaveBeenCalledTimes(8);
  });
  it('invalidates after relink, native bypass, context restoration and disabling',()=>{
    const {gl,cache,program,location,uploads,canvas}=fixture(),v=new Float32Array(16);
    gl.uniformMatrix4fv(location,false,v);gl.uniformMatrix4fv(location,false,v);
    gl.linkProgram(program);gl.uniformMatrix4fv(location,false,v);gl.uniformMatrix4fv(location,false,v);
    const next=gl.getUniformLocation(program,'spotLightMatrix[0]')!;
    gl.uniformMatrix4fv(next,false,v);cache.setEnabled(false);gl.uniformMatrix4fv(next,false,v);
    cache.setEnabled(true);gl.uniformMatrix4fv(next,false,v);
    canvas.dispatchEvent(new Event('webglcontextrestored'));gl.uniformMatrix4fv(next,false,v);
    expect(uploads).toHaveBeenCalledTimes(7);
    cache.dispose();expect(gl.uniformMatrix4fv).toBe(uploads);
  });
});
