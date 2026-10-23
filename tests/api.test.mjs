import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { totp } from '../backend/security.mjs';

const port=31000+Math.floor(Math.random()*10000),base=`http://127.0.0.1:${port}`;
let child,store,cookieJar=new Map();
function cookieHeader(){return[...cookieJar].map(([k,v])=>`${k}=${v}`).join('; ');}
async function request(path,options={}){const headers={'content-type':'application/json',...(options.headers||{})},cookie=cookieHeader();if(cookie)headers.cookie=cookie;const r=await fetch(base+path,{cache:'no-store',...options,headers});for(const raw of (r.headers.getSetCookie?.()??[r.headers.get('set-cookie')].filter(Boolean))){const [pair,...attrs]=raw.split(';'),i=pair.indexOf('='),name=pair.slice(0,i),value=pair.slice(i+1);if(attrs.some(x=>x.trim().toLowerCase()==='max-age=0'))cookieJar.delete(name);else cookieJar.set(name,value);}return r;}
const json=async r=>r.json();
before(async()=>{
 store=await mkdtemp(join(tmpdir(),'rurallens-test-'));
 child=spawn(process.execPath,['backend/server.mjs'],{env:{...process.env,PORT:String(port),DATA_BORROWERS:'20',DATA_MONTHS:'36',DATA_SEED:'42',DATA_STORE_DIR:store,AUTH_BOOTSTRAP_TOKEN:'test-only-setup-token',LOGIN_MAX_FAILURES:'3'},stdio:'ignore'});
 for(let i=0;i<150;i++){try{const r=await fetch(`${base}/api/auth/setup-status`);if(r.ok)return;}catch{}await delay(100);}
 throw Error('API server did not start');
});
after(async()=>{child?.kill();if(store)await rm(store,{recursive:true,force:true});});

test('bootstrap is one-time, protected APIs require MFA, and admin sessions are enforced',async()=>{
 const root=await fetch(base);assert.match(await root.text(),/Sign in to RuralLens/);
 assert.equal((await fetch(`${base}/api/dashboard`)).status,401);
 assert.match(await(await fetch(`${base}/index.html`)).text(),/Sign in to RuralLens/);
 assert.equal((await json(await fetch(`${base}/api/auth/setup-status`))).setupRequired,true);
 const bad=await request('/api/auth/bootstrap',{method:'POST',body:JSON.stringify({token:'wrong',username:'admin',password:'a-very-long-password'})});assert.equal(bad.status,401);
 const boot=await request('/api/auth/bootstrap',{method:'POST',body:JSON.stringify({token:'test-only-setup-token',username:'admin',password:'correct horse battery staple'})});assert.equal(boot.status,201);
 const login=await json(await request('/api/auth/login',{method:'POST',body:JSON.stringify({username:'admin',password:'correct horse battery staple'})}));assert.equal(login.step,'mfa-setup');
 assert.ok(cookieJar.has('rl_pre'));
 const verified=await request('/api/auth/mfa/verify',{method:'POST',body:JSON.stringify({code:totp(login.secret)})});assert.equal(verified.status,200);assert.ok(cookieJar.has('rl_session'));assert.equal(cookieJar.has('rl_pre'),false);
 const session=await request('/api/auth/session');assert.equal(session.status,200,await session.clone().text());assert.equal((await json(session)).user.role,'admin');
 assert.match(await(await request('/index.html')).text(),/notification-button/);
 assert.equal((await json(await request('/api/preferences'))).compactTables,false);
 assert.equal((await json(await request('/api/preferences',{method:'PUT',body:JSON.stringify({compactTables:true})}))).compactTables,true);
 assert.equal((await json(await request('/api/auth/users'))).items.length,1);
 assert.equal((await request('/api/auth/bootstrap',{method:'POST',body:JSON.stringify({token:'test-only-setup-token',username:'another',password:'correct horse battery staple'})})).status,409);
});

