import http from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDataset, summary, investigate, simulate } from './domain.mjs';
import { PortfolioRepository } from './repository.mjs';
import { SecurityStore, departments } from './security.mjs';

const root=fileURLToPath(new URL('../',import.meta.url)),publicDir=join(root,'frontend'),storeDir=process.env.DATA_STORE_DIR||join(root,'data','generated');
const config={borrowers:Number(process.env.DATA_BORROWERS??10000),months:Number(process.env.DATA_MONTHS??36),seed:Number(process.env.DATA_SEED??42)};
const dataset=createDataset(config),repository=new PortfolioRepository(dataset),security=new SecurityStore(storeDir);let interventions=[];
await mkdir(storeDir,{recursive:true});
try{interventions=JSON.parse(await readFile(join(storeDir,'interventions.json'),'utf8'));}catch{}
await security.init();
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
  if(req.method==='GET'&&p==='/api/auth/session'){const s=await security.session(req,res);if(s)res.setHeader('x-session-expires-at',new Date(s.lastSeen+security.sessionMs).toISOString());return json(res,s?200:401,s?{user:{username:s.user.username,role:s.user.role,mustChangePassword:s.user.mustChangePassword}}:{error:'Authentication required'});}
  const session=await security.session(req,res);
  if(p.startsWith('/api/')&&!session)return json(res,401,{error:'Authentication required'});
  res.setHeader('cache-control','no-store');if(session)res.setHeader('x-session-expires-at',new Date(session.lastSeen+security.sessionMs).toISOString());
  if(req.method==='GET'&&p==='/api/health')return json(res,200,{status:'ok',mode:'LOCAL_ANALYTICS_MODE',borrowers:dataset.records.length,seed:dataset.seed});
  if(req.method==='GET'&&p==='/api/auth/users'){if(!await security.requireAdmin(session))return json(res,403,{error:'Administrator access required'});return json(res,200,{items:security.users.map(u=>({username:u.username,role:u.role,active:u.active,createdAt:u.createdAt,mfaEnabled:Boolean(u.mfaSecret),mustChangePassword:u.mustChangePassword}))});}
  if(req.method==='POST'&&p==='/api/auth/users'){if(!await security.requireAdmin(session))return json(res,403,{error:'Administrator access required'});const result=await security.createUser(await body(req),session.user.username);return json(res,201,result);}
  const userAction=p.match(/^\/api\/auth\/users\/([^/]+)\/(reset|deactivate|role|mfa-reset)$/);if(userAction){if(!await security.requireAdmin(session))return json(res,403,{error:'Administrator access required'});const name=userAction[1],action=userAction[2];if(action==='reset'&&req.method==='POST')return json(res,200,await security.resetPassword(name,session.user.username));if(action==='mfa-reset'&&req.method==='POST'){await security.resetMfa(name,session.user.username);return json(res,200,{ok:true});}if(action==='deactivate'&&req.method==='POST'){await security.deactivate(name,session.user.username);return json(res,200,{ok:true});}if(action==='role'&&req.method==='PATCH'){await security.changeRole(name,(await body(req)).role,session.user.username);return json(res,200,{ok:true});}}
  if(req.method==='GET'&&p==='/api/auth/audit'){if(!await security.requireAdmin(session))return json(res,403,{error:'Administrator access required'});await security.log('audit_log_viewed',session.user.username);return json(res,200,{items:security.audit.slice(0,500)});}
  if(req.method==='GET'&&p==='/api/preferences')return json(res,200,await security.preferences(session.user.username));
  if(req.method==='PUT'&&p==='/api/preferences')return json(res,200,await security.savePreferences(session.user.username,await body(req)));
  if(req.method==='GET'&&p==='/api/intervention-eligible')return json(res,200,{items:repository.search({}).filter(x=>['HIGH','CRITICAL'].includes(x.risk.riskTier)).map(x=>({borrowerId:x.borrower.borrowerId,borrowerName:x.borrower.borrowerName,riskTier:x.risk.riskTier,exposure:x.loan.outstandingAmount}))});
  if(req.method==='GET'&&p==='/api/dashboard')return json(res,200,repository.dashboard());
  if(req.method==='GET'&&(p==='/api/portfolio'||p==='/api/borrowers')){const rows=repository.search(q);return json(res,200,repository.page(rows,q.page,q.limit));}
  if(req.method==='GET'&&p==='/api/alerts'){const rows=repository.alerts(q);return json(res,200,repository.page(rows,q.page,q.limit||50));}
  const bm=p.match(/^\/api\/borrowers\/([^/]+)$/);if(req.method==='GET'&&bm){const x=repository.getBorrower(bm[1]);if(!x)return json(res,404,{error:'Borrower not found'});const history=interventions.filter(i=>i.borrowerId===bm[1]);return json(res,200,{...x,interventions:history});}
  const inv=p.match(/^\/api\/borrowers\/([^/]+)\/investigation$/);if(req.method==='POST'&&inv){const x=repository.getBorrower(inv[1]);if(!x)return json(res,404,{error:'Borrower not found'});return json(res,200,{...investigate(x),investigationId:`INV-${Date.now()}`,createdAt:new Date().toISOString(),provider:'deterministic-fallback'});}
  const sim=p.match(/^\/api\/borrowers\/([^/]+)\/scenario$/);if(req.method==='POST'&&sim){const x=repository.getBorrower(sim[1]);if(!x)return json(res,404,{error:'Borrower not found'});const b=await body(req);return json(res,200,simulate(x,b.collectLargest!==false));}
  if(req.method==='GET'&&p==='/api/interventions')return json(res,200,{items:interventions});
  if(req.method==='POST'&&p==='/api/interventions'){const b=await body(req),borrower=repository.getBorrower(String(b.borrowerId??''));if(!borrower||!['HIGH','CRITICAL'].includes(borrower.risk.riskTier))return json(res,400,{error:'Choose an eligible High or Critical risk borrower.'});if(typeof b.recommendedAction!=='string'||b.recommendedAction.trim().length<3||b.recommendedAction.length>500)return json(res,400,{error:'Action must be 3–500 characters'});if(!departments.includes(b.assignedTo))return json(res,400,{error:'Choose one of the supported departments.'});const item={interventionId:`ACT-${Date.now()}`,borrowerId:b.borrowerId,riskEventId:b.riskEventId??null,recommendedAction:b.recommendedAction.trim(),assignedTo:b.assignedTo,actionDate:new Date().toISOString(),status:'Open',outcome:null,notes:String(b.notes??'').slice(0,1000)};interventions.unshift(item);await writeFile(join(storeDir,'interventions.json'),JSON.stringify(interventions,null,2));return json(res,201,item);}
  if(req.method==='GET'&&p.startsWith('/api/'))return json(res,404,{error:'API route not found'});
  let safe=normalize(p==='/'?(session?'index.html':'login.html'):p.slice(1)).replace(/^\.\.(?:[\\/]|$)/,'');if(safe==='index.html'&&!session)safe='login.html';if(safe==='login.html'&&session)safe='index.html';const file=join(publicDir,safe);let buf;try{buf=await readFile(file);}catch{return json(res,404,{error:'Page not found'});}const type={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml'}[extname(file)]??'application/octet-stream';res.writeHead(200,{'content-type':type,'cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'same-origin'});res.end(buf);
 }catch(e){json(res,400,{error:e instanceof SyntaxError?'Invalid JSON body':e.message||'Request failed'});}}
const server=http.createServer(route),port=Number(process.env.PORT)||3000;server.listen(port,'0.0.0.0',()=>console.log(`RuralLens running at http://localhost:${port} (${dataset.records.length} synthetic borrowers, ${dataset.months} synthetic months)`));
