(()=>{
 const q=id=>document.getElementById(id),panel=document.createElement('section');panel.className='card';panel.id='walletPanel';
 panel.innerHTML=`<h2>Karta pobytu v Google Wallet</h2><p>Alfréd kód a apartmán zůstávají na kartě vždy. Kód dveří se doplní až po dokončeném check-inu a zaplacení. Existující karta se aktualizuje při vytvoření odkazu a před odesláním SMS.</p><div id="walletLogin"><label for="walletPassword">Heslo Falconi Messengeru pro správu karet</label><input id="walletPassword" type="password" autocomplete="current-password"><button id="walletLoginButton" type="button" class="btn btn-dark">Přihlásit Wallet</button></div><div class="row"><div class="field"><label for="walletRelease">Přístup nejdříve</label><input id="walletRelease" type="datetime-local"></div><div class="field"><label for="walletExpires">Konec platnosti pobytu</label><input id="walletExpires" type="datetime-local"></div></div><p class="muted">Časy vyplňte při prvním vytvoření karty nebo opravě platnosti. Při dalších zprávách je znovu zadávat nemusíte. Telefon potřebuje internet pro aktualizaci.</p><label><input id="walletConfirm" type="checkbox"> Potvrzuji správný Alfréd kód, apartmán, stav check-inu a platby, platnost pobytu a při dokončeném pobytu správný připravený kód dveří.</label><p><button id="walletCreate" type="button" class="btn btn-primary">Vytvořit / opravit kartu</button> <a id="walletOpen" class="btn btn-ghost" target="_blank" rel="noopener noreferrer" hidden>Otevřít kartu</a></p><p id="walletStatus" role="status" aria-live="polite"></p>`;
 q('reservationStateCard').closest('.card').after(panel);
 let card=null,busy=false;
 const fingerprint=()=>JSON.stringify(['alf','apt','door','checkinComplete','paymentComplete','guestName','lang','baseUrl','walletRelease','walletExpires'].map(id=>q(id)?.type==='checkbox'?q(id).checked:q(id)?.value));
 const clear=()=>{card=null;q('walletOpen').hidden=true;q('walletOpen').removeAttribute('href');q('walletConfirm').checked=false;for(const id of ['urlsCard','textsCard','doorInfoCard'])if(q(id))q(id).style.display='none';};
 document.addEventListener('input',event=>{if(['alf','door','checkinComplete','paymentComplete','guestName','lang','baseUrl','walletRelease','walletExpires'].includes(event.target.id))clear();});
 document.addEventListener('hillside:apartment-changed',clear);
 document.addEventListener('hillside:stay-loaded',()=>{clear();q('walletRelease').value='';q('walletExpires').value='';});
 window.hillsideWalletLink=url=>{if(!card||card.fingerprint!==fingerprint())return url;const parsed=new URL(url);if(parsed.origin!=='https://hillside18-guest-portal.vercel.app')return url;const hash=new URLSearchParams(parsed.hash.slice(1));hash.set('wallet',card.token);parsed.hash=hash.toString();return parsed.href;};
 q('walletLoginButton').addEventListener('click',async()=>{
  const button=q('walletLoginButton');button.disabled=true;
  try{const response=await fetch('/api/wallet-auth',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:q('walletPassword').value})});const data=await response.json();if(!response.ok)throw new Error(data.error||'Přihlášení se nezdařilo.');q('walletPassword').value='';q('walletLogin').hidden=true;q('walletStatus').textContent='Správa karet je přihlášená.';}catch(e){q('walletStatus').textContent=e.message;}finally{button.disabled=false;}
 });
 fetch('/api/wallet-auth').then(r=>r.json()).then(data=>{q('walletLogin').hidden=data.ok===true;}).catch(()=>{});
 window.hillsideWalletSync=async({existing=true}={})=>{
  if(busy)throw new Error('Vyčkejte na dokončení aktualizace karty.');
  const submitted=fingerprint(),done=q('checkinComplete').checked,paid=q('paymentComplete').checked;
  const body={action:existing?'sync-existing':'create',alfred:q('alf').value,apartment:q('apt').value,doorCode:q('door').value.trim(),checkinComplete:done,paymentComplete:paid,accessConfirmed:done&&paid,operatorConfirmed:true,lang:q('lang').value};
  if(!existing){if(!q('walletConfirm').checked)throw new Error('Nejdříve potvrďte správnost údajů karty.');const start=new Date(q('walletRelease').value),end=new Date(q('walletExpires').value);if(!Number.isFinite(start.getTime())||!Number.isFinite(end.getTime()))throw new Error('Vyplňte začátek přístupu a konec pobytu.');body.releaseAt=start.toISOString();body.expiresAt=end.toISOString();}
  else if(done&&paid&&!confirm('Potvrzujete dokončený check-in, uhrazenou platbu a správný připravený kód dveří pro apartmán '+body.apartment+'? Kód bude zveřejněn v odkazu i na existující kartě Wallet.'))throw new Error('Vytvoření odkazu zrušeno.');
  clear();busy=true;q('walletCreate').disabled=true;q('walletStatus').textContent='Aktualizuji kartu…';
  try{
   const response=await fetch('/api/wallet',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),data=await response.json();
   if(response.status===401)q('walletLogin').hidden=false;
   if(!response.ok)throw new Error(data.error||'Kartu se nepodařilo aktualizovat.');
   if(fingerprint()!==submitted)throw new Error('Údaje pobytu se změnily. Zkontrolujte hosta a opakujte akci.');
   if(data.skipped===true&&data.reason==='no-card'){q('walletStatus').textContent='Karta ještě není založená. Odkaz pro hosta funguje bez Wallet; pro první kartu vyplňte platnost pobytu.';return;}
   if(!/^[0-9a-f-]{36}\.[A-Za-z0-9_-]{43}$/.test(data.guestToken||'')||!['pending','ready'].includes(data.state)||(done&&paid&&data.state!=='ready'))throw new Error('Google nepotvrdil správný stav karty.');
   card={token:data.guestToken,fingerprint:submitted};q('walletOpen').href=location.origin+'/api/wallet-save?token='+encodeURIComponent(data.guestToken);q('walletOpen').hidden=false;
   q('walletStatus').textContent=data.state==='ready'?'Google potvrdil aktualizaci: Alfréd, apartmán i kód dveří.':'Google potvrdil aktualizaci: Alfréd a apartmán. Kód dveří není zveřejněný.';
  }catch(e){q('walletStatus').textContent=e.message;throw e;}finally{busy=false;q('walletCreate').disabled=false;}
 };
 q('walletCreate').addEventListener('click',async()=>{try{await window.hillsideWalletSync({existing:false});await window.buildHillsideLinks({syncWallet:false});}catch(e){q('walletStatus').textContent=e.message;}});
})();
