import registry from '../lib/registry.cjs';
import {createManagerHistoryHandler} from '../lib/manager-history-handler.js';
import {createCancellationHandler} from '../lib/cancellation-handler.js';
const {authorized,contextOf,checkContext} = registry;
const readHistory=createManagerHistoryHandler();
const cancellation=createCancellationHandler();
export default async function handler(req,res){
  if(req.query?.operation==='cancellation'){
    const {operation,...query}=req.query;
    return cancellation(req,res,query);
  }
  if(req.method==='GET')return readHistory(req,res);
  res.setHeader('Cache-Control','no-store');
  if(!authorized(req))return res.status(401).json({ok:false,error:'Neplatný přístupový klíč historie.'});
  if(req.method!=='POST')return res.status(405).json({ok:false,error:'Method not allowed'});
  let context;
  try{context=contextOf(req.body);}catch(error){return res.status(400).json({ok:false,error:error.message});}
  if(!context)return res.status(400).json({ok:false,error:'Chybí kontext pobytu.'});
  try{return res.status(200).json({ok:true,...await checkContext(context)});}
  catch{return res.status(503).json({ok:false,error:'Registr nelze ověřit. Žádná SMS nebyla odeslána.'});}
}
