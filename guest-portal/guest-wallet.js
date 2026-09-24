(()=>{
 const texts={cs:['Karta pobytu v telefonu','Alfréd kód a apartmán budete mít vždy po ruce. Kód dveří se do stejné karty doplní po ověření check-inu a platby recepcí.','Uložit do Google Wallet','Pro Android. Aktualizace uložené karty vyžaduje internet.'],en:['Your stay card on your phone','Keep your Alfred code and apartment at hand. Reception will add the door code to the same card after verifying check-in and payment.','Save to Google Wallet','For Android. Updating your saved card requires an internet connection.'],de:['Ihre Aufenthaltskarte auf dem Handy','Alfred-Code und Apartment immer griffbereit. Die Rezeption ergänzt den Türcode nach Prüfung von Check-in und Zahlung auf derselben Karte.','In Google Wallet speichern','Für Android. Die Aktualisierung Ihrer gespeicherten Karte benötigt Internet.']};
 function render(){
  document.getElementById('hillside-wallet-save')?.remove();
  const token=new URLSearchParams(location.hash.slice(1)).get('wallet');
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.[A-Za-z0-9_-]{43}$/.test(token||''))return;
  const lang=['cs','en','de'].includes(document.documentElement.lang)?document.documentElement.lang:'cs',t=texts[lang];
  const section=document.createElement('section');section.id='hillside-wallet-save';section.className='wallet-save';
  const title=document.createElement('h2');title.textContent=t[0];const description=document.createElement('p');description.textContent=t[1];
  const link=document.createElement('a');link.href='https://hs18-generator.vercel.app/api/wallet-save?token='+encodeURIComponent(token);link.target='_blank';link.rel='noopener noreferrer';link.referrerPolicy='no-referrer';link.setAttribute('aria-label',t[2]);
  const badge=document.createElement('img');badge.src='assets/wallet/add-'+lang+'.svg';badge.alt=t[2];badge.height=55;link.append(badge);
  const note=document.createElement('p');note.className='small';note.textContent=t[3];section.append(title,description,link,note);document.getElementById('status')?.after(section);
 }
 render();window.addEventListener('hashchange',render);new MutationObserver(render).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
})();
