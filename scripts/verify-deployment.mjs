import {createHash} from 'node:crypto';
import {readFile, readdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const repo='Githib1177/hs18-generator';
const protectedPath=p=>/^(api|lib|public|scripts)\//.test(p)||['vercel.json','package.json','package-lock.json','.vercelignore'].includes(p);
export const blobHash=bytes=>createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
export async function verifyDeployment({env=process.env,fetcher=fetch,root=process.cwd()}={}){
 if(env.VERCEL_ENV==='preview')return {preview:true};
 if(env.VERCEL_ENV!=='production')throw Error('Production verification requires an explicit Vercel production environment.');
 if(env.VERCEL_GIT_COMMIT_REF!=='main'||! /^[a-f0-9]{40}$/.test(env.VERCEL_GIT_COMMIT_SHA||''))throw Error('Production must be built from the current GitHub main commit. Local or unversioned uploads are blocked.');
 const get=async path=>{const r=await fetcher('https://api.github.com/repos/'+repo+path,{headers:{Accept:'application/vnd.github+json','User-Agent':'hillside-deployment-guard'},signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('Cannot verify GitHub source; leaving existing production unchanged. HTTP '+r.status);return r.json();};
 const head=await get('/git/ref/heads/main');
 if(head.object?.sha!==env.VERCEL_GIT_COMMIT_SHA)throw Error('Stale production commit blocked. Deploy the latest main.');
 const tree=await get('/git/trees/'+head.object.sha+'?recursive=1');
 if(tree.truncated||!Array.isArray(tree.tree))throw Error('Incomplete source manifest; deployment blocked.');
 const expected=new Map(tree.tree.filter(e=>e.type==='blob'&&protectedPath(e.path)).map(e=>[e.path,e]));
 if(!expected.has('scripts/verify-deployment.mjs')||!expected.has('api/guest-link.js')||!expected.has('public/index.html'))throw Error('Required production safeguards missing.');
 for(const [path,entry] of expected){
  if(!['100644','100755'].includes(entry.mode))throw Error('Unsupported source entry: '+path);
  const bytes=await readFile(resolve(root,path));if(blobHash(bytes)!==entry.sha)throw Error('Source differs from current main: '+path);
 }
 const walk=async(dir)=>{let entries;try{entries=await readdir(resolve(root,dir),{withFileTypes:true});}catch(e){if(e.code==='ENOENT')return;throw e;}
  for(const entry of entries){const p=dir+'/'+entry.name;if(entry.isSymbolicLink())throw Error('Unexpected source symlink: '+p);if(entry.isDirectory())await walk(p);else if(!expected.has(p))throw Error('Untracked source blocked: '+p);}};
 for(const dir of ['api','lib','public','scripts'])await walk(dir);
 return {sha:head.object.sha,files:expected.size};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{console.log('Hillside deployment guard:',await verifyDeployment());}catch(e){console.error('HILLSIDE DEPLOYMENT BLOCKED:',e.message);process.exitCode=1;}
}