test('dashboard product, risk, DPD, 36-month trend, and NPA availability data reconcile',async()=>{
 const d=await json(await request('/api/dashboard'));assert.ok(d.totalBorrowers>=20);assert.equal(d.riskTrend.length,36);assert.equal(d.productBreakdown.length,4);
 assert.equal(d.productBreakdown.reduce((s,x)=>s+x.exposure,0),d.totalExposure);
 assert.equal(d.productBreakdown.reduce((s,x)=>s+x.borrowers,0),d.totalBorrowers);
 assert.equal(d.overdueBuckets.reduce((s,x)=>s+x.exposure,0),d.overdueExposure);
 assert.equal(d.npa.available,true);assert.ok(d.npa.grossNpa>0);assert.equal(d.npa.unavailableAccounts,0);
 assert.ok(new Set(d.riskTrend.map(x=>x.averageRisk)).size>1);
 const b=await json(await request('/api/borrowers/BRW-DEMO-001'));assert.equal(b.borrower.borrowerName,'Sundar Harvest Collective');
 const investigation=await json(await request('/api/borrowers/BRW-DEMO-001/investigation',{method:'POST',body:'{}'}));assert.ok(investigation.evidence.length>=5);
 const scenario=await json(await request('/api/borrowers/BRW-DEMO-001/scenario',{method:'POST',body:JSON.stringify({collectLargest:true})}));assert.ok(scenario.projected.score<scenario.current.score);
});

test('interventions only accept eligible risky borrowers and the six departments',async()=>{
 const eligible=await json(await request('/api/intervention-eligible'));assert.ok(eligible.items.some(x=>x.borrowerId==='BRW-DEMO-001'));
 const badDepartment=await request('/api/interventions',{method:'POST',body:JSON.stringify({borrowerId:'BRW-DEMO-001',recommendedAction:'Verify outstanding invoices',assignedTo:'Credit team'})});assert.equal(badDepartment.status,400);
 await request('/api/auth/users',{method:'POST',body:JSON.stringify({username:'credit.member',role:'employee',teamId:'Credit'})});
 const good=await request('/api/interventions',{method:'POST',body:JSON.stringify({borrowerId:'BRW-DEMO-001',recommendedAction:'Verify outstanding invoices',assignedTo:'Credit',assignedMember:'credit.member'})});assert.equal(good.status,201);const action=await json(good);assert.equal(action.assignedTo,'Credit');
 const borrower=await json(await request('/api/borrowers/BRW-DEMO-001'));assert.equal(borrower.interventions[0].recommendedAction,'Verify outstanding invoices');
});

test('portfolio APIs expose persisted provisioning, filtering, recovery and audit',async()=>{
 for(const path of ['/api/portfolio/provisioning-summary','/api/regulatory-rules','/api/borrowers/BRW-DEMO-001/provisioning'])assert.equal((await fetch(base+path)).status,401);
 const summary=await json(await request('/api/portfolio/provisioning-summary'));assert.ok(summary.grossNpa>0);assert.equal(summary.netNpa,null);
 const npa=await json(await request('/api/portfolio?classification=NPA&sort=dpd&limit=100'));assert.ok(npa.items.length>0);assert.ok(npa.items.every(x=>x.provisioning.isNpa));for(let i=1;i<npa.items.length;i++)assert.ok(npa.items[i-1].provisioning.daysPastDue>=npa.items[i].provisioning.daysPastDue);
 const id='BRW-DEMO-002',b={actionType:'OTS',stage:'Demo proposal',status:'Planned',current:true,actionDate:'2026-10-01',effectiveDate:'2026-10-01',amountRecovered:0,amountOutstanding:100,responsibleDepartment:'Recovery',owner:'Test owner',notes:'Synthetic demo only',source:'Test'};
 assert.equal((await request('/api/borrowers/missing/recovery-actions',{method:'POST',body:JSON.stringify(b)})).status,404);
 assert.equal((await request(`/api/borrowers/${id}/recovery-actions`,{method:'POST',body:JSON.stringify({...b,actionType:'bad'})})).status,400);
 const created=await request(`/api/borrowers/${id}/recovery-actions`,{method:'POST',body:JSON.stringify(b)});assert.equal(created.status,201,await created.clone().text());const action=await json(created);
 assert.equal((await request(`/api/borrowers/${id}/recovery-actions`,{method:'POST',body:JSON.stringify(b)})).status,409);
 assert.equal((await request(`/api/recovery-actions/${action.id}`,{method:'PATCH',body:JSON.stringify({status:'Withdrawn'})})).status,200);
 const history=await json(await request(`/api/borrowers/${id}/recovery-actions`));assert.equal(history.current,null);assert.equal(history.items.length,1);
 const provision=await json(await request(`/api/borrowers/${id}/provisioning`));assert.ok(provision.available);assert.ok(provision.inputs);
 const audit=await json(await request('/api/auth/audit'));assert.ok(audit.items.some(a=>a.event==='recovery_action_changed'));assert.ok(audit.items.some(a=>a.event==='provisioning_calculated'));
});

