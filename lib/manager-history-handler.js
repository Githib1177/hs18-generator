import {isAuthorized} from '../api/_wallet-auth.js';
import {createPrevioReader} from './previo-reservations.js';
import {createHistoryReader} from './manager-history.js';

const fields=['id','resId','arrival','departure','voucher','apt'];
export function createManagerHistoryHandler({authorize=isAuthorized,reader=createPrevioReader(),history=createHistoryReader(),env=process.env}={}){
 return async(req,res)=>{
  res.setHeader('Cache-Control','private, no-store');res.setHeader('Vary','Cookie');res.setHeader('Pragma','no-cache');
  if(req.method!=='GET')return res.status(405).json({ok:false,error:'Povoleno je pouze čtení.'});
  if(!authorize(req))return res.status(401).json({ok:false,error:'Přihlaste se do Messengeru.'});
  const q=req.query||{};
  if(Object.keys(q).some(k=>!fields.includes(k))||fields.some(k=>typeof q[k]!=='string'||q[k].length>80)||!['1','2','3'].includes(q.apt))return res.status(400).json({ok:false,error:'Je nutná přesná identita pobytu z Previa.'});
  try{
   // Existing reader verifies current hotel, room, voucher and dates. It performs no Wallet/send.
   const stay=await reader.detail(q);
   if(fields.some(k=>String(stay[k])!==q[k])||!stay.alf)throw Error('Stay binding unavailable');
   const result=await history({alf:stay.alf,apt:stay.apt});
   return res.status(200).json({ok:true,reservation:Object.fromEntries(fields.map(k=>[k,stay[k]])),...result,deployment:env.VERCEL_GIT_COMMIT_SHA||null});
  }catch{return res.status(503).json({ok:false,error:'Úplný registr tohoto pobytu se nepodařilo ověřit. Nic nebylo odesláno ani vytvořeno.'});}
 };
}
export default createManagerHistoryHandler();
