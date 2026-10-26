const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
export const canViewIntervention=(item,teamId)=>teamId==='CXO'||(teamId!=='IT'&&teamId!=null&&(item.teamId??item.assignedTo)===teamId);
export function transitionIntervention(item,body,actor,teamId,teams){
 if(!canViewIntervention(item,teamId))fail('You cannot update this task',403);
 if(!body||Object.keys(body).some(k=>!['action','details','assignedMember'].includes(k)))fail('Provide an action and details');
 if(body.action==='assign'){
  if(!teams?.isHead(teams.security.user(actor),teamId))fail('Only the department head can allocate this task',403);
  if(!['Open','Reopened'].includes(item.status))fail('Only open tasks can be allocated',409);
  teams.assignee(teamId,body.assignedMember);
  if(item.assignedMember)fail('This task already has an assigned member; reassignment is not allowed',409);
  const at=new Date().toISOString();return {...item,assignedMember:body.assignedMember,updatedAt:at,history:[...(item.history??[]),{action:'assign',status:item.status,details:`Assigned to ${body.assignedMember}`,actor,at}]};
 }
 const details=typeof body.details==='string'?body.details.trim():'';
 if(details.length<3||details.length>2000)fail('Provide details of 3–2000 characters');
 let status;
 if(body.action==='complete'){
  if(!item.assignedMember||item.assignedMember!==actor)fail('Only the assigned member can submit completion',403);
  if(teamId==='CXO')fail('Only the assigned operational team can complete this task',403);
  if(!['Open','Reopened'].includes(item.status))fail('Only open tasks can be completed',409);
  status='Closed';
 }else fail('Only initial allocation and member completion are supported');
 const at=new Date().toISOString();
 return {...item,status,updatedAt:at,closedAt:at,...(body.action==='complete'?{outcome:details,completedBy:actor,completedAt:at}:{reviewDetails:details,reviewedBy:actor}),history:[...(item.history??[]),{action:body.action,status,details,actor,at}]};
}

export function interventionTiming(item){
 const valid=value=>typeof value==='string'&&Number.isFinite(Date.parse(value))?value:null;
 const assignedOn=valid(item.actionDate);
 const closure=item.status==='Closed'?(item.closedAt??(item.history??[]).findLast(h=>h.action==='approve')?.at??item.updatedAt):null;
 const closedOn=valid(closure),elapsed=assignedOn&&closedOn?Date.parse(closedOn)-Date.parse(assignedOn):null;
 return {assignedOn,closedOn,turnaroundDays:elapsed!==null&&elapsed>=0?Math.floor(elapsed/86400000):null};
}

export function migrateCompletedIntervention(item){
 if(item.status!=='Completed')return item;
 return {...item,status:'Closed',closedAt:item.completedAt??(item.history??[]).findLast(h=>h.action==='complete')?.at??item.updatedAt??null};
}
