import {execFileSync} from 'node:child_process';
import {writeFile,unlink} from 'node:fs/promises';

/** Compile historical fixtures through the same Vite pipeline as the current
 * code, including imports between changed files. Remove temporary sources on
 * completion; a baseline never replaces the working tree's implementation. */
export async function friendsBaselineModules(revision,names){
  const suffix=`baseline-${process.pid}-${Date.now()}`;
  const available=new Set(execFileSync('git',['ls-tree','-r','--name-only',revision,'--','src/game/rendering'],{encoding:'utf8'}).trim().split('\n'));
  names=names.filter(name=>{const exists=available.has(`src/game/rendering/${name}.ts`);if(!exists&&name!=='FriendsDirectLighting')throw new Error(`Missing baseline ${name} at ${revision}`);return exists;});
  const paths=new Map(names.map(name=>[name,`src/game/rendering/${name}.${suffix}.ts`]));
  const created=[];
  const dispose=()=>Promise.all(created.map(path=>unlink(path)));
  try{
    for(const [name,path] of paths){
      let source=execFileSync('git',['show',`${revision}:src/game/rendering/${name}.ts`],{encoding:'utf8'});
      source=source.replace(/from (['"])\.\/([^'"]+)\1/g,(original,quote,dependency)=>
        paths.has(dependency)?`from ${quote}./${dependency}.${suffix}${quote}`:original);
      await writeFile(path,source,{flag:'wx'});created.push(path);
    }
    return {urls:Object.fromEntries([...paths].map(([name,path])=>[name,`/${path}`])),dispose};
  }catch(error){await dispose();throw error;}
}
