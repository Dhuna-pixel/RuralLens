import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {join} from 'node:path';
import {createDataset,scoreFeatures} from '../backend/domain.mjs';
import {PortfolioStore} from '../backend/portfolio-store.mjs';
import {exasolConfig,ExasolConnection} from '../backend/exasol/connection.mjs';
const config=await exasolConfig();
const dataset=createDataset({borrowers:Number(process.env.DATA_BORROWERS??10000),months:Number(process.env.DATA_MONTHS??36),seed:Number(process.env.DATA_SEED??42)});
const store=new PortfolioStore(process.env.DATA_STORE_DIR||join(process.cwd(),'data/generated'),dataset,{log:async()=>{}});await store.init();
const connection=await new ExasolConnection(config).start();
try{
 const schema=await readFile(new URL('../sql/exasol/schema.sql',import.meta.url),'utf8');
 for(const sql of schema.split(';').map(s=>s.trim()).filter(Boolean))await connection.query(sql,{},false);
 const id=randomUUID(),meta={seed:dataset.seed,months:dataset.months,generatedAt:dataset.generatedAt},featureKeys=['dpd30','dpd60','missed','paymentRatio90','cashflowGrowth','cashflowVolatility','inflowChange','over60Ratio','receivableGrowth','collectionDelay','revenueGrowth','marginChange','inventoryGrowth','buyerConcentration','lateBuyerShare','transactionShift','transactionVolatility'];
 for(let i=0;i<dataset.records.length;i+=25){const records=dataset.records.slice(i,i+25);
  await connection.insert('INSERT INTO RURALLENS.BORROWERS VALUES (?,?,?,?,?,?,?,?)',records.map(r=>[id,r.borrower.borrowerId,r.borrower.borrowerName,r.borrower.borrowerType,r.borrower.state,r.loan.productType,r.loan.outstandingAmount,JSON.stringify(r)]));
  const features=records.flatMap(r=>r.monthlyMetrics.map(m=>[id,r.borrower.borrowerId,m.month,...featureKeys.map(k=>m.features[k])]));
  if(features.some(row=>row.slice(3).some(n=>!Number.isFinite(n))))throw Error('Invalid risk feature in generated dataset');
  await connection.insert(`INSERT INTO RURALLENS.MONTHLY_FEATURES VALUES (${Array(20).fill('?').join(',')})`,features);
  if(i%1000===0)console.log(`Loaded ${Math.min(i+25,dataset.records.length)} / ${dataset.records.length} synthetic borrowers`);
 }
 const scores=await connection.query('SELECT BORROWER_ID,RISK_SCORE,RISK_TIER FROM RURALLENS.CURRENT_RISK WHERE DATASET_ID={dataset}',{dataset:id});
 const expected=new Map(dataset.records.map(r=>[r.borrower.borrowerId,scoreFeatures(r.monthlyMetrics.at(-1).features)]));
 if(scores.length!==dataset.records.length||scores.some(r=>Math.abs(Number(r.RISK_SCORE)-expected.get(r.BORROWER_ID)?.overallScore)>.001||r.RISK_TIER!==expected.get(r.BORROWER_ID)?.riskTier))throw Error('SQL risk score verification failed. Dataset has NOT been activated.');
 const [totals]=await connection.query('SELECT COUNT(*) AS N,SUM(EXPOSURE) AS EXPOSURE FROM RURALLENS.BORROWERS WHERE DATASET_ID={dataset}',{dataset:id});
 const exposure=dataset.records.reduce((n,r)=>n+r.loan.outstandingAmount,0);
 if(Number(totals.N)!==dataset.records.length||Math.abs(Number(totals.EXPOSURE)-exposure)>.01)throw Error('Borrower/exposure reconciliation failed. Dataset has NOT been activated.');
 await connection.insert('INSERT INTO RURALLENS.DATASETS (DATASET_ID,METADATA) VALUES (?,?)',[[id,JSON.stringify(meta)]]);
 console.log(`Verified and activated dataset ${id}: ${scores.length} borrowers; exposure and all current risk scores match independent JavaScript calculations.`);
}finally{connection.close();}
