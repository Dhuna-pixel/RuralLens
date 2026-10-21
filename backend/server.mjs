import http from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDataset, summary, investigate, simulate } from './domain.mjs';
import { PortfolioRepository } from './repository.mjs';

const root=fileURLToPath(new URL('../',import.meta.url)),publicDir=join(root,'frontend'),storeDir=join(root,'data','generated');
const config={borrowers:Number(process.env.DATA_BORROWERS??10000),months:Number(process.env.DATA_MONTHS??18),seed:Number(process.env.DATA_SEED??42)};
const dataset=createDataset(config),repository=new PortfolioRepository(dataset);let interventions=[];
await mkdir(storeDir,{recursive:true});
try{interventions=JSON.parse(await readFile(join(storeDir,'interventions.json'),'utf8'));}catch{}
const json=(res,status,obj)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','access-control-allow-origin':'*'});res.end(JSON.stringify(obj));};
const body=async(req)=>{let s='';for await(const c of req)s+=c;if(s.length>1_000_000)throw Error('Request body too large');return s?JSON.parse(s):{};};
async function route(req,res){const u=new URL(req.url,'http://localhost'),p=decodeURIComponent(u.pathname),q=Object.fromEntries(u.searchParams);
 try{
  if(req.method==='GET'&&p==='/api/health')return json(res,200,{status:'ok',mode:'LOCAL_ANALYTICS_MODE',borrowers:dataset.records.length,seed:dataset.seed});
  if(req.method==='GET'&&p==='/api/dashboard')return json(res,200,repository.dashboard());
  if(req.method==='GET'&&(p==='/api/portfolio'||p==='/api/borrowers')){const rows=repository.search(q);return json(res,200,repository.page(rows,q.page,q.limit));}
  if(req.method==='GET'&&p==='/api/alerts'){const rows=repository.alerts(q);return json(res,200,repository.page(rows,q.page,q.limit||50));}
  const bm=p.match(/^\/api\/borrowers\/([^/]+)$/);if(req.method==='GET'&&bm){const x=repository.getBorrower(bm[1]);if(!x)return json(res,404,{error:'Borrower not found'});const history=interventions.filter(i=>i.borrowerId===bm[1]);return json(res,200,{...x,interventions:history});}
  const inv=p.match(/^\/api\/borrowers\/([^/]+)\/investigation$/);if(req.method==='POST'&&inv){const x=repository.getBorrower(inv[1]);if(!x)return json(res,404,{error:'Borrower not found'});return json(res,200,{...investigate(x),investigationId:`INV-${Date.now()}`,createdAt:new Date().toISOString(),provider:'deterministic-fallback'});}
  const sim=p.match(/^\/api\/borrowers\/([^/]+)\/scenario$/);if(req.method==='POST'&&sim){const x=repository.getBorrower(sim[1]);if(!x)return json(res,404,{error:'Borrower not found'});const b=await body(req);return json(res,200,simulate(x,b.collectLargest!==false));}
  if(req.method==='GET'&&p==='/api/interventions')return json(res,200,{items:interventions});
  if(req.method==='POST'&&p==='/api/interventions'){const b=await body(req);if(!b.borrowerId||!dataset.records.some(x=>x.borrower.borrowerId===b.borrowerId))return json(res,400,{error:'Valid borrowerId is required'});if(typeof b.recommendedAction!=='string'||b.recommendedAction.trim().length<3||b.recommendedAction.length>500)return json(res,400,{error:'Action must be 3–500 characters'});const item={interventionId:`ACT-${Date.now()}`,borrowerId:b.borrowerId,riskEventId:b.riskEventId??null,recommendedAction:b.recommendedAction.trim(),assignedTo:String(b.assignedTo??'Credit team').slice(0,100),actionDate:new Date().toISOString(),status:'Open',outcome:null,notes:String(b.notes??'').slice(0,1000)};interventions.unshift(item);await writeFile(join(storeDir,'interventions.json'),JSON.stringify(interventions,null,2));return json(res,201,item);}
  if(req.method==='GET'&&p.startsWith('/api/'))return json(res,404,{error:'API route not found'});
  const safe=normalize(p==='/'?'index.html':p.slice(1)).replace(/^\.\.(?:[\\/]|$)/,'');const file=join(publicDir,safe);let buf;try{buf=await readFile(file);}catch{return json(res,404,{error:'Page not found'});}const type={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml'}[extname(file)]??'application/octet-stream';res.writeHead(200,{'content-type':type});res.end(buf);
 }catch(e){json(res,400,{error:e instanceof SyntaxError?'Invalid JSON body':e.message||'Request failed'});}}
const server=http.createServer(route),port=Number(process.env.PORT)||3000;server.listen(port,'0.0.0.0',()=>console.log(`RuralLens running at http://localhost:${port} (${dataset.records.length} synthetic borrowers)`));
