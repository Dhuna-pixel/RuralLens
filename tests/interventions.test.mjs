import test from 'node:test';
import assert from 'node:assert/strict';
import {canViewIntervention,transitionIntervention} from '../backend/interventions.mjs';
test('team tasks require head allocation and assigned member completion',()=>{
 const task={teamId:'Credit',assignedMember:null,status:'Open'},teams={security:{user:username=>({username})},isHead:u=>u.username==='head',assignee:(team,username)=>{assert.equal(team,'Credit');if(username!=='member')throw Error('Wrong team member');}};
 for(const team of ['IT','Risk',null])assert.equal(canViewIntervention(task,team),false);
 assert.equal(canViewIntervention(task,'Credit'),true);
 assert.throws(()=>transitionIntervention(task,{action:'complete',details:'Done work'},'member','Credit',teams),{status:403});
 assert.throws(()=>transitionIntervention(task,{action:'assign',assignedMember:'member'},'member','Credit',teams),{status:403});
 const assigned=transitionIntervention(task,{action:'assign',assignedMember:'member'},'head','Credit',teams);
 assert.throws(()=>transitionIntervention(assigned,{action:'complete',details:'Done work'},'head','Credit',teams),{status:403});
 assert.throws(()=>transitionIntervention(assigned,{action:'assign',assignedMember:'member'},'head','Credit',teams),{status:409});
 const completed=transitionIntervention(assigned,{action:'complete',details:'Reviewed invoices'},'member','Credit',teams);assert.equal(completed.status,'Closed');
 assert.throws(()=>transitionIntervention(completed,{action:'approve',details:'Accepted'},'head','Credit',teams),{status:400});
});

test('task timing uses original team assignment and member completion and legacy closure, including legacy history',async()=>{
 const {interventionTiming}=await import('../backend/interventions.mjs');
 const task={actionDate:'2026-10-20T06:00:00Z',status:'Closed',history:[{action:'assign',at:'2026-10-21T06:00:00Z'},{action:'approve',at:'2026-10-23T18:00:00Z'}]};
 assert.deepEqual(interventionTiming(task),{assignedOn:task.actionDate,closedOn:'2026-10-23T18:00:00Z',turnaroundDays:3});
 assert.equal(interventionTiming({...task,status:'Open'}).turnaroundDays,null);
 assert.equal(interventionTiming({...task,closedAt:'2026-10-19T06:00:00Z'}).turnaroundDays,null);
 assert.equal(interventionTiming({status:'Closed'}).closedOn,null);
 const closed=transitionIntervention({...task,teamId:'Credit',status:'Open',assignedMember:'member'},{action:'complete',details:'Evidence recorded'},'member','Credit');
 assert.equal(closed.closedAt,closed.history.at(-1).at);
 assert.equal(interventionTiming(closed).closedOn,closed.closedAt);
});

test('legacy submitted tasks finish at their recorded completion time',async()=>{
 const {migrateCompletedIntervention}=await import('../backend/interventions.mjs');
 const old={status:'Completed',completedAt:'2026-10-21T06:00:00Z',history:[]};
 const migrated=migrateCompletedIntervention(old);assert.equal(migrated.status,'Closed');assert.equal(migrated.closedAt,old.completedAt);assert.deepEqual(migrated.history,old.history);
});
