(()=>{
 const q=id=>document.getElementById(id),input=q('reservationSearch'),list=q('reservationSuggestions'),status=q('reservationSearchStatus');
 let timer,controller,sequence=0,options=[],active=-1,applying=false;
 const close=()=>{list.replaceChildren();options=[];active=-1;input.setAttribute('aria-expanded','false');input.removeAttribute('aria-activedescendant');};
 const message=text=>{status.textContent=text;};
 const format=date=>date.split('-').reverse().join('.');
 async function choose(item){
  const current=++sequence;controller?.abort();controller=new AbortController();close();message('Načítám vybranou rezervaci…');
  try{
   const params=new URLSearchParams({mode:'detail',id:item.id,resId:item.resId,arrival:item.arrival,departure:item.departure,voucher:item.voucher,apt:item.apt});
   const response=await fetch('/api/reservations?'+params,{credentials:'same-origin',cache:'no-store',signal:controller.signal}),data=await response.json();
   if(current!==sequence)return;if(!response.ok||!data.ok)throw Error(data.error||'Rezervaci se nepodařilo načíst.');const s=data.item;
   if(!s||s.id!==item.id||s.resId!==item.resId||s.voucher!==item.voucher||s.apt!==item.apt||s.arrival!==item.arrival||s.departure!==item.departure)throw Error('Rezervace se změnila. Vyhledejte ji znovu.');
   // Clear ALL guest-specific output and access state before filling a new stay.
   applying=true;
   q('guestName').value=s.guestName||'';q('guestIsFemale').value='auto';q('alf').value=s.alf||'';q('phone').value=s.phone||'';q('lang').value=['cs','en','de'].includes(s.lang)?s.lang:'cs';q('door').value=s.testCode==='TEST'?'TEST':s.accessConfirmed===true?s.accessCode||'':'';
   for(const id of ['checkinComplete','paymentComplete']){q(id).checked=s[id]===true;q(id).indeterminate=typeof s[id]!=='boolean';}
   q('checkinComplete').dispatchEvent(new Event('change',{bubbles:true}));q('paymentComplete').dispatchEvent(new Event('change',{bubbles:true}));
   document.querySelector('[data-apt="'+s.apt+'"]').click();
   for(const id of ['guestName','guestIsFemale','alf','phone','lang','door'])q(id).dispatchEvent(new Event('change',{bubbles:true}));
   document.dispatchEvent(new CustomEvent('hillside:stay-loaded',{detail:s}));
   for(const id of ['urlsCard','textsCard','doorInfoCard'])if(q(id))q(id).style.display='none';
   if(q('urls'))q('urls').replaceChildren();
   if(q('smsTableWrap'))q('smsTableWrap').style.display='none';
   q('smsTable')?.querySelector('tbody')?.replaceChildren();
   if(q('smsStatus'))q('smsStatus').textContent='';
   applying=false;
   message('Načteno: '+s.guestName+' · APT'+s.apt+' · '+format(s.arrival)+'–'+format(s.departure)+' · rezervace '+s.voucher+' · '+s.status+'. '+(s.stateNotice||'Check-in a platba načteny z Previa; přístupy ověřte před odesláním.'));
   input.value=s.guestName+' · '+s.voucher;
  }catch(error){if(error.name!=='AbortError'&&current===sequence)message(error.message);}finally{applying=false;}
 }
 async function search(){
  const term=input.value.trim(),current=++sequence;controller?.abort();close();
  if([...term].length<2){message('Zadejte alespoň dva znaky jména nebo čísla rezervace.');return;}
  controller=new AbortController();message('Hledám v Previu…');
  try{
   const response=await fetch('/api/reservations?q='+encodeURIComponent(term),{credentials:'same-origin',cache:'no-store',signal:controller.signal}),data=await response.json();
   if(current!==sequence)return;if(!response.ok||!data.ok)throw Error(data.error||'Rezervace se nepodařilo načíst.');
   for(const item of data.items||[]){
    const li=document.createElement('li'),button=document.createElement('button');button.type='button';button.id='reservation-option-'+options.length;button.className='reservation-option';button.setAttribute('role','option');button.setAttribute('aria-selected','false');
    button.textContent=item.guestName+' · APT'+item.apt+' · '+format(item.arrival)+'–'+format(item.departure)+' · '+item.voucher+' · '+item.status;
    button.addEventListener('click',()=>choose(item));li.setAttribute('role','presentation');li.append(button);list.append(li);options.push(button);
   }
   input.setAttribute('aria-expanded',String(options.length>0));message(options.length?(data.truncated?'Vyberte pobyt, nebo upřesněte hledání pro další výsledky.':'Vyberte odpovídající pobyt.'): 'Žádná odpovídající aktivní rezervace v posledních30 dnech a příštích12 měsících.');
  }catch(error){if(error.name!=='AbortError'&&current===sequence)message(error.message);}
 }
 input.addEventListener('input',()=>{++sequence;controller?.abort();clearTimeout(timer);close();timer=setTimeout(search,350);});
 input.addEventListener('keydown',event=>{
  if(event.key==='Escape'){++sequence;controller?.abort();clearTimeout(timer);close();return;}
  if(!options.length)return;
  if(['ArrowDown','ArrowUp'].includes(event.key)){event.preventDefault();active=active<0?(event.key==='ArrowDown'?0:options.length-1):(active+(event.key==='ArrowDown'?1:-1)+options.length)%options.length;options.forEach((b,i)=>b.setAttribute('aria-selected',String(i===active)));input.setAttribute('aria-activedescendant',options[active].id);options[active].scrollIntoView?.({block:'nearest'});}
  else if(event.key==='Enter'&&active>=0){event.preventDefault();options[active].click();}
 });
 document.addEventListener('click',event=>{if(event.target!==input&&!list.contains(event.target))close();});
 for(const id of ['checkinComplete','paymentComplete'])q(id).addEventListener('change',()=>{if(!applying)q(id).indeterminate=false;});
 window.hillsideReservationStatesReady=()=>{
  if(['checkinComplete','paymentComplete'].some(id=>q(id).indeterminate)){message('Stav check-inu nebo platby není ověřený. Ověřte jej a nastavte přepínače před vytvořením odkazu.');return false;}
  return true;
 };
})();
