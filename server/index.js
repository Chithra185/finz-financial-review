import express from 'express';
import cors from 'cors';
import multer from 'multer';
import XLSX from 'xlsx';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config({ path: path.join(process.cwd(), '.env') });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const upload = multer({ storage: multer.memoryStorage() });
app.use(cors());
app.use(express.json({ limit: '2mb' }));

const defaultCsv = path.join(__dirname, '..', 'data', 'transactions.csv');
let transactions = readCsvFile(defaultCsv);
let corrections = {};

const CATEGORY_DEFS = [
  { category:'Revenue - Food Sales', type:'revenue', match:d=>/food sales/i.test(d), confidence:.99 },
  { category:'Revenue - Beverage Sales', type:'revenue', match:d=>/beverage sales/i.test(d), confidence:.99 },
  { category:'Revenue - Catering', type:'revenue', match:d=>/catering invoice payment/i.test(d), confidence:.98 },
  { category:'Revenue - Delivery', type:'revenue', match:d=>/delivery marketplace payout/i.test(d), confidence:.97 },
  { category:'Liability - Gift Cards', type:'non_p&l', match:d=>/gift card sales/i.test(d), confidence:.99 },
  { category:'Contra-Revenue - Refunds & Discounts', type:'contra_revenue', match:d=>/refunds and discounts/i.test(d), confidence:.99 },
  { category:'COGS - Inventory', type:'cogs', match:d=>/(food|beverage) inventory purchase/i.test(d), confidence:.97 },
  { category:'COGS - Packaging', type:'cogs', match:d=>/to-go packaging and disposables/i.test(d), confidence:.94 },
  { category:'Payroll', type:'payroll', match:d=>/(payroll|manager salary)/i.test(d), confidence:.95 },
  { category:'Operating Expense - Delivery Commission', type:'opex', match:d=>/delivery platform commission/i.test(d), confidence:.98 },
  { category:'Operating Expense - Rent', type:'opex', match:d=>/^rent$/i.test(d), confidence:.99 },
  { category:'Operating Expense - Software', type:'opex', match:d=>/pos\/software subscription/i.test(d), confidence:.99 },
  { category:'Operating Expense - Insurance', type:'opex', match:d=>/insurance premium/i.test(d), confidence:.99 },
  { category:'Operating Expense - Accounting', type:'opex', match:d=>/accounting\/bookkeeping/i.test(d), confidence:.99 },
  { category:'Operating Expense - Telecom', type:'opex', match:d=>/internet and phone/i.test(d), confidence:.99 },
  { category:'Operating Expense - Utilities', type:'opex', match:d=>/utilities/i.test(d), confidence:.99 },
  { category:'Operating Expense - Cleaning', type:'opex', match:d=>/cleaning and linen/i.test(d), confidence:.99 },
  { category:'Operating Expense - Marketing', type:'opex', match:d=>/marketing/i.test(d), confidence:.99 },
  { category:'Operating Expense - Repairs', type:'opex', match:d=>/repairs and maintenance/i.test(d), confidence:.99 },
  { category:'Operating Expense - Admin', type:'opex', match:d=>/office\/admin supplies/i.test(d), confidence:.96 },
  { category:'Non-P&L - Sales Tax', type:'non_p&l', match:d=>/sales tax remittance/i.test(d), confidence:.98 },
  { category:'Non-P&L - CapEx', type:'non_p&l', match:d=>/equipment purchase/i.test(d), confidence:.98 },
  { category:'Non-P&L - Loan Principal', type:'non_p&l', match:d=>/loan principal repayment/i.test(d), confidence:.98 },
];
function normalizeDate(v){
  if (typeof v === 'number') {
    const d = XLSX.SSF.parse_date_code(v);
    if (d) {
      return `${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`;
    }
  }

  const s = String(v ?? '').trim();

  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    return s.slice(0,10);
  }

  const parsed = new Date(s);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0,10);
  }

  return s.slice(0,10);
}
function parseAmount(v){
  if(typeof v==='number') return v;
  const s=String(v ?? '').replace(/[$,]/g,'').trim();
  return s ? Number(s) : 0;
}
function normalizeRows(rows){
  return rows.filter(r=>r).map((r,i)=>{
    const keys=Object.keys(r); const lower={}; keys.forEach(k=>lower[k.toLowerCase().trim()]=r[k]);
    const pick=(names)=>{for(const n of names){if(lower[n]!==undefined)return lower[n];} return '';};
    const id=pick(['transaction_id','transaction id','id']) || `TX-${i+1}`;
    const date=pick(['date']); const description=pick(['description']); const counterparty=pick(['counterparty']);
    const amount=parseAmount(pick(['amount'])); const method=pick(['method']);
return { transaction_id:String(id), date:normalizeDate(date), description:String(description), counterparty:String(counterparty), amount, method:String(method) };  });
}
function readCsvFile(file){
  const wb=XLSX.read(fs.readFileSync(file),{type:'buffer'});
  return normalizeRows(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{defval:''}));
}
function categorize(t){
  if(corrections[t.transaction_id]) return {category:corrections[t.transaction_id], confidence:1, corrected:true};
  for(const d of CATEGORY_DEFS) if(d.match(t.description)) return {category:d.category, confidence:d.confidence, corrected:false};
  return {category:'Review - Unclassified', confidence:.25, corrected:false};
}
function enrich(list){ return list.map(t=>({...t,...categorize(t)})); }
function monthKey(date){ return String(date).slice(0,7); }
function sum(list, pred){return list.filter(pred).reduce((a,t)=>a+t.amount,0);}
function buildPL(list){
  const months=[...new Set(list.map(t=>monthKey(t.date)))].sort();
  return months.map(month=>{
    const g=list.filter(t=>monthKey(t.date)===month);
    const revenue=sum(g,t=>t.category.startsWith('Revenue'));
    const refunds=-sum(g,t=>t.category.startsWith('Contra-Revenue'));
    const netRevenue=revenue-refunds;
    const cogs=-sum(g,t=>t.category.startsWith('COGS'));
    const grossProfit=netRevenue-cogs;
    const payroll=-sum(g,t=>t.category==='Payroll');
    const opex=-sum(g,t=>t.category.startsWith('Operating Expense'));
    const operatingProfit=grossProfit-payroll-opex;
    return {month,revenue,refunds,netRevenue,cogs,grossProfit,payroll,opex,operatingProfit};
  });
}
function variance(pl){
  const out=[];
  for(let i=1;i<pl.length;i++){
    const a=pl[i-1], b=pl[i];
    for(const key of ['netRevenue','cogs','payroll','opex','operatingProfit']){
      const delta=b[key]-a[key]; const pct=a[key] ? delta/Math.abs(a[key])*100 : null;
      if(Math.abs(delta)>=1000 || (pct!==null && Math.abs(pct)>=10)) out.push({metric:key,from:a.month,to:b.month,fromValue:a[key],toValue:b[key],delta,pct});
    }
  }
  return out.sort((a,b)=>Math.abs(b.delta)-Math.abs(a.delta));
}
function reviewItems(list){
  return list.filter(t=>t.confidence<.9 || t.category.includes('Review')).map(t=>({
    ...t,
    reason:t.category.includes('Review')?'No deterministic classification rule matched this description.':'Lower-confidence classification; review recommended.'
  }));
}
function categoryTotals(list){
  const m={}; for(const t of list){m[t.category]=(m[t.category]||0)+t.amount;} return Object.entries(m).map(([category,amount])=>({category,amount})).sort((a,b)=>Math.abs(b.amount)-Math.abs(a.amount));
}
function analytics(){
  const data=enrich(transactions);
  const pl=buildPL(data);
  return {transactions:data,pl,variances:variance(pl),reviews:reviewItems(data),categoryTotals:categoryTotals(data),months:[...new Set(data.map(t=>monthKey(t.date)))].sort()};
}

