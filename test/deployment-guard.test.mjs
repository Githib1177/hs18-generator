import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,writeFile,mkdir,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {verifyDeployment,blobHash} from '../scripts/verify-deployment.mjs';
test('production gate rejects old commits, local uploads, changed/missing/extra source and unavailable GitHub',async()=>{
 const root=await mkdtemp(join(tmpdir(),'hillside-guard-'));const sha='a'.repeat(40),env={VERCEL_ENV:'production',VERCEL_GIT_COMMIT_REF:'main',VERCEL_GIT_COMMIT_SHA:sha};
 const paths=['scripts/verify-deployment.mjs','api/guest-link.js','public/index.html'];
 try{
  for(const p of paths){await mkdir(join(root,p.split('/')[0]),{recursive:true});await writeFile(join(root,p),'fixture');}
  const tree=paths.map(path=>({path,type:'blob',mode:'100644',sha:blobHash(Buffer.from('fixture'))}));
  const fetcher=async url=>({ok:true,json:async()=>url.includes('/git/ref/')?{object:{sha}}:{tree,truncated:false}});
  assert.equal((await verifyDeployment({env,fetcher,root})).sha,sha);
  for(const invalid of [{...env,VERCEL_GIT_COMMIT_SHA:'b'.repeat(40)},{...env,VERCEL_GIT_COMMIT_SHA:''},{...env,VERCEL_GIT_COMMIT_REF:'old-branch'}])await assert.rejects(verifyDeployment({env:invalid,fetcher,root}));
  await assert.rejects(verifyDeployment({env,root,fetcher:async()=>({ok:false,status:503})}));
  await writeFile(join(root,'public/index.html'),'stale');await assert.rejects(verifyDeployment({env,fetcher,root}),/differs/);await writeFile(join(root,'public/index.html'),'fixture');
  await writeFile(join(root,'api/old.js'),'stale');await assert.rejects(verifyDeployment({env,fetcher,root}),/Untracked/);await rm(join(root,'api/old.js'));
  await rm(join(root,'scripts/verify-deployment.mjs'));await assert.rejects(verifyDeployment({env,fetcher,root}));
  assert.equal((await verifyDeployment({env:{VERCEL_ENV:'preview'},fetcher,root})).preview,true);
 }finally{await rm(root,{recursive:true,force:true});}
});
