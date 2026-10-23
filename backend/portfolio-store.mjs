import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { defaultRules, validateRules, provision, today, addMonths, daysBetween, moneyRound } from './provisioning.mjs';
import { scoreFeatures } from './domain.mjs';
import { ACTIONS, STATUSES, TERMINAL, changeAction, validateAction } from './recovery.mjs';
const scenarioActions={'New NPA':'SARFAESI','Near sub-standard threshold':'DRT','Doubtful first period':'IBC','Doubtful second period':'CIVIL_COURT','Doubtful third period':'LOK_ADALAT','Loss assessment':'SECTION_138_NI_ACT','Unsecured NPA':'WILFUL_DEFAULTER','Partial recovery':'CRIMINAL_ACTION','Active recovery':'ARC','Proposed OTS':'OTS'};
const shift=(date,days)=>new Date(Date.parse(date)+days*86400000).toISOString().slice(0,10);
async function readJson(path,fallback){try{return JSON.parse(await readFile(path,'utf8'));}catch(e){if(e.code==='ENOENT')return fallback;throw Error(`Cannot read ${path}: ${e.message}`);}}
async function atomic(path,data){const tmp=`${path}.tmp`;await writeFile(tmp,JSON.stringify(data,null,2),{mode:0o600});await rename(tmp,path);}
export function initialState(record,config,asOf,scenario=null){
 if(record.isSynthetic!==true)throw Error('Synthetic initialization cannot modify real borrower data');
 const p=config.profiles.find(x=>x.id===config.activeProfileId),n=record.loan.outstandingAmount,id=record.borrower.borrowerId;
 const hash=parseInt(createHash('sha256').update(`${id}:${record.loan.loanId}`).digest('hex').slice(0,8),16);
 const dpd=scenario?.dpd??Math.max(...record.repayments.map(x=>x.daysPastDue)),since=scenario?.months!==undefined?addMonths(asOf,-scenario.months):dpd>90?shift(asOf,-(dpd-91)):null;
 const actualDpd=scenario?.months!==undefined?daysBetween(since,asOf)+91:dpd,interest=Math.round(n*.02),secured=scenario?.unsecured?0:Math.round(n*(.4+(hash%40)/100));
 const overdue=actualDpd?Math.round(n*Math.min(.7,.01+actualDpd/3000)):0;
 const state={borrowerId:id,loanId:record.loan.loanId,portfolioId:'LOCAL',isSynthetic:true,entityType:p.entityType,layer:p.layer,standardCategory:'OTHER',principalOutstanding:n-interest,interestOutstanding:interest,totalOutstanding:n,originalLoanAmount:record.loan.disbursedAmount,securedOutstanding:secured,unsecuredOutstanding:n-secured,securityRealizableValue:Math.round(secured*.9),collateralType:secured?'Synthetic equipment / receivables':'Unsecured',daysPastDue:actualDpd,npaSince:since,overduePrincipal:Math.max(0,overdue-interest),overdueInterest:Math.min(interest,overdue),borrowerArrears:overdue,lastPaymentDate:shift(asOf,-Math.min(actualDpd,30)),existingProvision:0,lossIdentified:scenario?.loss??false,lossReason:scenario?.loss?'Synthetic non-recoverability assessment':null,lossIdentifiedAt:scenario?.loss?asOf:null,scenario:scenario?.name??null,demoActionType:scenario?.action??scenarioActions[scenario?.name]??null,createdAt:new Date().toISOString()};
 if(scenario?.upgrade){state.daysPastDue=0;state.overduePrincipal=state.overdueInterest=state.borrowerArrears=0;state.lastPaymentDate=asOf;}
 const calc=provision(state,config,asOf);state.existingProvision=moneyRound((calc.requiredProvision??0)*([.6,1,1.1][hash%3]));return state;
}
export const SCENARIOS=[{name:'New NPA',dpd:91},{name:'Near sub-standard threshold',months:17},{name:'Doubtful first period',months:20},{name:'Doubtful second period',months:36},{name:'Doubtful third period',months:60},{name:'Loss assessment',months:24,loss:true},{name:'Unsecured NPA',months:4,unsecured:true},{name:'Partial recovery',months:8},{name:'NPA without recovery',months:3},{name:'Active recovery',months:7},{name:'Proposed OTS',months:9},{name:'Arrears fully cleared',months:2,upgrade:true}];
export class PortfolioStore{
 constructor(dir,dataset,security){this.dir=dir;this.dataset=dataset;this.security=security;this.records=new Map(dataset.records.map(x=>[x.borrower.borrowerId,x]));this.queue=Promise.resolve();}
 serial(fn){const run=this.queue.then(fn);this.queue=run.catch(()=>{});return run;}
 async init({enabled=true,minScenarios=12}={}){
 await mkdir(this.dir,{recursive:true});this.config=validateRules(await readJson(join(this.dir,'provisioning-rules.json'),defaultRules()));this.asOf=today();
 this.states=await readJson(join(this.dir,'loan-provisioning.json'),{});const report={existingAccounts:this.dataset.records.length,existingProvisioningStates:Object.keys(this.states).length,missingCategories:[],addedScenarios:[]};
 // Fill only absent synthetic account states. Never change stored/manual inputs.
 for(const r of this.dataset.records){const id=r.borrower.borrowerId;if(!this.states[id]&&r.isSynthetic===true)this.states[id]=initialState(r,this.config,this.asOf);}
 const counts={};for(const s of Object.values(this.states)){const c=provision(s,this.config,this.asOf);if(c.available)counts[c.assetClassification]=(counts[c.assetClassification]??0)+1;}
 report.before=counts;report.missingCategories=['Standard','SMA-0','SMA-1','SMA-2','Sub-standard','Doubtful','Loss'].filter(k=>!counts[k]);
 this.actions=await readJson(join(this.dir,'recovery-actions.json'),[]);
 const coverage=[{name:'Performing',dpd:0},{name:'Early arrears',dpd:15},{name:'Moderate arrears',dpd:45},{name:'Near NPA',dpd:75},...SCENARIOS,...Object.keys(ACTIONS).map(action=>({name:`Catalogue ${action}`,months:6,action}))];
 if(enabled){for(const scenario of coverage.filter((s,i)=>i<4+Math.max(0,Math.min(12,minScenarios))||i>=16)){
 const already=Object.values(this.states).some(s=>s.scenario===scenario.name);const category=scenario.dpd===0?'Standard':scenario.dpd===15?'SMA-0':scenario.dpd===45?'SMA-1':scenario.dpd===75?'SMA-2':null;
 if(already||(category&&counts[category]))continue;
 if(scenario.action&&(this.actions.some(a=>a.actionType===scenario.action)||Object.values(this.states).some(s=>s.scenario===`Catalogue ${scenario.action}`||s.demoActionType===scenario.action)))continue;
 const key=createHash('sha256').update(`${this.dataset.seed}:${scenario.name}`).digest('hex').slice(0,8),id=`BRW-NPA-DEMO-${key}`;
 if(this.records.has(id)&&!this.states[id]?.scenario)throw Error('Synthetic borrower identifier collision');
 const template=structuredClone(this.dataset.records[parseInt(key,16)%this.dataset.records.length]);template.borrower={...template.borrower,borrowerId:id,borrowerName:`Demo NPA — ${scenario.name}`,archetype:`Synthetic NPA coverage: ${scenario.name}`};template.loan={...template.loan,loanId:`LN-NPA-DEMO-${key}`};
 if(!this.states[id]){this.states[id]=initialState(template,this.config,this.asOf,scenario);report.addedScenarios.push(id);}
 this.records.set(id,template);
 }}
 // Restore supplemental accounts from persisted state even if generation was disabled.
 for(const s of Object.values(this.states)){if(!this.records.has(s.borrowerId)&&s.isSynthetic&&s.scenario&&s.borrowerId.startsWith('BRW-NPA-DEMO-')){const r=structuredClone(this.dataset.records[parseInt(s.borrowerId.slice(-8),16)%this.dataset.records.length]);r.borrower={...r.borrower,borrowerId:s.borrowerId,borrowerName:`Demo NPA — ${s.scenario}`,archetype:`Synthetic NPA coverage: ${s.scenario}`};r.loan={...r.loan,loanId:s.loanId};this.records.set(s.borrowerId,r);}}
 const activeStates=[...this.records.keys()].map(id=>this.states[id]).filter(Boolean);
 for(const s of activeStates){const r=this.records.get(s.borrowerId);r.loan.outstandingAmount=s.totalOutstanding;r.loan.provisioningState=s;r.provisioning=provision(s,this.config,this.asOf);
 if(s.scenario){
 r.loan.disbursedAmount=s.originalLoanAmount;r.loan.sanctionedAmount=Math.max(s.originalLoanAmount,s.totalOutstanding);
 r.borrower.vintageMonths=Math.max(r.borrower.vintageMonths,Math.ceil((s.daysPastDue+120)/30));
 const overdue=s.overduePrincipal+s.overdueInterest,interval=Math.min(30,Math.floor(s.daysPastDue/6));
 r.repayments=Array.from({length:6},(_,i)=>{const dpd=Math.max(0,s.daysPastDue-i*interval),due=overdue?i===5?overdue-5*Math.floor(overdue/6):Math.floor(overdue/6):Math.round(s.totalOutstanding/24);return{dueDate:shift(this.asOf,-dpd),dueAmount:due,paidAmount:overdue?0:due,daysPastDue:dpd,paymentStatus:overdue?'Late':'Paid'};});
 if(r.provisioning.isNpa){const f={...r.risk.features,dpd30:3,dpd60:2,missed:3,paymentRatio90:.3},score=scoreFeatures(f);r.risk={...r.risk,...score,features:f,riskChange:moneyRound(score.overallScore-r.risk.previousScore)};r.risk.factors=[{key:'repayment',name:'Repayment deterioration',score:score.components.repayment,detail:'Synthetic NPA arrears; independent from regulatory classification'},...r.risk.factors.filter(f=>f.key!=='repayment')];r.borrower.riskSegment=score.riskTier;r.monthlyMetrics.at(-1).features=f;}
 }
 }
 this.dataset.records=[...this.records.values()];
 // Seed once per account, never refill timelines which users later close.
 this.seeded=await readJson(join(this.dir,'recovery-seeded.json'),[]);
 if(enabled){const candidates=activeStates.filter(s=>s.scenario&&provision(s,this.config,this.asOf).isNpa&&s.scenario!=='NPA without recovery');let i=0;for(const s of candidates){if(this.seeded.includes(s.borrowerId)||this.actions.some(a=>a.borrowerId===s.borrowerId)){i++;continue;}const type=s.demoActionType??(s.scenario.startsWith('Catalogue ')?s.scenario.slice(10):s.scenario==='Proposed OTS'?'OTS':Object.keys(ACTIONS)[i++%11]);const date=shift(this.asOf,-8),recovered=s.scenario==='Partial recovery'?Math.round(s.totalOutstanding*.05):0;
 const history={id:`SYNTHETIC-${s.loanId}-history`,borrowerId:s.borrowerId,loanId:s.loanId,portfolioId:s.portfolioId,actionType:type,stage:'Demo planning completed',status:'Closed',current:false,actionDate:date,effectiveDate:date,amountRecovered:0,amountOutstanding:s.totalOutstanding,responsibleDepartment:'Recovery',owner:'Demo recovery team',notes:'Synthetic illustration only. No actual proceeding, filing, order or legal outcome.',source:'Synthetic demo generator v1',isSynthetic:true,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
 this.actions.push(history,{...history,id:`SYNTHETIC-${s.loanId}-current`,stage:'Synthetic review',status:type==='OTS'?'Settlement Proposed':'In Progress',current:true,actionDate:shift(this.asOf,-2),effectiveDate:shift(this.asOf,-2),amountRecovered:recovered,amountOutstanding:s.totalOutstanding-recovered});this.seeded.push(s.borrowerId);}}
 // Validate loaded store, including uniqueness, before serving any data.
 const current=new Set(),ids=new Set();for(const a of this.actions){const s=this.states[a.borrowerId];if(!s)throw Error('Orphan recovery action');validateAction(a,s);if(ids.has(a.id))throw Error('Duplicate recovery ID');ids.add(a.id);if(!TERMINAL.includes(a.status)&&!a.current)throw Error('Active recovery lacks current stage');if(a.current){if(current.has(a.borrowerId))throw Error('Duplicate current recovery stage');current.add(a.borrowerId);}}
 await atomic(join(this.dir,'provisioning-rules.json'),this.config);await atomic(join(this.dir,'loan-provisioning.json'),this.states);await atomic(join(this.dir,'recovery-actions.json'),this.actions);await atomic(join(this.dir,'recovery-seeded.json'),this.seeded);await atomic(join(this.dir,'npa-coverage-report.json'),report);
 this.refresh();
 }
 refresh(){for(const [id,r] of this.records){r.provisioning=this.states[id]?provision(this.states[id],this.config,today()):{available:false,reason:'Account financial inputs are unavailable'};const a=this.actions.find(a=>a.borrowerId===id&&a.current);r.currentRecoveryAction=a?{...a,actionLabel:ACTIONS[a.actionType]}:null;}}
 list(id){if(!this.records.has(id))throw Object.assign(Error('Borrower not found'),{status:404});return this.actions.filter(x=>x.borrowerId===id).map(a=>({...a,actionLabel:ACTIONS[a.actionType]})).sort((a,b)=>a.actionDate.localeCompare(b.actionDate)||a.createdAt.localeCompare(b.createdAt));}
 async mutate(id,b,actor,actionId=null){return this.serial(async()=>{const state=this.states[id];if(!state||!this.records.has(id))throw Object.assign(Error('Borrower not found'),{status:404});const result=changeAction(this.actions,state,b,actor,actionId);await atomic(join(this.dir,'recovery-actions.json'),result.items);this.actions=result.items;this.refresh();await this.security.log('recovery_action_changed',actor,{before:result.before,after:result.action});return result.action;});}
 async selectProfile(id,actor){return this.serial(async()=>{if(!this.config.profiles.some(p=>p.id===id))throw Error('Unknown regulatory profile');const next={...this.config,activeProfileId:id,assumption:'Demo rule selection only; institution applicability remains unverified.'};validateRules(next);await atomic(join(this.dir,'provisioning-rules.json'),next);this.config=next;const profile=next.profiles.find(p=>p.id===id);for(const state of Object.values(this.states))if(state.isSynthetic){state.layer=profile.layer;state.entityType=profile.entityType;}await atomic(join(this.dir,'loan-provisioning.json'),this.states);this.refresh();await this.security.log('provisioning_profile_changed',actor,{id,profile,assumption:next.assumption});return next;});}
 summary(){this.refresh();const rows=[...this.records.values()],sum={totalBorrowers:rows.length,totalOutstanding:0,grossNpa:0,requiredProvision:0,existingProvision:0,provisionShortfall:0,provisionExcess:0,npaExistingProvision:0,unavailableAccounts:0,recoveryAmount:0,classifications:{},recoveryDistribution:Object.fromEntries([...Object.keys(ACTIONS),'NONE'].map(k=>[k,{accounts:0,exposure:0}])),byProduct:{},byDpd:{},config:{activeProfileId:this.config.activeProfileId,assumption:this.config.assumption},netNpa:null,netNpaRatio:null,netNpaReason:'Unavailable: interest suspense, eligible deductions and regulatory net advances are not modelled.',recoveryRate:null,recoveryRateReason:'Unavailable: opening recoverable pool and cash ledger are not modelled.'};
 for(const r of rows){const p=r.provisioning,n=r.loan.outstandingAmount;sum.totalOutstanding+=n;if(!p.available){sum.unavailableAccounts++;continue;}const bucket=sum.classifications[p.assetClassification]??{accounts:0,exposure:0};bucket.accounts++;bucket.exposure+=n;sum.classifications[p.assetClassification]=bucket;for(const k of ['requiredProvision','existingProvision','provisionShortfall','provisionExcess'])sum[k]+=p[k];if(p.isNpa){sum.grossNpa+=n;sum.npaExistingProvision+=p.existingProvision;sum.byProduct[r.loan.productType]=(sum.byProduct[r.loan.productType]??0)+n;const label=p.daysPastDue<=179?'91–179':p.daysPastDue<=364?'180–364':'365+';sum.byDpd[label]=(sum.byDpd[label]??0)+n;}}
 for(const r of rows){const n=r.loan.outstandingAmount,k=r.currentRecoveryAction?.actionType??'NONE';sum.recoveryDistribution[k].accounts++;sum.recoveryDistribution[k].exposure+=n;}
 sum.recoveryAmount=this.actions.filter(a=>this.records.has(a.borrowerId)).reduce((s,a)=>s+a.amountRecovered,0);for(const k of ['requiredProvision','existingProvision','provisionShortfall','provisionExcess','recoveryAmount'])sum[k]=moneyRound(sum[k]);sum.grossNpaRatio=sum.totalOutstanding?sum.grossNpa/sum.totalOutstanding:null;sum.complete=sum.unavailableAccounts===0;return sum;}
}
