import {isAuthorized} from './_wallet-auth.js';
import {createPrevioReader,PrevioReadError} from '../lib/previo-reservations.js';

export function createReservationsHandler({reader=createPrevioReader(),authorize=isAuthorized}={}){return async(req,res)=>{
 res.setHeader('Cache-Control','private, no-store');res.setHeader('Vary','Cookie');res.setHeader('Pragma','no-cache');
 if(req.method!=='GET')return res.status(405).json({error:'Povoleno je pouze vyhledávání.'});
 if(!authorize(req))return res.status(401).json({error:'Pro vyhledávání se přihlaste do Messengeru.'});
 const q=req.query||{};
 try{
  if(q.mode==='uptake'){
   const keys=['mode','id','resId','arrival','departure','voucher','apt'];
   if(Object.keys(q).some(k=>!keys.includes(k))||keys.some(k=>!Object.hasOwn(q,k)||typeof q[k]!=='string'||!q[k]||q[k].length>80)||!['1','2','3'].includes(q.apt)||!/^\d{4}-\d{2}-\d{2}$/.test(q.arrival)||!/^\d{4}-\d{2}-\d{2}$/.test(q.departure)||!/^[1-9]\d{0,14}$/.test(q.id)||!/^[1-9]\d{0,14}$/.test(q.resId))return res.status(400).json({error:'Úplná přesná identita pobytu je povinná.'});
   return res.status(200).json({ok:true,item:await reader.uptake(q)});
  }
  if(q.mode==='detail'){
   if(['id','resId','arrival','departure','voucher','apt'].some(k=>typeof q[k]!=='string'))return res.status(400).json({error:'Vyberte rezervaci z nabídky.'});
   return res.status(200).json({ok:true,item:await reader.detail(q)});
  }
  if(typeof q.q!=='string'||[...q.q.trim()].length<2||q.q.length>80)return res.status(400).json({error:'Zadejte alespoň dva znaky jména nebo čísla rezervace.'});
  return res.status(200).json({ok:true,...await reader.search(q.q)});
 }catch(error){return res.status(503).json({error:error instanceof PrevioReadError?error.message:'Rezervace se nepodařilo načíst. Zkuste to znovu.'});}
};}
export default createReservationsHandler();
