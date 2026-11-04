import {isAuthorized} from '../api/_wallet-auth.js';
import {createPrevioReader} from './previo-reservations.js';
import {createHistoryReader} from './manager-history.js';
import registry from './registry.cjs';

const fields=['id','resId','arrival','departure','voucher','apt'];
// Conservative verified baseline: prior production f95c4e5 was READY at this
// time and already used the same permanent EVENTS/claim registry (no TTL).
export const DURABLE_REGISTRY_VERIFIED_FROM='2026-11-02T19:16:50.175Z';
export function historyCoverage(createdAt,observedAt){
 const created=typeof createdAt==='string'?Date.parse(createdAt):NaN,observed=Date.parse(observedAt);
 return {
  scope:'current_verified_reference_for_exact_PMS_stay',
  knownDurableCoverageFrom:DURABLE_REGISTRY_VERIFIED_FROM,
  reservationCreatedAt:Number.isFinite(created)?new Date(created).toISOString():null,
  currentReferenceLifetimeCovered:Number.isFinite(created)&&Number.isFinite(observed)&&created>=Date.parse(DURABLE_REGISTRY_VERIFIED_FROM)&&created<=observed,
  basisDeployment:'dpl_7sxddqYaTP1gf3D7wFqcKLSzyXvR',basisCommit:'f95c4e5c74e56fa353ec595abc83a558858dc703'
 };
}
export function createManagerHistoryHandler({authorize=isAuthorized,reader=createPrevioReader(),history=createHistoryReader(),env=process.env}={}){
 return async(req,res)=>{
  res.setHeader('Cache-Control','private, no-store');res.setHeader('Vary','Cookie');res.setHeader('Pragma','no-cache');
  if(req.method!=='GET')return res.status(405).json({ok:false,error:'Povoleno je pouze čtení.'});
  if(!authorize(req))return res.status(401).json({ok:false,error:'Přihlaste se do Messengeru.'});
  const q=req.query||{};
  if(Object.keys(q).some(k=>!fields.includes(k))||fields.some(k=>typeof q[k]!=='string'||q[k].length>80)||!['1','2','3'].includes(q.apt))return res.status(400).json({ok:false,error:'Je nutná přesná identita pobytu z Previa.'});
  try{
   // Existing reader verifies current hotel, room, voucher and dates. It performs no Wallet/send.
   const stay=await (reader.historyDetail?reader.historyDetail(q):reader.detail(q,{includeRegistryCreationEvidence:true}));
   if(fields.some(k=>String(stay[k])!==q[k])||!stay.alf)throw Error('Stay binding unavailable');
   const result=await history({alf:stay.alf,apt:stay.apt});
   const reservation=Object.fromEntries(fields.map(k=>[k,stay[k]]));
   const coverage=historyCoverage(stay.registrySourceCreatedAt,result.observedAt);
   const hasPrior=result.stages.some(s=>s.hasPriorOrUnresolvedAttempt)||result.hasUnmappedPriorOrUnresolvedAttempt;
   return res.status(200).json({ok:true,reservation,...result,historyCoverage:coverage,
    legacyRecentHistoryRequiredForThisReservation:!coverage.currentReferenceLifetimeCovered,
    absenceIsNotProofOfNoHistoricSend:!coverage.currentReferenceLifetimeCovered,
    smsHistoryConclusion:hasPrior?'prior_or_unresolved_attempt':coverage.currentReferenceLifetimeCovered?'no_prior_attempt_in_current_reference_lifetime':'incomplete_legacy_coverage',
    evidenceHash:registry.hash(JSON.stringify({reservation,registryEvidenceHash:result.evidenceHash,coverage,observedAt:result.observedAt})),
    deployment:env.VERCEL_GIT_COMMIT_SHA||null});
  }catch{return res.status(503).json({ok:false,error:'Úplný registr tohoto pobytu se nepodařilo ověřit. Nic nebylo odesláno ani vytvořeno.'});}
 };
}
export default createManagerHistoryHandler();
