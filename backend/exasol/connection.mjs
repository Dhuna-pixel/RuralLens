import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {readFile} from 'node:fs/promises';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
export async function exasolConfig(env=process.env){
 let saved={};if(env.EXASOL_CONFIG_FILE)saved=JSON.parse(await readFile(env.EXASOL_CONFIG_FILE,'utf8'));
 const config={...saved,dsn:env.EXASOL_DSN||saved.dsn,user:env.EXASOL_USER||saved.user,passwordFile:env.EXASOL_PASSWORD_FILE||saved.passwordFile,python:env.EXASOL_PYTHON||saved.python||join(homedir(),'.exasol-starter-kit/pyexasol-venv/bin/python'),allowSelfSigned:env.EXASOL_ALLOW_SELF_SIGNED==='true'||saved.allowSelfSigned===true};
 if(!config.dsn||!config.user||!config.passwordFile)throw Error('Exasol requires EXASOL_DSN, EXASOL_USER and EXASOL_PASSWORD_FILE (or EXASOL_CONFIG_FILE).');
 if(config.allowSelfSigned&&!/^(127\.0\.0\.1|localhost):\d+$/.test(config.dsn))throw Error('Self-signed TLS relaxation is allowed only for the local starter-kit database.');
 return config;
}
export class ExasolConnection{
 constructor(config){this.config=config;this.pending=new Map();this.sequence=0;}
 async start(){
  this.child=spawn(this.config.python,[fileURLToPath(new URL('./worker.py',import.meta.url))],{stdio:['pipe','pipe','pipe']});
  this.child.stderr.on('data',()=>{}); // Never forward driver logs: they can contain SQL data or connection details.
  const fail=()=>{for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(Error('Exasol worker stopped. Check the Python driver and database connection.'));}this.pending.clear();};
  this.child.on('error',fail);this.child.on('exit',fail);this.child.stdin.on('error',fail);
  createInterface({input:this.child.stdout}).on('line',line=>{let response;try{response=JSON.parse(line);}catch{return;}const p=this.pending.get(response.id);if(!p)return;this.pending.delete(response.id);clearTimeout(p.timer);response.ok?p.resolve(response.result):p.reject(Object.assign(Error(response.error),{status:503}));});
  try{await this.send({op:'connect',config:this.config});return this;}catch(e){this.close();throw e;}
 }
 send(message){return new Promise((resolve,reject)=>{const id=++this.sequence,timer=setTimeout(()=>{this.close();reject(Error('Exasol request timed out.'));},120000);this.pending.set(id,{resolve,reject,timer});this.child.stdin.write(JSON.stringify({...message,id})+'\n');});}
 query(sql,params={},rows=true){return this.send({op:'query',sql,params,rows});}
 insert(sql,values){return this.send({op:'insert',sql,values});}
 close(){this.child?.kill();}
}
