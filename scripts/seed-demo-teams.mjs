import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {SecurityStore} from '../backend/security.mjs';
import {TeamStore} from '../backend/teams.mjs';
const dir=process.env.DATA_STORE_DIR||new URL('../data/generated/',import.meta.url).pathname;
await mkdir(dir,{recursive:true});
const security=new SecurityStore(dir);await security.init();
const teams=new TeamStore(dir,security);await teams.init();
const actor=security.users.find(u=>u.active&&teams.isIT(u));
if(!actor)throw Error('An active IT member is required to provision demo accounts');
let credentials=[];try{credentials=JSON.parse(await readFile(join(dir,'demo-team-credentials.json'),'utf8')).accounts??[];}catch{}
let createdCount=0;
const executiveTitles={leader:'CEO · Chief Executive Officer',coo:'COO · Chief Operating Officer',cro:'CRO · Chief Risk Officer',cfo:'CFO · Chief Financial Officer',cto:'CTO · Chief Technology Officer'};
for(const team of teams.directory().teams.filter(t=>t.id!=='IT')){
 for(const title of team.id==='CXO'?Object.keys(executiveTitles):['head','member']){
  const username=`demo.${team.id.toLowerCase()}.${title}`;
  if(security.user(username)){if(team.id==='CXO'){security.user(username).jobTitle=executiveTitles[title];await security.persistUsers();}continue;}
  const result=await security.createUser({username,role:'employee',jobTitle:team.id==='CXO'?executiveTitles[title]:''},actor.username);
  await teams.assign(username,team.id,actor.username);
  if(title==='head'&&!team.headUsername)await teams.setHead(team.id,username,actor.username);
  createdCount++;credentials.push({username,jobTitle:team.id==='CXO'?executiveTitles[title]:null,team:team.name,temporaryPassword:result.temporaryPassword});
 }
}
if(credentials.length)await writeFile(join(dir,'demo-team-credentials.json'),JSON.stringify({note:'Synthetic demo accounts. Change temporary passwords and enroll MFA at first sign-in.',accounts:credentials},null,2),{mode:0o600});
console.log(`Created ${createdCount} clearly labelled demo accounts. Temporary credentials saved locally in data/generated/demo-team-credentials.json.`);
