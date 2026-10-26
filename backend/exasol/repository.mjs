import {PortfolioRepository} from '../repository.mjs';
import {summary} from '../domain.mjs';
export class ExasolRepository extends PortfolioRepository{
 constructor(dataset,connection,datasetId){super(dataset);this.connection=connection;this.datasetId=datasetId;this.mode='EXASOL';}
 static async load(connection){
  const [latest]=await connection.query('SELECT DATASET_ID,METADATA FROM RURALLENS.DATASETS ORDER BY CREATED_AT DESC,DATASET_ID DESC LIMIT 1');
  if(!latest)throw Error('Exasol contains no RuralLens dataset. Run npm run exasol:load first.');
  const docs=await connection.query('SELECT PAYLOAD FROM RURALLENS.BORROWERS WHERE DATASET_ID={dataset}',{dataset:latest.DATASET_ID});
  const dataset={...JSON.parse(latest.METADATA),records:docs.map(row=>JSON.parse(row.PAYLOAD))};
  const repository=new ExasolRepository(dataset,connection,latest.DATASET_ID);await repository.refreshScores();return repository;
 }
 async refreshScores(){
  const rows=await this.connection.query('SELECT * FROM RURALLENS.CURRENT_RISK WHERE DATASET_ID={dataset}',{dataset:this.datasetId});
  const records=new Map(this.dataset.records.map(r=>[r.borrower.borrowerId,r]));
  if(rows.length!==records.size)throw Error('Exasol score coverage does not match borrower data.');
  for(const row of rows){const r=records.get(row.BORROWER_ID);if(!r)throw Error('Exasol score has no borrower');Object.assign(r.risk,{overallScore:Number(row.RISK_SCORE),riskTier:row.RISK_TIER,components:{repayment:Number(row.REPAYMENT),cashflow:Number(row.CASHFLOW),receivables:Number(row.RECEIVABLES),business:Number(row.BUSINESS),concentration:Number(row.CONCENTRATION),transactionAnomaly:Number(row.TRANSACTION_ANOMALY)}});r.borrower.riskSegment=row.RISK_TIER;}
 }
 async getBorrower(id){
  const rows=await this.connection.query('SELECT BORROWER_ID FROM RURALLENS.BORROWERS WHERE DATASET_ID={dataset} AND BORROWER_ID={id}',{dataset:this.datasetId,id});
  return rows.length?super.getBorrower(id):null;
 }
 async search(filters={}){
  const where=['b.DATASET_ID={dataset}'],params={dataset:this.datasetId};
  for(const [key,column] of [['tier','s.RISK_TIER'],['type','b.BORROWER_TYPE'],['state','b.STATE']])if(filters[key]){where.push(`${column}={${key}}`);params[key]=key==='tier'?String(filters[key]).toUpperCase():filters[key];}
  if(filters.search){where.push("LOCATE({search},LOWER(b.BORROWER_NAME||' '||b.BORROWER_ID))>0");params.search=String(filters.search).toLowerCase();}
  const rows=await this.connection.query(`SELECT b.BORROWER_ID FROM RURALLENS.BORROWERS b JOIN RURALLENS.CURRENT_RISK s ON b.DATASET_ID=s.DATASET_ID AND b.BORROWER_ID=s.BORROWER_ID WHERE ${where.join(' AND ')}`,params);
  const ids=new Set(rows.map(r=>r.BORROWER_ID));return super.search(filters).filter(r=>ids.has(r.borrower.borrowerId));
 }
 async alerts(filters={}){return(await this.search(filters)).filter(r=>filters.tier?.toUpperCase()==='LOW'||r.risk.overallScore>=30);}
 async dashboard(){
  await this.refreshScores();
  const d=super.dashboard(),params={dataset:this.datasetId};
  const [totals]=await this.connection.query('SELECT COUNT(*) AS BORROWERS,SUM(b.EXPOSURE) AS EXPOSURE,ROUND(AVG(s.RISK_SCORE),1) AS AVERAGE_RISK FROM RURALLENS.BORROWERS b JOIN RURALLENS.CURRENT_RISK s ON b.DATASET_ID=s.DATASET_ID AND b.BORROWER_ID=s.BORROWER_ID WHERE b.DATASET_ID={dataset}',params);
  const tiers=await this.connection.query('SELECT RISK_TIER,COUNT(*) AS N FROM RURALLENS.CURRENT_RISK WHERE DATASET_ID={dataset} GROUP BY RISK_TIER',params);
  const trend=await this.connection.query('SELECT MONTH_KEY,ROUND(AVG(RISK_SCORE),2) AS AVERAGE_RISK FROM RURALLENS.RISK_SCORES WHERE DATASET_ID={dataset} GROUP BY MONTH_KEY ORDER BY MONTH_KEY',params);
  return {...d,totalBorrowers:Number(totals.BORROWERS),totalExposure:Number(totals.EXPOSURE),averageRisk:Number(totals.AVERAGE_RISK),riskCounts:{LOW:0,MODERATE:0,HIGH:0,CRITICAL:0,...Object.fromEntries(tiers.map(r=>[r.RISK_TIER,Number(r.N)]))},riskTrend:trend.map(r=>({month:r.MONTH_KEY,averageRisk:Number(r.AVERAGE_RISK)})),dataSource:'Exasol · RuralLens synthetic portfolio',dataStatus:'Borrowers and monthly features loaded from Exasol. Risk scores, tier counts, exposure totals and risk trend queried in Exasol SQL. Provisioning and workflows use local application services.',database:{provider:'Exasol',datasetId:this.datasetId}};
 }
}
