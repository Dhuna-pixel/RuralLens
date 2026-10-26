import { randomUUID } from 'node:crypto';
import { amount, dateValue, today } from './provisioning.mjs';
export const ACTIONS=Object.freeze({SARFAESI:'SARFAESI Act, 2002',DRT:'Debt Recovery Tribunal (DRT)',IBC:'Insolvency and Bankruptcy Code (IBC) / NCLT',CIVIL_COURT:'Civil Court Suit',LOK_ADALAT:'Lok Adalat',SECTION_138_NI_ACT:'Section 138 Negotiable Instruments Act',WILFUL_DEFAULTER:'Wilful Defaulter Declaration',CRIMINAL_ACTION:'Criminal Lawsuit / Investigation',OTS:'One-Time Settlement (OTS)',ARC:'Asset Reconstruction Company (ARC) Transfer',SDR:'Strategic Debt Restructuring'});
export const STATUSES=['Planned','Initiated','In Progress','Notice Issued','Filed','Pending','Hearing','Settlement Proposed','Settlement Approved','Recovery in Progress','Recovered','Closed','Withdrawn','Failed','On Hold'];
export const TERMINAL=['Recovered','Closed','Withdrawn','Failed'];
const transitions={Planned:['Initiated','On Hold','Withdrawn'],Initiated:['In Progress','Notice Issued','Filed','Settlement Proposed','Recovery in Progress','On Hold','Closed','Failed'], 'In Progress':['Notice Issued','Filed','Pending','Hearing','Settlement Proposed','Recovery in Progress','On Hold','Closed','Failed'], 'Notice Issued':['Filed','Pending','Settlement Proposed','On Hold','Closed','Withdrawn'],Filed:['Pending','Hearing','Settlement Proposed','On Hold','Closed','Withdrawn'],Pending:['Hearing','In Progress','Settlement Proposed','On Hold','Closed','Failed'],Hearing:['Pending','Settlement Proposed','Recovery in Progress','Closed','Failed'],'Settlement Proposed':['Settlement Approved','In Progress','On Hold','Withdrawn','Failed'],'Settlement Approved':['Recovery in Progress','Recovered','Closed','Failed'],'Recovery in Progress':['Recovered','On Hold','Closed','Failed'],'On Hold':['Initiated','In Progress','Pending','Settlement Proposed','Recovery in Progress','Closed','Withdrawn']};
export function validateAction(a,state){
 if(!Object.hasOwn(ACTIONS,a.actionType))throw Error('Choose an allowed recovery action type');if(!STATUSES.includes(a.status))throw Error('Choose an allowed recovery status');if(typeof a.current!=='boolean')throw Error('Current must be boolean');if(TERMINAL.includes(a.status)&&a.current)throw Error('A terminal action cannot remain current');
 for(const k of ['stage','responsibleDepartment','owner','source'])if(typeof a[k]!=='string'||!a[k].trim()||a[k].length>160)throw Error(`${k} is required (maximum 160 characters)`);
 if(!['Business','Credit','Risk','Collection','Recovery','Legal','Operations'].includes(a.responsibleDepartment))throw Error('Invalid department');if(typeof a.notes!=='string'||a.notes.length>2000)throw Error('Notes must be at most 2000 characters');
 dateValue(a.actionDate);dateValue(a.effectiveDate);if(a.actionDate>today()||a.effectiveDate<a.actionDate)throw Error('Invalid action/effective date order');if(a.current&&a.effectiveDate>today())throw Error('A future effective action cannot be current');
 amount(a.amountRecovered,'Recovered amount');amount(a.amountOutstanding,'Outstanding amount');if(a.amountRecovered>state.totalOutstanding||a.amountOutstanding>state.totalOutstanding||a.amountRecovered+a.amountOutstanding>state.totalOutstanding+.01)throw Error('Recovery and remaining outstanding exceed applicable exposure');
 if(a.borrowerId!==state.borrowerId||a.loanId!==state.loanId||a.portfolioId!==state.portfolioId)throw Error('Recovery account identifiers do not match');if(a.isSynthetic!==state.isSynthetic)throw Error('Synthetic flag must match account');return a;
}
export function changeAction(items,state,b,actor,id=null){
 if(!b||typeof b!=='object'||Array.isArray(b))throw Error('Action body must be an object');
 const allowed=['actionType','stage','status','current','actionDate','effectiveDate','amountRecovered','amountOutstanding','responsibleDepartment','owner','notes','source'];for(const k of Object.keys(b))if(!allowed.includes(k))throw Error(`Unsupported recovery field: ${k}`);
 const old=id?items.find(x=>x.id===id):null;if(id&&!old)throw Object.assign(Error('Recovery action not found'),{status:404});
 if(old&&(old.borrowerId!==state.borrowerId||old.loanId!==state.loanId))throw Error('Action account mismatch');
 if(old&&TERMINAL.includes(old.status))throw Error('Closed history is immutable; create a new action');
 if(old&&b.actionType&&b.actionType!==old.actionType)throw Error('Action type is immutable');
 const now=new Date().toISOString(),a={id:old?.id??`REC-${randomUUID()}`,borrowerId:state.borrowerId,loanId:state.loanId,portfolioId:state.portfolioId,isSynthetic:state.isSynthetic,notes:'',source:'Recorded by authorized user',createdAt:now,...old,...b,updatedAt:now,updatedBy:actor,createdBy:old?.createdBy??actor};
 if(old&&a.status!==old.status&&!transitions[old.status]?.includes(a.status))throw Error(`Invalid status transition: ${old.status} → ${a.status}`);
 if(!old&&!['Planned','Initiated'].includes(a.status))throw Error('New actions must start Planned or Initiated');
 if(TERMINAL.includes(a.status))a.current=false;
 validateAction(a,state);
 const others=items.filter(x=>x.id!==a.id&&x.borrowerId===state.borrowerId),current=others.find(x=>x.current);if(a.current&&current)throw Object.assign(Error('Close or withdraw the previous current action before selecting a new current stage'),{status:409});
 if(others.reduce((sum,x)=>sum+x.amountRecovered,0)+a.amountRecovered>state.totalOutstanding+.01)throw Error('Total recorded recovery exceeds applicable exposure');
 const remainingActive=others.filter(x=>!TERMINAL.includes(x.status));if(!TERMINAL.includes(a.status)&&remainingActive.length)throw Object.assign(Error('Parallel recovery actions are not supported; close the active action first'),{status:409});
 if(!TERMINAL.includes(a.status)&&!a.current)throw Error('An active workflow must have exactly one current stage');
 return {action:a,items:old?items.map(x=>x.id===id?a:x):[...items,a],before:old};
}
