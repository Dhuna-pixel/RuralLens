import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { existsSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';

const port=31000+Math.floor(Math.random()*10000),base=`http://127.0.0.1:${port}`;
let child,hadStore=false,store;
before(async()=>{
 store=resolve('data/generated/interventions.json');hadStore=existsSync(store);
 child=spawn(process.execPath,['backend/server.mjs'],{env:{...process.env,PORT:String(port),DATA_BORROWERS:'20',DATA_MONTHS:'12',DATA_SEED:'42'},stdio:'ignore'});
 for(let i=0;i<100;i++){try{const r=await fetch(`${base}/api/health`);if(r.ok)return;}catch{}await delay(100);}
 throw Error('API server did not start');
});
after(()=>{child?.kill();if(!hadStore&&store&&existsSync(store))unlinkSync(store);});
test('health and portfolio APIs report generated borrower data',async()=>{
 const h=await(await fetch(`${base}/api/health`)).json();assert.equal(h.borrowers,20);
 const p=await(await fetch(`${base}/api/portfolio?search=BRW-DEMO-001`)).json();assert.equal(p.total,1);assert.equal(p.items[0].borrowerId,'BRW-DEMO-001');
 const d=await(await fetch(`${base}/api/dashboard`)).json();assert.equal(d.totalBorrowers,20);
});
test('borrower, alert, investigation, and what-if routes respond with evidence',async()=>{
 const b=await(await fetch(`${base}/api/borrowers/BRW-DEMO-001`)).json();assert.equal(b.borrower.borrowerName,'Sundar Harvest Collective');
 const i=await(await fetch(`${base}/api/borrowers/BRW-DEMO-001/investigation`,{method:'POST',headers:{'content-type':'application/json'},body:'{}'})).json();assert.ok(i.evidence.length>=5);assert.ok(i.toolsUsed.includes('get_risk_score'));
 const s=await(await fetch(`${base}/api/borrowers/BRW-DEMO-001/scenario`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({collectLargest:true})})).json();assert.ok(s.projected.score<s.current.score);
 const alerts=await(await fetch(`${base}/api/alerts`)).json();assert.ok(Array.isArray(alerts.items));
});
test('intervention endpoint validates and records a human action',async()=>{
 const bad=await fetch(`${base}/api/interventions`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({borrowerId:'missing',recommendedAction:'check'})});assert.equal(bad.status,400);
 const good=await fetch(`${base}/api/interventions`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({borrowerId:'BRW-DEMO-001',recommendedAction:'Verify outstanding invoices',assignedTo:'Credit team'})});assert.equal(good.status,201);const item=await good.json();assert.equal(item.borrowerId,'BRW-DEMO-001');
 const b=await(await fetch(`${base}/api/borrowers/BRW-DEMO-001`)).json();assert.equal(b.interventions[0].recommendedAction,'Verify outstanding invoices');
});
