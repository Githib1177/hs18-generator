import registry from './registry.cjs';
export const cancellationKey=stay=>'hs18:cancellation:v1:'+stay;
export async function assertActiveReference(store,stay){
 if(await store(['GET',cancellationKey(stay)]))throw Object.assign(Error('Pobyt je zrušený. Příprava a odeslání jsou zastavené.'),{status:409});
}
export function urlStay(value){
 const url=new URL(value),alf=url.searchParams.get('alf');
 return alf?registry.hash(registry.normalizeAlf(alf)):null;
}
