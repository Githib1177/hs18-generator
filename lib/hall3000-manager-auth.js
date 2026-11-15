import {createPublicKey, verify} from 'node:crypto';

const authenticatedManager = Symbol('authenticated HALL3000 manager');
const maxAgeMs = 60_000;
const format = /^[A-Za-z0-9_-]+$/;

export function isAuthenticatedManager(req) {
 return req[authenticatedManager] === true;
}

export function authenticateManager(req, publicKey, now = Date.now()) {
 if(req.method !== 'POST' || !publicKey) return null;
 const envelope = req.body;
 if(!envelope || Object.keys(envelope).length !== 3) return null;
 const {at, payload, signature} = envelope;
 if(!Number.isSafeInteger(at) || Math.abs(now - at) > maxAgeMs ||
    typeof payload !== 'string' || payload.length > 32768 || !format.test(payload) ||
    typeof signature !== 'string' || signature.length !== 86 || !format.test(signature)) return null;
 try {
  const key = createPublicKey({key: Buffer.from(publicKey,'base64url'), format:'der', type:'spki'});
  if(key.asymmetricKeyType !== 'ed25519' ||
     !verify(null,Buffer.from('hs18-manager-dispatch-v1\n'+at+'\n'+payload),key,Buffer.from(signature,'base64url'))) return null;
  const body=JSON.parse(Buffer.from(payload,'base64url').toString('utf8'));
  if(!body || Array.isArray(body) || typeof body.action !== 'string') return null;
  return {...req, [authenticatedManager]:true, body};
 } catch {
  return null;
 }
}
