import { createDataset } from '../backend/domain.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
const args=Object.fromEntries(process.argv.slice(2).map((x,i,a)=>x.startsWith('--')?[x.slice(2),a[i+1]]:null).filter(Boolean));
const borrowers=Number(args.borrowers??10000),months=Number(args.months??36),seed=Number(args.seed??42);
const data=createDataset({borrowers,months,seed});await mkdir('data/generated',{recursive:true});const path='data/generated/synthetic-portfolio.json';await writeFile(path,JSON.stringify(data));console.log(`Generated ${data.records.length} linked synthetic borrower profiles with ${months} monthly periods (seed ${seed}) at ${path}`);
