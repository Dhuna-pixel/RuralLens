import { transitionIntervention, canViewIntervention, interventionTiming, migrateCompletedIntervention } from './interventions.mjs';
import { TeamStore } from './teams.mjs';
import { randomUUID } from 'node:crypto';
import { AnalysisStore, investigationReport } from './analysis.mjs';
import http from 'node:http';
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDataset, summary, simulate } from './domain.mjs';
import {exasolConfig,ExasolConnection} from './exasol/connection.mjs';
import {ExasolRepository} from './exasol/repository.mjs';
import { PortfolioRepository } from './repository.mjs';
import { PortfolioStore } from './portfolio-store.mjs';
import { ACTIONS, STATUSES } from './recovery.mjs';
import { SecurityStore, departments } from './security.mjs';

const root=fileURLToPath(new URL('../',import.meta.url)),publicDir=join(root,'frontend'),storeDir=process.env.DATA_STORE_DIR||join(root,'data','generated');
const config={borrowers:Number(process.env.DATA_BORROWERS??10000),months:Number(process.env.DATA_MONTHS??36),seed:Number(process.env.DATA_SEED??42)};
let savedDatabaseConfig={};try{savedDatabaseConfig=JSON.parse(await readFile(join(storeDir,'exasol-connection.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
const dataMode=(process.env.DATA_MODE||(savedDatabaseConfig.enabled?'exasol':'local')).toLowerCase();if(!['local','exasol'].includes(dataMode))throw Error('DATA_MODE must be local or exasol');
let databaseConnection,repository,dataset;
if(dataMode==='exasol'){databaseConnection=await new ExasolConnection(await exasolConfig({...process.env,EXASOL_CONFIG_FILE:process.env.EXASOL_CONFIG_FILE||join(storeDir,'exasol-connection.json')})).start();try{repository=await ExasolRepository.load(databaseConnection);dataset=repository.dataset;}catch(e){databaseConnection.close();throw e;}}else{dataset=createDataset(config);repository=new PortfolioRepository(dataset);}
const security=new SecurityStore(storeDir);let interventions=[];
await mkdir(storeDir,{recursive:true});
try{interventions=JSON.parse(await readFile(join(storeDir,'interventions.json'),'utf8'));}catch{}
const migrated=interventions.map(migrateCompletedIntervention);if(migrated.some((item,i)=>item!==interventions[i])){interventions=migrated;await writeFile(join(storeDir,'interventions.json'),JSON.stringify(interventions,null,2));}
await security.init();
const teams=new TeamStore(storeDir,security);await teams.init();
let interventionQueue=Promise.resolve();
const interventionView=item=>({...item,...interventionTiming(item),teamId:item.teamId??item.assignedTo,teamName:teams.label(item.teamId??item.assignedTo),assignedMember:item.assignedMember??null});
const analyses=new AnalysisStore(storeDir);await analyses.init();
const portfolio=new PortfolioStore(storeDir,dataset,security);
await portfolio.init({enabled:dataMode==='local'&&process.env.NPA_DEMO_ENABLED!=='false',minScenarios:Number(process.env.NPA_DEMO_SCENARIOS??12)});

if(dataMode==='exasol')await repository.refreshScores();

const json=(res,status,obj)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(obj));};
const body=async(req)=>{let s='';for await(const c of req)s+=c;if(s.length>1_000_000)throw Error('Request body too large');return s?JSON.parse(s):{};};
async function route(req,res){const u=new URL(req.url,'http://localhost'),p=decodeURIComponent(u.pathname),q=Object.fromEntries(u.searchParams);
 try{
  if(req.method==='POST'&&p==='/api/auth/login'){const result=await security.login(req,res,await body(req));return json(res,result.status,result);}
  if(req.method==='GET'&&p==='/api/auth/setup-status')return json(res,200,{setupRequired:security.users.length===0});
  if(req.method==='POST'&&p==='/api/auth/bootstrap'){const result=await security.bootstrap(await body(req));return json(res,result.status,result);}
  if(req.method==='POST'&&p==='/api/auth/password-change'){const result=await security.setPassword(req,res,await body(req));return json(res,result.status,result);}
  if(req.method==='POST'&&p==='/api/auth/mfa/verify'){const result=await security.verifyMfa(req,res,await body(req));return json(res,result.status,result);}
  if(req.method==='POST'&&p==='/api/auth/logout')return json(res,200,await security.logout(req,res));
  if(req.method==='GET'&&p==='/api/auth/session'){const s=await security.session(req,res);if(s)res.setHeader('x-session-expires-at',new Date(s.lastSeen+security.sessionMs).toISOString());return json(res,s?200:401,s?{user:{username:s.user.username,role:s.user.role,mustChangePassword:s.user.mustChangePassword,teamId:teams.membership(s.user),teamName:teams.label(teams.membership(s.user))}}:{error:'Authentication required'});}
  const session=await security.session(req,res);
  if(p.startsWith('/api/')&&!session)return json(res,401,{error:'Authentication required'});
  res.setHeader('cache-control','no-store');if(session)res.setHeader('x-session-expires-at',new Date(session.lastSeen+security.sessionMs).toISOString());
  if(req.method==='GET'&&p==='/api/health'){if(databaseConnection)await databaseConnection.query('SELECT 1 AS CONNECTED');return json(res,200,{status:'ok',mode:dataMode==='exasol'?'EXASOL':'LOCAL_ANALYTICS_MODE',borrowers:dataset.records.length,seed:dataset.seed});}
  if(req.method==='GET'&&p==='/api/auth/users'){if(!teams.isIT(session.user))return json(res,403,{error:'Administrator access required'});return json(res,200,{items:security.users.map(u=>({username:u.username,role:u.role,active:u.active,createdAt:u.createdAt,mfaEnabled:Boolean(u.mfaSecret),mustChangePassword:u.mustChangePassword}))});}
  if(req.method==='POST'&&p==='/api/auth/users'){if(!teams.isIT(session.user))return json(res,403,{error:'Administrator access required'});const b=await body(req);if(b.teamId!==undefined)teams.validateTeam(b.teamId,{nullable:true});const result=await security.createUser(b,session.user.username);if(b.teamId!==undefined)await teams.assign(result.user.username,b.teamId,session.user.username);return json(res,201,result);}
  const deleteUser=p.match(/^\/api\/auth\/users\/([^/]+)$/);if(req.method==='DELETE'&&deleteUser){if(!teams.isIT(session.user))return json(res,403,{error:'Administrator access required'});await security.deleteAccount(deleteUser[1],session.user.username);await teams.removeMember(deleteUser[1]);return json(res,200,{ok:true});}
  const userAction=p.match(/^\/api\/auth\/users\/([^/]+)\/(reset|deactivate|role|mfa-reset)$/);if(userAction){if(!teams.isIT(session.user))return json(res,403,{error:'Administrator access required'});const name=userAction[1],action=userAction[2];if(action==='reset'&&req.method==='POST')return json(res,200,await security.resetPassword(name,session.user.username));if(action==='mfa-reset'&&req.method==='POST'){await security.resetMfa(name,session.user.username);return json(res,200,{ok:true});}if(action==='deactivate'&&req.method==='POST'){await security.deactivate(name,session.user.username);return json(res,200,{ok:true});}if(action==='role'&&req.method==='PATCH'){await security.changeRole(name,(await body(req)).role,session.user.username);return json(res,200,{ok:true});}}
  if(req.method==='GET'&&p==='/api/teams')return json(res,200,teams.directory());
  const headRoute=p.match(/^\/api\/teams\/([^/]+)\/head$/);if(req.method==='PUT'&&headRoute){const b=await body(req);if(!b||Object.keys(b).length!==1||!Object.hasOwn(b,'username'))return json(res,400,{error:'Provide a username or null'});return json(res,200,await teams.setHead(headRoute[1],b.username,session.user.username));}
  const teamRoute=p.match(/^\/api\/teams\/([^/]+)$/);if(req.method==='PATCH'&&teamRoute){if(!teams.isIT(session.user))return json(res,403,{error:'Administrator access required'});return json(res,200,await teams.rename(teamRoute[1],await body(req),session.user.username));}
  const membershipRoute=p.match(/^\/api\/team-members\/([^/]+)$/);if(req.method==='PUT'&&membershipRoute){if(!teams.isIT(session.user))return json(res,403,{error:'Administrator access required'});const b=await body(req);if(!b||Object.keys(b).length!==1||!Object.hasOwn(b,'teamId'))return json(res,400,{error:'Provide a teamId or null for Unassigned'});return json(res,200,await teams.assign(membershipRoute[1],b.teamId,session.user.username));}
  if(req.method==='GET'&&p==='/api/auth/audit'){if(!teams.isIT(session.user))return json(res,403,{error:'Administrator access required'});await security.log('audit_log_viewed',session.user.username);return json(res,200,{items:security.audit.slice(0,500)});}
  if(req.method==='GET'&&p==='/api/preferences')return json(res,200,await security.preferences(session.user.username));
  if(req.method==='PUT'&&p==='/api/preferences')return json(res,200,await security.savePreferences(session.user.username,await body(req)));
  if(req.method==='GET'&&p==='/api/intervention-eligible')return json(res,200,{items:(await repository.search({})).filter(x=>['HIGH','CRITICAL'].includes(x.risk.riskTier)).map(x=>({borrowerId:x.borrower.borrowerId,borrowerName:x.borrower.borrowerName,riskTier:x.risk.riskTier,exposure:x.loan.outstandingAmount}))});
  if(req.method==='GET'&&p==='/api/dashboard')return json(res,200,{...await repository.dashboard(),npa:{available:true,...portfolio.summary()}});
  if(req.method==='GET'&&p==='/api/portfolio/provisioning-summary')return json(res,200,portfolio.summary());
  if(req.method==='GET'&&p==='/api/portfolio/recovery-summary')return json(res,200,portfolio.summary().recoveryDistribution);
  if(req.method==='GET'&&p==='/api/regulatory-rules')return json(res,200,{...portfolio.config,actionCatalogue:ACTIONS,statuses:STATUSES});
  if(req.method==='PUT'&&p==='/api/regulatory-rules/active'){if(!teams.isIT(session.user))return json(res,403,{error:'Administrator access required'});const b=await body(req);return json(res,200,await portfolio.selectProfile(b.profileId,session.user.username));}
  const detail=p.match(/^\/api\/borrowers\/([^/]+)\/(provisioning|recovery-actions)$/);
  if(detail){const id=detail[1],x=await repository.getBorrower(id);if(!x)return json(res,404,{error:'Borrower not found'});
   if(req.method==='GET'&&detail[2]==='provisioning'){portfolio.refresh();await security.log('provisioning_calculated',session.user.username,{borrowerId:id,calculation:x.provisioning});return json(res,200,x.provisioning);}
   if(req.method==='GET'&&detail[2]==='recovery-actions')return json(res,200,{items:portfolio.list(id),current:x.currentRecoveryAction});
   if(req.method==='POST'&&detail[2]==='recovery-actions')return json(res,201,await portfolio.mutate(id,await body(req),session.user.username));
  }
  const recoveryPatch=p.match(/^\/api\/recovery-actions\/([^/]+)$/);
  if(req.method==='PATCH'&&recoveryPatch){const action=portfolio.actions.find(a=>a.id===recoveryPatch[1]);if(!action)return json(res,404,{error:'Recovery action not found'});return json(res,200,await portfolio.mutate(action.borrowerId,await body(req),session.user.username,action.id));}
  if(req.method==='GET'&&(p==='/api/portfolio'||p==='/api/borrowers')){portfolio.refresh();const rows=await repository.search(q);return json(res,200,repository.page(rows,q.page,q.limit));}
  if(req.method==='GET'&&p==='/api/alerts'){const rows=await repository.alerts(q);return json(res,200,repository.page(rows,q.page,q.limit||50));}
  const bm=p.match(/^\/api\/borrowers\/([^/]+)$/);if(req.method==='GET'&&bm){const x=await repository.getBorrower(bm[1]);if(!x)return json(res,404,{error:'Borrower not found'});const history=interventions.filter(i=>i.borrowerId===bm[1]&&canViewIntervention(i,teams.membership(session.user))).map(interventionView);portfolio.refresh();await security.log('provisioning_calculated',session.user.username,{borrowerId:bm[1],calculation:x.provisioning});return json(res,200,{...x,recoveryActions:portfolio.list(bm[1]),interventions:history});}
  const inv=p.match(/^\/api\/borrowers\/([^/]+)\/investigation$/);if(req.method==='POST'&&inv){const x=await repository.getBorrower(inv[1]);if(!x)return json(res,404,{error:'Borrower not found'});portfolio.refresh();const report=await analyses.save(inv[1],'investigation',investigationReport(x),session.user.username);await security.log('investigation_completed',session.user.username,{borrowerId:inv[1],reportId:report.id});return json(res,200,{...report.result,reportId:report.id,investigationId:report.id,createdAt:report.createdAt,provider:'deterministic-fallback'});}
  const sim=p.match(/^\/api\/borrowers\/([^/]+)\/scenario$/);if(req.method==='POST'&&sim){const x=await repository.getBorrower(sim[1]);if(!x)return json(res,404,{error:'Borrower not found'});const b=await body(req);portfolio.refresh();const report=await analyses.save(sim[1],'scenario',simulate(x,b),session.user.username);await security.log('scenario_completed',session.user.username,{borrowerId:sim[1],reportId:report.id,assumptions:report.result.assumptions});return json(res,200,{...report.result,reportId:report.id,createdAt:report.createdAt});}
  const analysisHistory=p.match(/^\/api\/borrowers\/([^/]+)\/analyses$/);if(req.method==='GET'&&analysisHistory){if(!(await repository.getBorrower(analysisHistory[1])))return json(res,404,{error:'Borrower not found'});return json(res,200,{items:analyses.list(analysisHistory[1])});}
  if(req.method==='GET'&&p==='/api/interventions'){const teamId=teams.membership(session.user),rows=interventions.filter(i=>canViewIntervention(i,teamId));return json(res,200,{items:rows.map(interventionView),total:rows.length,canAssign:teamId==='CXO',teamId,username:session.user.username,isHead:teams.isHead(session.user)});}
  const interventionPatch=p.match(/^\/api\/interventions\/([^/]+)$/);
  if(req.method==='PATCH'&&interventionPatch){const b=await body(req);const operation=interventionQueue.then(async()=>{const index=interventions.findIndex(i=>i.interventionId===interventionPatch[1]);if(index<0)throw Object.assign(Error('Task not found'),{status:404});const updated=transitionIntervention(interventions[index],b,session.user.username,teams.membership(session.user),teams),next=interventions.map((item,i)=>i===index?updated:item),path=join(storeDir,'interventions.json');await writeFile(path+'.tmp',JSON.stringify(next,null,2));await rename(path+'.tmp',path);interventions=next;await security.log('intervention_updated',session.user.username,{interventionId:updated.interventionId,status:updated.status});return interventionView(updated);});interventionQueue=operation.catch(()=>{});return json(res,200,await operation);}
  if(req.method==='POST'&&p==='/api/interventions'){
   if(teams.membership(session.user)!=='CXO')return json(res,403,{error:'Only CXO can assign tasks'});
   const b=await body(req),borrower=await repository.getBorrower(String(b.borrowerId??''));
   if(!borrower||!['HIGH','CRITICAL'].includes(borrower.risk.riskTier))return json(res,400,{error:'Choose an eligible High or Critical risk borrower.'});
   if(typeof b.recommendedAction!=='string'||b.recommendedAction.trim().length<3||b.recommendedAction.length>500)return json(res,400,{error:'Action must be 3–500 characters'});
   const teamId=b.teamId??b.assignedTo;teams.validateTeam(teamId,{assignable:true});
   if(b.assignedMember!=null&&b.assignedMember!=='')return json(res,400,{error:'CXO assigns tasks to teams only. The department head assigns the member.'});
   const operation=interventionQueue.then(async()=>{const item={interventionId:`ACT-${randomUUID()}`,borrowerId:b.borrowerId,riskEventId:b.riskEventId??null,recommendedAction:b.recommendedAction.trim(),assignedTo:teamId,teamId,assignedMember:null,createdBy:session.user.username,actionDate:new Date().toISOString(),status:'Open',outcome:null,notes:String(b.notes??'').slice(0,1000)},next=[item,...interventions];const path=join(storeDir,'interventions.json');await writeFile(path+'.tmp',JSON.stringify(next,null,2));await rename(path+'.tmp',path);interventions=next;await security.log('intervention_created',session.user.username,{interventionId:item.interventionId,borrowerId:item.borrowerId,teamId,assignedMember:item.assignedMember});return interventionView(item);});interventionQueue=operation.catch(()=>{});return json(res,201,await operation);
  }
  if(req.method==='GET'&&p.startsWith('/api/'))return json(res,404,{error:'API route not found'});
  let safe=normalize(p==='/'?(session?'index.html':'login.html'):p.slice(1)).replace(/^\.\.(?:[\\/]|$)/,'');if(safe==='index.html'&&!session)safe='login.html';if(safe==='login.html'&&session)safe='index.html';const file=join(publicDir,safe);let buf;try{buf=await readFile(file);}catch{return json(res,404,{error:'Page not found'});}const type={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml'}[extname(file)]??'application/octet-stream';res.writeHead(200,{'content-type':type,'cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'same-origin'});res.end(buf);
 }catch(e){json(res,e.status??400,{error:e instanceof SyntaxError?'Invalid JSON body':e.message||'Request failed'});}}
const server=http.createServer(route);server.on('close',()=>databaseConnection?.close());process.on('SIGTERM',()=>server.close(()=>process.exit(0)));
const port=Number(process.env.PORT)||3000;server.listen(port,'0.0.0.0',()=>console.log(`RuralLens running at http://localhost:${port} (${dataset.records.length} synthetic borrowers, ${dataset.months} synthetic months)`));
