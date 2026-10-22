import test from 'node:test';
import assert from 'node:assert/strict';
import { createDataset, scoreFeatures, investigate, simulate, dashboard } from '../backend/domain.mjs';

test('risk score uses documented component weights and bounded tiers',()=>{
 const zero=Object.fromEntries(['dpd30','dpd60','missed','cashflowGrowth','cashflowVolatility','inflowChange','over60Ratio','receivableGrowth','collectionDelay','revenueGrowth','marginChange','inventoryGrowth','lateBuyerShare','transactionShift','transactionVolatility'].map(k=>[k,0]));
 const f={...zero,paymentRatio90:1,buyerConcentration:0};const s=scoreFeatures(f);assert.equal(s.overallScore,0);assert.equal(s.riskTier,'LOW');
 const high=scoreFeatures({...f,dpd30:4,dpd60:4,missed:4,paymentRatio90:0,cashflowGrowth:-1,inflowChange:-1,over60Ratio:1,receivableGrowth:2,collectionDelay:1,revenueGrowth:-1,marginChange:-1,inventoryGrowth:2,buyerConcentration:1,lateBuyerShare:1,transactionShift:2,transactionVolatility:2});assert.equal(high.overallScore,100);assert.equal(high.riskTier,'CRITICAL');
});
test('generator is deterministic and includes all six demo stories',()=>{
 const a=createDataset({borrowers:20,months:12,seed:7}),b=createDataset({borrowers:20,months:12,seed:7});assert.equal(a.records.length,20);assert.deepEqual(a.records.map(x=>x.borrower.borrowerName),b.records.map(x=>x.borrower.borrowerName));assert.deepEqual(a.records.slice(0,6).map(x=>x.borrower.borrowerId),['BRW-DEMO-001','BRW-DEMO-002','BRW-DEMO-003','BRW-DEMO-004','BRW-DEMO-005','BRW-DEMO-006']);
});
test('seasonal cashflow stress recovers and does not become a critical false alarm',()=>{
 const d=createDataset({borrowers:6,months:18,seed:42}),healthy=d.records[1],falsePositive=d.records[5];assert.ok(healthy.risk.overallScore<60);assert.ok(falsePositive.risk.overallScore<60);assert.ok(healthy.monthlyMetrics.at(-1).operatingCashFlow>0);assert.ok(falsePositive.monthlyMetrics.at(-1).features.cashflowGrowth>0);
});
test('planted receivable stress surfaces liquidity evidence with revenue counter-evidence',()=>{
 const x=createDataset({borrowers:6,months:18,seed:42}).records[0],i=investigate(x);assert.ok(x.risk.components.receivables>=80);assert.ok(i.primaryDrivers.some(d=>d.name==='Receivable stress'));assert.ok(i.counterEvidence.some(e=>e.includes('Revenue remains broadly stable')));assert.match(i.investigationSummary,/liquidity and receivable stress/i);assert.ok(i.evidence.every(e=>e.value!==undefined));
});
test('buyer concentration and anomaly stories are identified in their component scores',()=>{
 const d=createDataset({borrowers:6,months:18,seed:42});assert.ok(d.records[2].risk.components.concentration>50);assert.ok(d.records[4].risk.components.transactionAnomaly>60);
});
test('what-if recomputes a scenario without mutating the current score',()=>{
 const x=createDataset({borrowers:6,months:18,seed:42}).records[0],before=x.risk.overallScore,s=simulate(x);assert.equal(s.label,'Scenario simulation');assert.ok(s.projected.score<before);assert.equal(x.risk.overallScore,before);assert.match(s.note,/not a forecast/i);
});
test('dataset relations and dashboard totals are coherent',()=>{
 const d=createDataset({borrowers:50,months:12,seed:3}),dash=dashboard(d);assert.equal(dash.totalBorrowers,50);assert.ok(d.records.every(x=>x.loan.loanId&&x.monthlyMetrics.length===12&&x.repayments.every(r=>r.dueAmount>0)));assert.equal(Object.values(dash.riskCounts).reduce((a,b)=>a+b,0),50);
});
test('DPD ageing assigns every valid overdue account once and leaves invalid records unclassified',()=>{
 const thresholds=[1,30,31,60,61,90,91,179,180,269,270,364,365],d=createDataset({borrowers:15,months:6,seed:4});
 thresholds.forEach((dpd,i)=>d.records[i].repayments.forEach(r=>r.daysPastDue=dpd));
 d.records[13].repayments.forEach(r=>r.daysPastDue=0);d.records[14].repayments[0].daysPastDue=null;
 const x=dashboard(d);assert.deepEqual(x.overdueBuckets.map(b=>b.accounts),[2,2,2,2,2,2,1]);assert.equal(x.currentAccounts,1);assert.equal(x.dpdUnclassifiedAccounts,1);assert.equal(x.overdueBuckets.reduce((s,b)=>s+b.exposure,0),x.overdueExposure);
});
