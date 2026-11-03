import registry from './registry.cjs';

const {EVENTS,HISTORY,hash,contextOf,redis}=registry;
const STATES=['none','paid','unpaid','done'];
const known=new Set(['reported_success','accepted','unknown','pending','rejected']);
const time=v=>v===null||v===undefined||v===''?null:Number.isFinite(Number(v))?new Date(Number(v)).toISOString():typeof v==='string'&&Number.isFinite(Date.parse(v))?new Date(v).toISOString():null;

// Reads only: deliberately does not call bootstrap(), claim(), finish() or a sender.
export function createHistoryReader({read=redis,now=()=>new Date()}={}){
 return async({alf,apt})=>{
  const contexts=STATES.map(state=>contextOf({context:{alf,apt,state}}));
  const [values,recent,...claims]=await Promise.all([
   read(['HVALS',EVENTS]),read(['GET',HISTORY]),...contexts.map(c=>read(['GET',c.key]))
  ]);
  if(!Array.isArray(values)||values.some(v=>typeof v!=='string'))throw Error('Invalid durable registry');
  const events=values.map(v=>JSON.parse(v));
  if(events.some(v=>!v||typeof v!=='object'||Array.isArray(v)))throw Error('Invalid durable registry');
  const legacy=recent===null?[]:JSON.parse(recent);
  if(!Array.isArray(legacy))throw Error('Invalid recent history');
  const stages=contexts.map((c,i)=>{
   const rows=events.filter(e=>e.stay===c.stay&&e.stage===c.stage).map(e=>({
    recordHash:hash(String(e.id||'')+'|'+JSON.stringify(e)),
    status:known.has(e.status)?e.status:'unknown',at:time(e.finishedAt??e.at),source:'durable_registry'
   }));
   // Include still-visible legacy rows without persisting/migrating anything.
   for(const e of legacy){
    try{
     const lc=contextOf({context:{alf:e.alf,apt:String(e.apt),state:e.state||'none'}});
     if(lc.stay===c.stay&&lc.stage===c.stage)rows.push({recordHash:hash('legacy:'+String(e.id||'')+'|'+JSON.stringify(e)),status:'reported_success',at:time(e.ts),source:'recent_legacy_history'});
    }catch{/* Legacy display is explicitly incomplete, never a negative authority. */}
   }
   const claim=claims[i];
   if(claim!==null&&typeof claim!=='string')throw Error('Invalid claim');
   let claimSummary=null;
   if(claim!==null){const v=JSON.parse(claim);if(!v||typeof v!=='object'||Array.isArray(v))throw Error('Invalid claim');claimSummary={present:true,status:known.has(v.status)?v.status:'unknown',at:time(v.at),recordHash:hash(claim)};}
   return {state:c.state,stage:c.stage,records:rows,claim:claimSummary,hasPriorOrUnresolvedAttempt:rows.length>0||claimSummary!==null};
  });
  const otherStages=events.filter(e=>e.stay===contexts[0].stay&&!contexts.some(c=>c.stage===e.stage)).map(e=>({recordHash:hash(JSON.stringify(e)),status:known.has(e.status)?e.status:'unknown',at:time(e.finishedAt??e.at)}));
  return {
   readOnly:true,noGuestActionPerformed:true,channels:['sms'],observedAt:now().toISOString(),
   scope:'all_persisted_events_and_claims_for_exact_stay',
   legacyRecentHistoryComplete:false,absenceIsNotProofOfNoHistoricSend:true,allChannelsVerified:false,
   stages,otherStages,hasUnmappedPriorOrUnresolvedAttempt:otherStages.length>0,evidenceHash:hash(JSON.stringify({stages,otherStages}))
  };
 };
}
