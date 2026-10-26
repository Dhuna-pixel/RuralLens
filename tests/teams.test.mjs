import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {TeamStore} from '../backend/teams.mjs';
test('teams use real accounts, persist membership and preserve canonical IDs on rename',async()=>{const dir=await mkdtemp(join(tmpdir(),'rl-teams-'));try{const users=[{username:'dhuna',role:'admin',active:true},{username:'member.one',role:'employee',active:true},{username:'member.two',role:'employee',active:true},{username:'inactive',role:'employee',active:false}],events=[],security={users,user:n=>users.find(u=>u.username===n),log:async(event,actor,details)=>events.push({event,actor,details})},store=new TeamStore(dir,security);await store.init();assert.equal(store.directory().teams.find(t=>t.id==='IT').members[0].username,'dhuna');assert.equal(store.directory().unassigned.length,3);await Promise.all([store.assign('member.one','Credit','dhuna'),store.assign('member.two','Risk','dhuna')]);await store.rename('Credit',{name:'Credit Review',description:'Credit review'},'dhuna');assert.equal(store.assignee('Credit','member.one').username,'member.one');assert.throws(()=>store.assignee('Risk','member.one'));assert.throws(()=>store.assignee('Credit','inactive'));assert.throws(()=>store.assignee('IT','dhuna'));await assert.rejects(()=>store.rename('Credit',{name:'Risk'},'dhuna'));await assert.rejects(()=>store.assign('missing','Credit','dhuna'));await assert.rejects(()=>store.assign('member.one','Fake','dhuna'));const restarted=new TeamStore(dir,security);await restarted.init();assert.equal(restarted.label('Credit'),'Credit Review');assert.equal(restarted.membership(users[1]),'Credit');assert.equal(restarted.membership(users[2]),'Risk');assert.ok(events.some(e=>e.event==='team_updated'));await restarted.assign('member.one',null,'dhuna');assert.ok(restarted.directory().unassigned.some(u=>u.username==='member.one'));}finally{await rm(dir,{recursive:true,force:true});}});

test('legacy team catalogues gain CXO and Operations without losing custom names or memberships',async()=>{
 const {writeFile}=await import('node:fs/promises');
 const {DEFAULT_TEAMS}=await import('../backend/teams.mjs');
 const dir=await mkdtemp(join(tmpdir(),'rl-team-migration-'));
 try{
  const legacy=DEFAULT_TEAMS.filter(t=>!['CXO','Operations'].includes(t.id)).map(t=>({...t,name:t.id==='Credit'?'Credit Review':t.name}));
  await writeFile(join(dir,'teams.json'),JSON.stringify({schemaVersion:1,teams:legacy,memberships:{member:'Credit'}}));
  const user={username:'member',role:'employee',active:true},security={users:[user],user:()=>user,log:async()=>{}};
  const store=new TeamStore(dir,security);await store.init();
  assert.equal(store.label('Credit'),'Credit Review');assert.equal(store.membership(user),'Credit');
  assert.ok(store.directory().teams.find(t=>t.id==='Operations').canReceiveInterventions);
  assert.ok(store.directory().teams.find(t=>t.id==='CXO').canAssignInterventions);
  assert.throws(()=>store.assignee('CXO','member'));
  const restarted=new TeamStore(dir,security);await restarted.init();assert.equal(restarted.state.teams.length,9);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('only CXO and IT appoint active department heads and team changes clear appointments',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'rl-heads-'));
 try{
  const users=['it','cxo','head','member','inactive'].map(username=>({username,role:'employee',active:username!=='inactive'})),security={users,user:n=>users.find(u=>u.username===n),log:async()=>{}};
  const store=new TeamStore(dir,security);await store.init();
  for(const [name,team] of [['it','IT'],['cxo','CXO'],['head','Credit'],['member','Credit'],['inactive','Credit']])await store.assign(name,team,'it');
  await assert.rejects(()=>store.setHead('Credit','head','member'),{status:403});
  await assert.rejects(()=>store.setHead('Credit','inactive','it'));
  await store.setHead('Credit','head','cxo');assert.ok(store.isHead(users[2]));
  const restarted=new TeamStore(dir,security);await restarted.init();assert.ok(restarted.isHead(users[2]));
  await restarted.assign('head','Risk','it');assert.equal(restarted.isHead(users[2],'Credit'),false);
 }finally{await rm(dir,{recursive:true,force:true});}
});