test('account settings persist and analysis endpoints validate assumptions and record reports',async()=>{
 const original=await json(await request('/api/preferences'));
 const preferences={theme:'dark',textSize:'large',reducedMotion:true,numberFormat:'full',landingPage:'home',pageSize:25,portfolioSort:'dpd',notifyRisk:false,notifyInterventions:false};
 const saved=await request('/api/preferences',{method:'PUT',body:JSON.stringify(preferences)});assert.equal(saved.status,200);assert.equal((await json(saved)).compactTables,original.compactTables);
 const reread=await json(await request('/api/preferences'));for(const[k,v]of Object.entries(preferences))assert.equal(reread[k],v);
 for(const patch of [{theme:'blue'},{pageSize:1000},{notifyRisk:'no'},{password:'unsafe'}])assert.equal((await request('/api/preferences',{method:'PUT',body:JSON.stringify(patch)})).status,400);
 assert.equal((await request('/api/preferences',{method:'PUT',body:JSON.stringify(original)})).status,200);
 const id='BRW-DEMO-001';assert.equal((await request(`/api/borrowers/${id}/scenario`,{method:'POST',body:JSON.stringify({collectionPercent:150})})).status,400);
 const scenario=await json(await request(`/api/borrowers/${id}/scenario`,{method:'POST',body:JSON.stringify({collectionPercent:80,cashflowImprovement:10,paymentRatio:95})}));assert.ok(scenario.reportId);assert.ok(scenario.projected.components);assert.equal(scenario.assumptions.collectionPercent,80);
 const inv=await json(await request(`/api/borrowers/${id}/investigation`,{method:'POST',body:'{}'}));assert.ok(inv.reportId);assert.ok(inv.method);assert.ok(inv.evidence.some(e=>e.label==='Asset classification'));
 const history=await json(await request(`/api/borrowers/${id}/analyses`));assert.ok(history.items.some(r=>r.id===scenario.reportId));assert.ok(history.items.some(r=>r.id===inv.reportId));assert.equal((await fetch(base+`/api/borrowers/${id}/analyses`)).status,401);
});

test('team directory, renaming, membership and intervention validation are integrated',async()=>{
 const directory=await json(await request('/api/teams'));assert.equal(directory.teams.find(t=>t.id==='IT').members.some(u=>u.username==='admin'),true);assert.ok(directory.teams.find(t=>t.id==='Credit').members.some(u=>u.username==='credit.member'));assert.equal(JSON.stringify(directory).includes('passwordHash'),false);
 assert.equal((await request('/api/teams/Credit',{method:'PATCH',body:JSON.stringify({name:'Credit Review',description:'Credit review team'})})).status,200);
 assert.equal((await json(await request('/api/teams'))).teams.find(t=>t.id==='Credit').name,'Credit Review');
 assert.equal((await request('/api/teams/Credit',{method:'PATCH',body:JSON.stringify({name:'Business'})})).status,400);
 const created=await json(await request('/api/auth/users',{method:'POST',body:JSON.stringify({username:'unassigned.member',role:'employee'})}));assert.ok(created.user);
 assert.ok((await json(await request('/api/teams'))).unassigned.some(u=>u.username==='unassigned.member'));
 const action={borrowerId:'BRW-DEMO-001',recommendedAction:'Review loan records',teamId:'Credit',assignedMember:'unassigned.member'};
 assert.equal((await request('/api/interventions',{method:'POST',body:JSON.stringify(action)})).status,400);
 assert.equal((await request('/api/team-members/unassigned.member',{method:'PUT',body:JSON.stringify({teamId:'Credit'})})).status,200);
 const assigned=await request('/api/interventions',{method:'POST',body:JSON.stringify(action)});assert.equal(assigned.status,201,await assigned.clone().text());assert.equal((await json(assigned)).teamName,'Credit Review');
 assert.equal((await request('/api/interventions',{method:'POST',body:JSON.stringify({...action,assignedMember:'admin'})})).status,400);
 const history=await json(await request('/api/interventions'));assert.equal(history.total,history.items.length);assert.ok(history.items.some(a=>a.assignedMember==='unassigned.member'));
 assert.equal((await request('/api/team-members/missing',{method:'PUT',body:JSON.stringify({teamId:'Credit'})})).status,404);
});

