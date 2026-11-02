import {isAuthorized} from './_wallet-auth.js';
import {createPrevioReader,PrevioReadError} from '../lib/previo-reservations.js';

export function createReservationsHandler({reader=createPrevioReader(),authorize=isAuthorized}={}){return async(req,res)=>{
 res.setHeader('Cache-Control','private, no-store');res.setHeader('Vary','Cookie');res.setHeader('Pragma','no-cache');
 if(req.method!=='GET')return res.status(405).json({error:'Povoleno je pouze vyhledávání.'});
 if(!authorize(req))return res.status(401).json({error:'Pro vyhledávání se přihlaste do Messengeru.'});
 const q=req.query||{};
 try{
  if(q.mode==='detail'){
   if(['id','resId','arrival','departure','voucher','apt'].some(k=>typeof q[k]!=='string'))return res.status(400).json({error:'Vyberte rezervaci z nabídky.'});
   return res.status(200).json({ok:true,item:await reader.detail(q)});
  }
  if(typeof q.q!=='string'||[...q.q.trim()].length<2||q.q.length>80)return res.status(400).json({error:'Zadejte alespoň dva znaky jména nebo čísla rezervace.'});
  return res.status(200).json({ok:true,...await reader.search(q.q)});
 }catch(error){return res.status(503).json({error:error instanceof PrevioReadError?error.message:'Rezervace se nepodařilo načíst. Zkuste to znovu.'});}
};}
export default createReservationsHandler();
