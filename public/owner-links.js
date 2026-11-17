(() => {
  const byId=id=>document.getElementById(id);
  const panel=byId('ownerLinks'), list=byId('ownerLinkRows'), status=byId('ownerLinkStatus');
  const voucher=byId('ownerLinkVoucher'), prev=byId('ownerLinkPrevious'), next=byId('ownerLinkNext');
  if(!panel)return;
  const lifecycle={valid:'Platný',paused:'Pozastavený – dostupnost neověřena',revoked:'Zneplatněný (storno)',expired:'Neplatný – pobyt skončil'};
  const sendStatus={prepared:'Připraven, neodeslán',sent:'Odeslán (přijato SMS bránou)',pending_verification:'Odeslání se ověřuje',historical_unverified:'Přesné odeslání není doložené'};
  const time=new Intl.DateTimeFormat('cs-CZ',{dateStyle:'short',timeStyle:'short',timeZone:'Europe/Prague'});
  const date=v=>typeof v==='string'?v.split('-').reverse().join('.'):'—';
  const make=(tag,text,parent)=>{const node=document.createElement(tag);if(text)node.textContent=text;parent.append(node);return node;};

  let page=0, filter='', timer, request, authenticated=true;
  function render(items){
    const fragment=document.createDocumentFragment();
    for(const row of items){
      const item=make('li',null,fragment), r=row.reservation;
      make('strong',r?[r.voucher,r.guestName||'jméno nedoloženo','Apartmán '+r.apt,date(r.arrival)+' – '+date(r.departure)].join(' · '):'Rezervace není svázaná s odkazem',item);
      make('div',[lifecycle[row.lifecycle]||'Stav neověřen',sendStatus[row.sendStatus]||'Odeslání neověřeno',row.createdAt?'Připraveno '+time.format(new Date(row.createdAt)):null].filter(Boolean).join(' · '),item);
      const variants=make('ul',null,item);
      const order=(b)=>row.deliveries.some(x=>x.path===b.path)?0:b.lang===row.preferredLanguage?1:2;
      for(const entry of [...row.links].sort((a,b)=>order(a)-order(b))){
        if(!/^\/s\/[A-Za-z0-9_-]{22}(\/(en|de))?$/.test(entry.path))continue;
        const variant=make('li',null,variants), sent=row.deliveries.filter(x=>x.path===entry.path);
        make('span',entry.lang.toUpperCase()+' · ',variant);
        const link=make('a',entry.path,variant);
        link.href=entry.path;link.target='_blank';link.rel='noopener noreferrer';
        if(sent.length){
          for(const delivery of sent)make('div','SMS · '+time.format(new Date(delivery.sentAt))+' · '+(delivery.recipientLast3?'••• '+delivery.recipientLast3:'příjemce nedoložen'),variant);
        }else if(row.sendStatus==='sent')make('span',' · bez potvrzeného odeslání v této jazykové verzi',variant);
      }
    }
    list.replaceChildren(fragment);
  }
  function schedule(){
    clearTimeout(timer);
    if(panel.open&&!document.hidden&&authenticated)timer=setTimeout(()=>load(),10000);
  }
  async function load(){
    clearTimeout(timer);request?.abort();
    if(!panel.open||document.hidden)return;
    const current=new AbortController();request=current;
    try{
      const query=new URLSearchParams({operation:'owner-links',page:String(page)});
      if(filter)query.set('voucher',filter);
      const response=await fetch('/api/registry?'+query,{cache:'no-store',signal:current.signal});
      if(current.signal.aborted)return;
      if(response.status===401){
        authenticated=false;list.replaceChildren();prev.hidden=next.hidden=true;
        status.textContent='Přihlaste se níže do správy Messengeru.';
        return;
      }
      if(!response.ok)throw Error();
      const data=await response.json();if(current.signal.aborted)return;
      authenticated=true;render(data.items);prev.hidden=page===0;next.hidden=!data.hasMore;
      status.textContent=data.items.length?'Aktualizováno '+time.format(new Date()):'Pro tento výběr nejsou uložené žádné krátké odkazy.';
    }catch{
      if(!current.signal.aborted)status.textContent='Přehled se nepodařilo aktualizovat. Zkuste načíst znovu.';
    }finally{if(!current.signal.aborted)schedule();}
  }
  const reset=()=>{page=0;list.replaceChildren();prev.hidden=next.hidden=true;load();};
  panel.addEventListener('toggle',load);
  byId('ownerLinkSearch').addEventListener('submit',event=>{event.preventDefault();filter=voucher.value.trim();reset();});
  byId('ownerLinkReset').addEventListener('click',()=>{voucher.value=filter='';reset();});
  prev.addEventListener('click',()=>{if(page){page--;load();}});
  next.addEventListener('click',()=>{page++;load();});
  document.addEventListener('visibilitychange',load);
  document.addEventListener('hillside:links-changed',load);
})();
