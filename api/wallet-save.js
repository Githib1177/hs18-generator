import {walletConfig,walletSaveUrl} from '../lib/google-wallet.js';
import {verifyGuestToken} from '../lib/wallet-guest-token.js';
import {redis,passKey} from '../lib/wallet-store.js';
export function createWalletSaveHandler({store=redis,getConfig=walletConfig,makeSaveUrl=walletSaveUrl}={}){return async(req,res)=>{
 res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Robots-Tag','noindex, nofollow');res.setHeader('Content-Type','text/plain; charset=utf-8');
 if(req.method!=='GET')return res.status(405).end('Method not allowed');
 try{
  const config=getConfig(),id=verifyGuestToken(req.query?.token,config);
  if(!id)return res.status(404).end('Karta není dostupná / Pass unavailable. Podpora: +420 731 990 087.');
  const raw=await store(['GET',passKey(id)]),record=raw?JSON.parse(raw):null;
  if(record?.busyUntil>Date.now())return res.status(503).end('Karta se aktualizuje / Please retry shortly.');
  if(!record||!['ready','pending'].includes(record.state)||!Number.isFinite(record.expiresAt)||record.expiresAt<=Date.now())return res.status(404).end('Karta není dostupná nebo její platnost skončila / Pass unavailable. Podpora: +420 731 990 087.');
  res.setHeader('Location',makeSaveUrl(config.issuerId+'.'+id,config));return res.status(302).end();
 }catch{return res.status(503).end('Kartu nyní nelze uložit / Please retry later. Podpora: +420 731 990 087.');}
};}
export default createWalletSaveHandler();
