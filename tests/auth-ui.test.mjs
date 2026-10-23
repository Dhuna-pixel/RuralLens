import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../frontend/auth.js',import.meta.url),'utf8');
test('MFA success navigates away from root login and ignores duplicate submissions',async()=>{
 const elements=new Map(),button={disabled:false};
 const get=s=>{if(!elements.has(s))elements.set(s,{hidden:true,querySelector:()=>button});return elements.get(s);};
 let calls=0,finish;const pending=new Promise(r=>finish=r),destinations=[];
 const context={document:{querySelector:get,createElement:()=>({}),head:{append(){}}},location:{pathname:'/',replace:p=>destinations.push(p),reload(){}},FormData:class{*[Symbol.iterator](){yield ['code','123456'];}},fetch:async path=>{if(path==='/api/auth/mfa/verify'){calls++;await pending;return{ok:true,json:async()=>({user:{username:'test'}})};}if(path==='/api/auth/session')return{ok:false};if(path==='/api/auth/setup-status')return{json:async()=>({setupRequired:false})};return{text:async()=>''};}};
 vm.runInNewContext(source,context);
 const form=get('#mfa-verify-form'),event={preventDefault(){},target:form};
 const first=form.onsubmit(event);await form.onsubmit(event);assert.equal(calls,1);assert.equal(button.disabled,true);finish();await first;
 assert.deepEqual(destinations,['/index.html']);assert.equal(get('#login-error').hidden,true);await form.onsubmit(event);assert.equal(calls,1);
});
