import planner from '../lib/previo-dry-run.cjs';
// Stateless calculation on supplied observations; no access to stored guest data.
// Never imports the sender, the Redis client, claims, payment or lock tools.
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='POST')return res.status(405).json({ok:false,error:'Method not allowed'});
 const body=req.body||{};
 if(!body.snapshot||!Array.isArray(body.snapshot.reservations)||body.snapshot.reservations.length>500)return res.status(400).json({ok:false,error:'Nahrajte snímek Previa, nejvýše 500 záznamů.'});
 if(JSON.stringify(body).length>500000)return res.status(413).json({ok:false,error:'Snímek je příliš velký.'});
 try{return res.status(200).json({ok:true,...planner.analyze(body.snapshot,{nowUtc:new Date().toISOString(),planningDay:body.planningDay})});}
 catch{return res.status(400).json({ok:false,error:'Neplatný nebo neúplný snímek Previa. Zkontrolujte hotel, termíny, počet řádků a jedinečnost voucherů.'});}
}
