export function mountCancellation(doc,fetcher,storage){
 const fields=['id','resId','voucher','apt','arrival','departure'],el=id=>doc.getElementById(id),endpoint='/api/registry?operation=cancellation';
 let busy=false,verified=null;
 const identity=()=>Object.fromEntries(fields.map(k=>[k,el(k).value.trim()])),key=q=>'hs18-cancellation-attempt:'+JSON.stringify(q);
 const attempted=q=>storage.getItem(key(q))==='started';
 function controls(){el('read').disabled=busy;el('identity').disabled=busy;el('confirm').disabled=busy||!verified;el('complete').disabled=busy||!verified||!el('confirm').checked;}
 function reset(){verified=null;el('confirm').checked=false;el('receipt').textContent='';controls();}
 function check(q){if(fields.some(k=>!q[k]))throw Error('Vyplňte všechny údaje konkrétního pobytu.');}
 function display(data,q){
  const p=data.receipt;if(!p||p.hotelId!=='763519'||p.statusId!=='7'||fields.some(k=>p.reservation?.[k]!==q[k]))throw Error('Server nepotvrdil přesně tento zrušený pobyt.');
  el('receipt').textContent=JSON.stringify(data,null,2);
  if(data.ok&&p.status==='verified'){verified=null;el('status').textContent='Návaznosti storna jsou ověřené jako dokončené. Žádná zpráva hostovi nebyla odeslána.';}
  else if(attempted(q)){verified=null;el('status').textContent='Předchozí pokus zatím není úplně ověřený. Zápis neopakujte; pokračujte čtecím ověřením a dořešením původního výsledku.';}
  else{verified=JSON.stringify(q);el('status').textContent=`Previo potvrdilo storno ${q.voucher}, apartmán ${q.apt}, ${q.arrival} až ${q.departure}. Návaznosti ještě nejsou dokončené.`;}
 }
 async function read(q){const r=await fetcher(endpoint+'&'+new URLSearchParams(q),{method:'GET',credentials:'same-origin',cache:'no-store'});const d=await r.json();if(!r.ok)throw Error(r.status===401?'Přihlaste se do svého Messengeru přes odkaz nahoře a vraťte se sem.':d.error||'Stav se nepodařilo ověřit.');display(d,q);}
 el('identity').addEventListener('input',reset);el('confirm').addEventListener('change',controls);
 el('read').addEventListener('click',async()=>{if(busy)return;reset();busy=true;controls();try{const q=identity();check(q);await read(q);}catch(e){verified=null;el('status').textContent=e.message;}finally{busy=false;controls();}});
 el('complete').addEventListener('click',async()=>{
  if(busy||!verified||!el('confirm').checked)return;const q=identity();if(JSON.stringify(q)!==verified){reset();return;}
  busy=true;verified=null;controls();
  try{
   if(attempted(q))throw Error('Původní pokus nejprve čtecím způsobem ověřte.');
   storage.setItem(key(q),'started');
   const response=await fetcher(endpoint,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({reservation:q})});
   if(!response.ok)throw Error('Výsledek zápisu není úplně ověřený. Zápis neopakujte; použijte ověření aktuálního stavu.');
   await read(q);
  }catch(e){el('status').textContent=e.message;}finally{el('confirm').checked=false;busy=false;controls();}
 });controls();
}
if(typeof document!=='undefined')mountCancellation(document,window.fetch.bind(window),window.sessionStorage);
