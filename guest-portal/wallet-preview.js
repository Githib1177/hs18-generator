'use strict';
const lang = new URLSearchParams(location.search).get('lang');
const language = ['cs','en','de'].includes(lang) ? lang : 'cs';
const copy = {
cs:['NÁVRH PRO GOOGLE WALLET','Podpora vždy po ruce.','KONTAKTNÍ KARTA','Podpora na místě','Pomoc s příjezdem a během pobytu.','Zavolat ↗','Vizuální návrh karty. Uložení do Google Wallet zatím není aktivní. Kontakt si už nyní můžete uložit do telefonu.','Uložit kontakt do telefonu'],
en:['GOOGLE WALLET CONCEPT','Support, always handy.','CONTACT CARD','On-site support','Help with your arrival and during your stay.','Call ↗','Visual card preview. Saving to Google Wallet is not active yet. You can already save the contact to your phone.','Save contact to your phone'],
de:['ENTWURF FÜR GOOGLE WALLET','Hilfe immer griffbereit.','KONTAKTKARTE','Betreuung vor Ort','Hilfe bei der Anreise und während Ihres Aufenthalts.','Anrufen ↗','Visueller Kartenentwurf. Das Speichern in Google Wallet ist noch nicht aktiv. Den Kontakt können Sie bereits auf Ihrem Telefon speichern.','Kontakt auf dem Telefon speichern']
}[language];
document.documentElement.lang = language;
['preview-label','page-title','card-label','card-title','card-note','wallet-call','preview-note','vcard'].forEach((id,i)=>document.getElementById(id).textContent=copy[i]);
const phone = window.HILLSIDE_CONFIG.phone;
document.getElementById('wallet-phone').textContent = phone.replace(/^(\+\d{3})(\d{3})(\d{3})(\d{3})$/,'$1 $2 $3 $4');
document.getElementById('wallet-phone').href = 'tel:' + phone;
document.getElementById('wallet-call').href = 'tel:' + phone;
document.getElementById('wallet-wa').href = 'https://wa.me/' + window.HILLSIDE_CONFIG.whatsapp.replace(/\D/g,'');
document.getElementById('wallet-wa').rel = 'noreferrer noopener';
document.getElementById('back').href = 'index.html?lang=' + language;


const stay = window.HillsidePortal.parseLink(location.href);
const labels={cs:['Karta vašeho pobytu.','KARTA POBYTU','Kód ke dveřím','Nejprve dokončete check-in.','Nejprve dokončete platbu.','Kód zatím není k dispozici.'],en:['Your stay, at hand.','STAY CARD','Door code','Complete check-in first.','Complete payment first.','Code is not available yet.'],de:['Ihr Aufenthalt, griffbereit.','AUFENTHALTSKARTE','Türcode','Bitte zuerst einchecken.','Bitte zuerst bezahlen.','Code noch nicht verfügbar.']}[language];
document.getElementById('page-title').textContent=labels[0];
document.getElementById('card-label').textContent=labels[1];
document.getElementById('wallet-apartment').textContent=stay.apartment ? 'APT '+stay.apartment : 'Hillside 18';
document.getElementById('wallet-code-label').textContent=labels[2];
document.getElementById('wallet-code').textContent=stay.door || '••••';
document.getElementById('wallet-state').textContent=stay.door ? '' : labels[stay.state==='checkin'?3:stay.state==='payment'?4:5];
document.getElementById('back').href='index.html'+location.search+location.hash;
const alfredAction=document.createElement('a');
alfredAction.id='wallet-alfred';
alfredAction.className='button wallet-alfred';
alfredAction.href=stay.alfred || 'https://alfred.previo.app/';
alfredAction.target='_blank';
alfredAction.rel='noreferrer noopener';
alfredAction.textContent=({cs:{checkin:'Dokončit check-in v Alfredu ↗',payment:'Dokončit platbu v Alfredu ↗',ready:'Moje rezervace v Alfredu ↗'},en:{checkin:'Complete check-in in Alfred ↗',payment:'Complete payment in Alfred ↗',ready:'My reservation in Alfred ↗'},de:{checkin:'Check-in in Alfred abschließen ↗',payment:'Zahlung in Alfred abschließen ↗',ready:'Meine Buchung in Alfred ↗'}})[language][stay.state];
document.getElementById('wallet-access').append(alfredAction);
