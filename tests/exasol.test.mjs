import test from 'node:test';
import assert from 'node:assert/strict';
import {exasolConfig} from '../backend/exasol/connection.mjs';
import {ExasolRepository} from '../backend/exasol/repository.mjs';
import {createDataset} from '../backend/domain.mjs';
test('Exasol requires explicit credentials and limits TLS exceptions to localhost',async()=>{
 await assert.rejects(()=>exasolConfig({}),/requires/);
 const env={EXASOL_DSN:'db.example:8563',EXASOL_USER:'app',EXASOL_PASSWORD_FILE:'/private/password',EXASOL_PYTHON:'/python'};
 assert.equal((await exasolConfig(env)).allowSelfSigned,false);
 await assert.rejects(()=>exasolConfig({...env,EXASOL_ALLOW_SELF_SIGNED:'true'}),/only/);
 assert.equal((await exasolConfig({...env,EXASOL_DSN:'127.0.0.1:8563',EXASOL_ALLOW_SELF_SIGNED:'true'})).allowSelfSigned,true);
});
test('Exasol passes filters as driver parameters and propagates database outages',async()=>{
 const dataset=createDataset({borrowers:6,months:6}),calls=[],connection={query:async(sql,params)=>{calls.push({sql,params});return [{BORROWER_ID:dataset.records[0].borrower.borrowerId}];}},repo=new ExasolRepository(dataset,connection,'dataset');
 const injection="' OR 1=1 --";await repo.search({search:injection});assert.ok(!calls[0].sql.includes(injection));assert.equal(calls[0].params.search,injection.toLowerCase());
 assert.equal((await repo.getBorrower(dataset.records[0].borrower.borrowerId)).borrower.borrowerId,dataset.records[0].borrower.borrowerId);
 connection.query=async()=>{throw Error('Database unavailable');};await assert.rejects(()=>repo.search({}),/Database unavailable/);await assert.rejects(()=>repo.dashboard(),/Database unavailable/);
});
test('Exasol refuses incomplete risk coverage',async()=>{
 const repo=new ExasolRepository(createDataset({borrowers:6,months:6}),{query:async()=>[]},'dataset');await assert.rejects(()=>repo.refreshScores(),/coverage/);
});
