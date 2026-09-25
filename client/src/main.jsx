import React,{useEffect,useMemo,useState} from 'react';
import {createRoot} from 'react-dom/client';
import './styles.css';

const API=import.meta.env.VITE_API_URL||'http://localhost:5000';
const money=v=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(v||0);
const pct=v=>v==null?'—':`${v>=0?'+':''}${v.toFixed(1)}%`;

function App(){
 const [data,setData]=useState(null),[tab,setTab]=useState('overview'),[loading,setLoading]=useState(true),[uploading,setUploading]=useState(false),[ask,setAsk]=useState(''),[answer,setAnswer]=useState(null),[asking,setAsking]=useState(false),[selected,setSelected]=useState(null),[filter,setFilter]=useState('all');
 useEffect(()=>{fetch(`${API}/api/analytics`).then(r=>r.json()).then(setData).finally(()=>setLoading(false));},[]);
 const upload=async e=>{const file=e.target.files?.[0];if(!file)return;setUploading(true);const fd=new FormData();fd.append('file',file);const r=await fetch(`${API}/api/upload`,{method:'POST',body:fd});const j=await r.json();setData(j);setUploading(false);setTab('overview');};
 const correct=async(id,category)=>{const r=await fetch(`${API}/api/transactions/${id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({category})});setData(await r.json());};
 const askAI=async()=>{if(!ask.trim())return;setAsking(true);setAnswer(null);const r=await fetch(`${API}/api/ask`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({question:ask})});setAnswer(await r.json());setAsking(false);};
 if(loading||!data)return <div className="loading">Loading financial review…</div>;
 const latest=data.pl.at(-1), previous=data.pl.at(-2);
 const visible=data.transactions.filter(t=>filter==='all'||(filter==='review'?data.reviews.some(r=>r.transaction_id===t.transaction_id):t.category.includes(filter)));
 return <div className="app">
  <header><div><div className="eyebrow">FINZ • SOFTWARE ENGINEERING INTERNSHIP</div><h1>Financial Review</h1><p>AI-native review of raw restaurant transactions.</p></div><label className="upload">{uploading?'Processing…':'Upload transactions'}<input type="file" accept=".csv,.xlsx,.xls" onChange={upload}/></label></header>
  <nav>{[['overview','Overview'],['transactions','Transactions'],['pnl','P&L'],['variances','Variances'],['analyst','AI Analyst']].map(([k,l])=><button className={tab===k?'active':''} onClick={()=>setTab(k)} key={k}>{l}</button>)}</nav>
  {tab==='overview'&&<>
   <section className="hero"><div><span className="badge">{data.transactions.length} transactions • {data.months.join(' → ')}</span><h2>From raw transactions to an explainable financial review.</h2><p>Deterministic accounting logic calculates financials. AI is used for interpretation and investigation, with transaction-level evidence.</p></div><div className="heroStat"><span>Latest operating profit</span><strong>{money(latest?.operatingProfit)}</strong><small>{latest?.month}</small></div></section>
   <section className="cards">{[['Net revenue','netRevenue'],['COGS','cogs'],['Payroll','payroll'],['Operating expenses','opex'],['Operating profit','operatingProfit']].map(([l,k])=><div className="card" key={l}><span>{l}</span><strong>{money(latest?.[k])}</strong>{previous&&<small>{pct((latest?.[k]-previous?.[k])/Math.abs(previous?.[k]||1)*100)}</small>}</div>)}</section>
   <section className="grid2"><div className="panel"><div className="panelHead"><h3>Material variances</h3><button onClick={()=>setTab('variances')}>View all →</button></div>{data.variances.slice(0,4).map(v=><div className="variance" key={v.metric+v.to}><div><b>{pretty(v.metric)}</b><span>{v.from} → {v.to}</span></div><strong className={v.delta<0?'negative':'positive'}>{v.delta>=0?'+':''}{money(v.delta)}</strong></div>)}{!data.variances.length&&<p className="muted">No material variances found.</p>}</div>
   <div className="panel"><div className="panelHead"><h3>Needs review</h3><button onClick={()=>{setFilter('review');setTab('transactions')}}>Review items →</button></div>{data.reviews.slice(0,5).map(t=><div className="review" key={t.transaction_id} onClick={()=>setSelected(t)}><span className="warn">!</span><div><b>{t.transaction_id} · {t.description}</b><small>{t.reason}</small></div><strong>{money(t.amount)}</strong></div>)}{!data.reviews.length&&<p className="muted">Nothing flagged.</p>}</div></section>
  </>}
  {tab==='transactions'&&<Transactions data={data} visible={visible} filter={filter} setFilter={setFilter} setSelected={setSelected} correct={correct}/>} 
  {tab==='pnl'&&<PnL pl={data.pl}/>} 
  {tab==='variances'&&<Variances data={data} setSelected={setSelected}/>} 
  {tab==='analyst'&&<Analyst ask={ask} setAsk={setAsk} askAI={askAI} answer={answer} asking={asking} setSelected={setSelected}/>} 
  {selected&&<Drawer t={selected} close={()=>setSelected(null)}/>} 
  <footer>Finz Financial Review • deterministic calculations + traceable evidence</footer>
 </div>
}
function pretty(k){return k.replace(/([A-Z])/g,' $1').replace(/^./,x=>x.toUpperCase());}
function Transactions({data,visible,filter,setFilter,setSelected,correct}){const options=['all','review','COGS','Payroll','Operating Expense','Revenue','Non-P&L','Contra-Revenue'];return <section><div className="sectionHead"><div><h2>Transactions</h2><p>Every classification is visible, editable, and traceable.</p></div><select value={filter} onChange={e=>setFilter(e.target.value)}>{options.map(x=><option key={x} value={x}>{x==='all'?'All transactions':x}</option>)}</select></div><div className="tableWrap"><table><thead><tr><th>ID</th><th>Date</th><th>Description</th><th>Amount</th><th>Category</th><th>Confidence</th></tr></thead><tbody>{visible.map(t=><tr key={t.transaction_id}><td><button className="link" onClick={()=>setSelected(t)}>{t.transaction_id}</button></td><td>{t.date}</td><td>{t.description}<small>{t.counterparty}</small></td><td className={t.amount<0?'negative':''}>{money(t.amount)}</td><td><select value={t.category} onChange={e=>correct(t.transaction_id,e.target.value)}>{[...new Set([...data.categoryTotals.map(x=>x.category),t.category,'Review - Unclassified'])].map(c=><option key={c}>{c}</option>)}</select></td><td><span className={t.confidence<.9?'confidence low':'confidence'}>{Math.round(t.confidence*100)}%</span></td></tr>)}</tbody></table></div></section>}
function PnL({pl}){return <section><div className="sectionHead"><div><h2>Monthly P&L</h2><p>Calculated directly from classified transactions. No LLM-generated totals.</p></div></div><div className="tableWrap"><table><thead><tr><th>Metric</th>{pl.map(x=><th key={x.month}>{x.month}</th>)}</tr></thead><tbody>{[['Revenue','revenue'],['Refunds & discounts','refunds'],['Net Revenue','netRevenue'],['Cost of Goods Sold','cogs'],['Gross Profit','grossProfit'],['Payroll','payroll'],['Operating Expenses','opex'],['Operating Profit','operatingProfit']].map(([l,k])=><tr key={k}><td><b>{l}</b></td>{pl.map(x=><td key={x.month} className={x[k]<0?'negative':''}>{money(x[k])}</td>)}</tr>)}</tbody></table></div><div className="note"><b>Accounting boundary:</b> gift-card sales, sales-tax remittance, equipment purchase, and loan principal are excluded from P&L because they require different accounting treatment in this simplified review model.</div></section>}
function Variances({data,setSelected}){
  const getEvidence = (metric) => {
    let transactions = data.transactions;

    if(metric === 'netRevenue'){
      transactions = transactions.filter(t =>
        t.category.startsWith('Revenue') ||
        t.category.startsWith('Contra-Revenue')
      );
    } else if(metric === 'payroll'){
      transactions = transactions.filter(t =>
        t.category === 'Payroll'
      );
    } else if(metric === 'cogs'){
      transactions = transactions.filter(t =>
        t.category.startsWith('COGS')
      );
    } else if(metric === 'opex'){
      transactions = transactions.filter(t =>
        t.category.startsWith('Operating Expense')
      );
    }

    return transactions
      .sort((a,b) => Math.abs(b.amount) - Math.abs(a.amount))
      .slice(0,5);
  };

  return (
    <section>
      <div className="sectionHead">
        <div>
          <h2>Material variances</h2>
          <p>Threshold: absolute change ≥ $1,000 or ≥ 10% between periods.</p>
        </div>
      </div>

      <div className="grid2">
        {data.variances.map(v => (
          <div className="panel" key={v.metric+v.to}>
            <h3>{pretty(v.metric)}</h3>

            <div className="bigDelta">
              {v.delta>=0?'+':''}{money(v.delta)}
              <span>{pct(v.pct)}</span>
            </div>

            <p>
              {v.from} {money(v.fromValue)} → {v.to} {money(v.toValue)}
            </p>

            <div className="evidence">
              {getEvidence(v.metric).map(t => (
                <button
                  onClick={() => setSelected(t)}
                  key={t.transaction_id}
                >
                  {t.transaction_id}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
function Analyst({ask,setAsk,askAI,answer,asking,setSelected}){const suggestions=['What was our revenue in March?','How much did we spend on payroll each month?','Why did operating profit change between February and March?','What drove the increase in food costs?','Which transactions need my attention?'];return <section><div className="analyst"><div className="eyebrow">AI FINANCIAL ANALYST</div><h2>Ask questions. Get evidence.</h2><p>The AI layer interprets structured data; financial calculations remain deterministic.</p><div className="suggestions">{suggestions.map(q=><button onClick={()=>setAsk(q)} key={q}>{q}</button>)}</div><div className="askbar"><input value={ask} onChange={e=>setAsk(e.target.value)} onKeyDown={e=>e.key==='Enter'&&askAI()} placeholder="Ask about revenue, payroll, food costs, variances…"/><button onClick={askAI}>{asking?'Analyzing…':'Ask'}</button></div>{answer&&<div className="answer"><h3>Answer</h3><p>{answer.answer}</p>{answer.warning&&<div className="warning">{answer.warning}</div>}<h4>Evidence</h4><div className="evidenceList">{answer.evidence?.slice(0,12).map(t=><button onClick={()=>setSelected(t)} key={t.transaction_id}><b>{t.transaction_id}</b> {t.description} <span>{money(t.amount)}</span></button>)}</div></div>}</div></section>}
function Drawer({t,close}){return <div className="overlay" onClick={close}><aside onClick={e=>e.stopPropagation()}><button className="close" onClick={close}>×</button><div className="eyebrow">TRANSACTION EVIDENCE</div><h2>{t.transaction_id}</h2><p>{t.description}</p><dl><dt>Date</dt><dd>{t.date}</dd><dt>Counterparty</dt><dd>{t.counterparty}</dd><dt>Amount</dt><dd className={t.amount<0?'negative':''}>{money(t.amount)}</dd><dt>Method</dt><dd>{t.method}</dd><dt>Category</dt><dd>{t.category}</dd><dt>Confidence</dt><dd>{Math.round(t.confidence*100)}%</dd></dl><div className="note">This transaction is the underlying evidence used by the review workflow.</div></aside></div>}

createRoot(document.getElementById('root')).render(<App/>);
