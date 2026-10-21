import { dashboard, summary } from './domain.mjs';

function matches(record, filters={}){
 const item=summary(record);
 return (!filters.search||`${item.borrowerName} ${item.borrowerId}`.toLowerCase().includes(filters.search.toLowerCase()))&&
  (!filters.tier||item.riskTier===filters.tier.toUpperCase())&&
  (!filters.type||item.borrowerType===filters.type)&&(!filters.state||item.state===filters.state)&&
  (!filters.driver||record.risk.factors.some(f=>f.key===filters.driver));
}

// Local repository boundary. Production can replace this implementation with an
// Exasol-backed adapter while keeping API handlers and domain services intact.
export class PortfolioRepository{
 constructor(dataset){this.dataset=dataset;}
 dashboard(){return dashboard(this.dataset);}
 getBorrower(id){return this.dataset.records.find(x=>x.borrower.borrowerId===id)??null;}
 search(filters={}){return this.dataset.records.filter(x=>matches(x,filters)).sort((a,b)=>b.risk.overallScore-a.risk.overallScore);}
 alerts(filters={}){return this.search(filters).filter(x=>x.risk.overallScore>=30);}
 page(records,page=1,limit=50){const size=Math.min(100,Math.max(1,Number(limit)||50)),index=Math.max(1,Number(page)||1);return{items:records.slice((index-1)*size,index*size).map(summary),total:records.length,page:index,limit:size};}
}