test('administrator can provision, reset, change role, and deactivate accounts',async()=>{
 const created=await json(await request('/api/auth/users',{method:'POST',body:JSON.stringify({username:'employee.one',role:'employee'})}));assert.equal(created.user.mustChangePassword,true);assert.ok(created.temporaryPassword);
 assert.equal((await request('/api/auth/users/employee.one/role',{method:'PATCH',body:JSON.stringify({role:'admin'})})).status,200);
 const reset=await json(await request('/api/auth/users/employee.one/reset',{method:'POST',body:'{}'}));assert.ok(reset.temporaryPassword);
 assert.equal((await request('/api/auth/users/employee.one/mfa-reset',{method:'POST',body:'{}'})).status,200);
 assert.equal((await request('/api/auth/users/employee.one/deactivate',{method:'POST',body:'{}'})).status,200);
 const audit=await json(await request('/api/auth/audit'));for(const event of ['account_created','role_changed','password_reset','mfa_reset','account_deactivated'])assert.ok(audit.items.some(x=>x.event===event));
 const employee=await json(await request('/api/auth/users',{method:'POST',body:JSON.stringify({username:'employee.two',role:'employee'})}));const adminCookies=new Map(cookieJar);cookieJar.clear();
 const firstLogin=await json(await request('/api/auth/login',{method:'POST',body:JSON.stringify({username:'employee.two',password:employee.temporaryPassword})}));assert.equal(firstLogin.step,'password-change');
 const changed=await json(await request('/api/auth/password-change',{method:'POST',body:JSON.stringify({newPassword:'employee two changed password'})}));assert.equal(changed.step,'mfa-setup');
 assert.equal((await request('/api/auth/mfa/verify',{method:'POST',body:JSON.stringify({code:totp(changed.secret)})})).status,200);const employeeCookies=new Map(cookieJar);
 assert.equal((await request('/api/auth/users')).status,403);assert.equal((await request('/api/teams/Credit',{method:'PATCH',body:JSON.stringify({name:'Not allowed'})})).status,403);assert.equal((await request('/api/team-members/employee.two',{method:'PUT',body:JSON.stringify({teamId:'Risk'})})).status,403);assert.equal((await request('/api/teams')).status,200);
 cookieJar=adminCookies;assert.equal((await request('/api/auth/users/employee.two/deactivate',{method:'POST',body:'{}'})).status,200);
 cookieJar=employeeCookies;assert.equal((await request('/api/dashboard')).status,401);
});
test('repeated failed logins receive a temporary lockout with generic messages',async()=>{
 const messages=[];for(let i=0;i<3;i++){const r=await request('/api/auth/login',{method:'POST',body:JSON.stringify({username:'unlisted.user',password:'incorrect'})});messages.push((await json(r)).error);assert.equal(r.status,401);}
 assert.equal(new Set(messages).size,1);
 const locked=await request('/api/auth/login',{method:'POST',body:JSON.stringify({username:'unlisted.user',password:'incorrect'})});assert.equal(locked.status,429);
});
