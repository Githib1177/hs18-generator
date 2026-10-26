import {createHash} from 'node:crypto';
import {buildWalletObject} from './wallet-pass.js';
import {guestToken} from './wallet-guest-token.js';
import {stayKey,passKey,lockKey} from './wallet-store.js';

export const digest=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
export const shortId=id=>createHash('sha256').update('hillside-preparation:'+id).digest().subarray(0,16).toString('base64url');
export const shortUrls=id=>{const root='https://hs18-generator.vercel.app/s/'+id;return {cs:root,en:root+'/en',de:root+'/de'};};
export function targets(record,token){
 const urls={};
 for(const lang of ['cs','en','de']){
  const u=new URL('https://hillside18-guest-portal.vercel.app/');u.searchParams.set('apt',record.context.apt);u.searchParams.set('alf','https://alfred.previo.app/login/'+record.context.alf);
  if(lang!=='cs')u.searchParams.set('lang',lang);
  if(record.context.state!=='none')u.searchParams.set(record.context.state,'1');
  if(record.context.state==='done')u.searchParams.set('door',record.walletBody.doorCode);
  u.hash=new URLSearchParams({apt:record.context.apt,wallet:token}).toString();urls[lang]=u.href;
 }
 return urls;
}
function includes(actual,expected){
 if(expected===null||typeof expected!=='object')return actual===expected;
 if(Array.isArray(expected))return Array.isArray(actual)&&actual.length===expected.length&&expected.every((v,i)=>includes(actual[i],v));
 return actual&&Object.entries(expected).every(([k,v])=>includes(actual[k],v));
}
// Read-only unless an explicit reconcile positively confirms a formerly unknown
// Google PUT. That branch records the observed result; it never issues a PUT.
export async function recoverPreparation(record,{store,getConfig,getObject,reconcile=false,holdWallet}){
 if(!record.walletBody||record.phase==='prepared')return record;
 const raw=await store(['GET',stayKey(record.stayHash)]);
 if(!raw)return {...record,recovery:'wallet_not_started'};
 let pass=JSON.parse(raw);const config=getConfig();
 const expected=buildWalletObject(pass,record.walletBody,config);
 const revision=digest(expected.object);
 if(pass.revision!==revision||pass.busyUntil>Date.now())return {...record,recovery:'wallet_outcome_unresolved'};
 if(pass.state===null&&reconcile){
  await holdWallet(record);
  if(await store(['GET',stayKey(record.stayHash)])!==raw)return {...record,recovery:'wallet_changed'};
  const object=await getObject(config.issuerId+'.'+pass.passId,config);
  if(!includes(object,expected.object))return {...record,recovery:'google_result_not_confirmed'};
  pass={...pass,state:expected.state,busyUntil:0,reconciledAt:Date.now()};
  const script="if redis.call('GET',KEYS[1])~=ARGV[1] or redis.call('GET',KEYS[2])~=ARGV[2] then return 0 end redis.call('SET',KEYS[2],ARGV[3]);redis.call('SET',KEYS[3],ARGV[3]);return 1";
  const claim=record.recoveryLockClaim;
  if(await store(['EVAL',script,3,lockKey(record.stayHash),stayKey(record.stayHash),passKey(pass.passId),claim,raw,JSON.stringify(pass)])!==1)throw Error('Wallet changed during reconciliation');
 }
 if(pass.state!==expected.state)return {...record,recovery:'wallet_outcome_unresolved'};
 const token=guestToken(pass.passId,config),destination=targets(record,token);
 const next={...record,phase:'wallet_ready',passId:pass.passId,walletRevision:revision,walletState:pass.state,targets:destination};
 delete next.recoveryLockClaim;
 const link=await store(['GET','hs18:guest-link:'+record.shortId]);
 if(link&&JSON.stringify(JSON.parse(link))===JSON.stringify(destination))return {...next,phase:'prepared',urls:shortUrls(record.shortId),recovery:'verified_existing_preparation'};
 return {...next,recovery:link?'short_link_conflict':'link_not_created'};
}