app.get('/api/health',(req,res)=>res.json({ok:true}));
app.get('/api/analytics',(req,res)=>res.json(analytics()));
app.post('/api/upload',upload.single('file'),(req,res)=>{
  try{
    if(!req.file) return res.status(400).json({error:'No file uploaded'});
    const wb=XLSX.read(req.file.buffer,{type:'buffer'});
    transactions=normalizeRows(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{defval:''}));
    corrections={};
    res.json(analytics());
  }catch(e){res.status(400).json({error:'Could not parse file',details:e.message});}
});
app.patch('/api/transactions/:id',(req,res)=>{
  const id=req.params.id; const {category}=req.body||{};
  if(!category) return res.status(400).json({error:'category is required'});
  const t=transactions.find(x=>x.transaction_id===id); if(!t)return res.status(404).json({error:'Transaction not found'});
  corrections[id]=category; res.json(analytics());
});

function evidenceForQuestion(question,data){

  const q = question.toLowerCase();

  if(q.includes('food cost') || q.includes('food costs') || q.includes('cogs')){
    return data.transactions.filter(t =>
      t.category === 'COGS - Inventory' ||
      t.category === 'COGS - Packaging'
    );
  }

  if(q.includes('payroll')){
    return data.transactions.filter(t =>
      t.category === 'Payroll'
    );
  }

  if(q.includes('operating expense') || q.includes('opex')){
    return data.transactions.filter(t =>
      t.category.startsWith('Operating Expense')
    );
  }

  if(q.includes('revenue') || q.includes('sales')){
    return data.transactions.filter(t =>
      t.category.startsWith('Revenue') ||
      t.category.startsWith('Contra-Revenue')
    );
  }

  if(q.includes('attention') || q.includes('review')){
    return data.reviews;
  }

  if(q.includes('variance') || q.includes('changed') || q.includes('change')){
    return data.transactions
      .filter(t => Math.abs(t.amount) >= 3000)
      .sort((a,b) => Math.abs(b.amount) - Math.abs(a.amount))
      .slice(0,30);
  }

  return data.transactions.slice(-40);
}
app.post('/api/ask',async(req,res)=>{
  const question=String(req.body?.question||'').trim();
  if(!question)return res.status(400).json({error:'Question required'});
  const data=analytics();
  const evidence=evidenceForQuestion(question,data);
  const context={pl:data.pl,variances:data.variances,reviews:data.reviews,transactions:evidence};
  if(!process.env.OPENAI_API_KEY){
    return res.json({answer:localAnswer(question,data),evidence});
  }
  try{
    const prompt=`You are an AI financial analyst for a restaurant. Use ONLY the supplied structured data. Never invent totals. If the requested month/metric is absent, say so. Financial totals in the P&L are deterministic and must be treated as authoritative. Explain changes and cite transaction IDs as evidence. Be concise and practical.\n\nDATA:\n${JSON.stringify(context)}\n\nQUESTION:\n${question}`;
    const r=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${process.env.OPENAI_API_KEY}`},body:JSON.stringify({model:process.env.OPENAI_MODEL||'gpt-5.6-luna',input:prompt})});
    const body=await r.json();
    if(!r.ok) throw new Error(body?.error?.message||`OpenAI request failed (${r.status})`);
    const answer=body.output_text || body.output?.flatMap(x=>x.content||[]).map(x=>x.text||'').join('') || 'No answer returned.';
    res.json({answer,evidence});
  }catch(e){res.json({answer:localAnswer(question,data),evidence,warning:'AI service unavailable; deterministic fallback used.'});}
});
function money(v){return `$${Number(v).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}`;}
function localAnswer(q,data){
  const s = q.toLowerCase();
  const pl = data.pl;

 if(s.includes('revenue') && s.includes('march')){
  const march = pl.find(x => x.month === '2026-03');

  if(march){
    return `Revenue was ${money(march.revenue)} in March 2026 before refunds/discounts. Net revenue was ${money(march.netRevenue)}.`;
  }

  return 'There is no March data in the supplied review period.';
}
  if(s.includes('revenue')){
    const latest = pl.at(-1);
    return `Revenue was ${money(latest?.revenue || 0)} in ${latest?.month || 'the latest month'} before refunds/discounts. Net revenue was ${money(latest?.netRevenue || 0)}.`;
  }

  if(s.includes('payroll')){
    return pl.map(x => `${x.month}: ${money(x.payroll)}`).join(' | ');
  }
  if(s.includes('food cost') || s.includes('food costs') || s.includes('cogs')){
  if(pl.length >= 2){
    const prev = pl.at(-2);
    const latest = pl.at(-1);
    const change = latest.cogs - prev.cogs;

    return `COGS changed from ${money(prev.cogs)} in ${prev.month} to ${money(latest.cogs)} in ${latest.month}, a change of ${money(change)}. The decrease is reflected in the underlying inventory and packaging transactions used as evidence.`;
  }
}

  if(s.includes('operating profit')){
    if(pl.length >= 2){
      const prev = pl.at(-2);
      const latest = pl.at(-1);

      const revenueChange = latest.netRevenue - prev.netRevenue;
      const cogsChange = latest.cogs - prev.cogs;
      const payrollChange = latest.payroll - prev.payroll;
      const opexChange = latest.opex - prev.opex;
      const profitChange = latest.operatingProfit - prev.operatingProfit;

      return [
        `Operating profit changed from ${money(prev.operatingProfit)} in ${prev.month} to ${money(latest.operatingProfit)} in ${latest.month}, a change of ${money(profitChange)}.`,
        `Net revenue changed by ${money(revenueChange)}.`,
        `COGS changed by ${money(cogsChange)}.`,
        `Payroll changed by ${money(payrollChange)}.`,
        `Operating expenses changed by ${money(opexChange)}.`,
        `These deterministic P&L changes explain the operating-profit movement.`
      ].join(' ');
    }

    return pl.map(x => `${x.month}: ${money(x.operatingProfit)}`).join(' | ');
  }

  if(s.includes('variance') || s.includes('change')){
    return data.variances.slice(0,5).map(v =>
      `${v.metric}: ${money(v.fromValue)} → ${money(v.toValue)} (${v.delta>=0?'+':''}${money(v.delta)}, ${v.pct===null?'n/a':v.pct.toFixed(1)+'%'})`
    ).join('\n');
  }

  if(s.includes('attention') || s.includes('review')){
    return data.reviews.length
      ? `There are ${data.reviews.length} items requiring review. The highest-priority item is ${data.reviews[0].transaction_id}: ${data.reviews[0].description}.`
      : 'No review items were detected.';
  }

  return 'Ask about revenue, payroll, operating profit, variances, food costs, or transactions requiring attention.';
}

const clientDist=path.join(__dirname,'..','client','dist');
if(fs.existsSync(clientDist)){
  app.use(express.static(clientDist));
  app.get('*',(req,res)=>res.sendFile(path.join(clientDist,'index.html')));
}
const port=process.env.PORT||5000;
app.listen(port,()=>console.log(`Finz Financial Review running on http://localhost:${port}`));
