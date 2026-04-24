import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import {
  FileText, Download, TrendingUp, TrendingDown,
  Wallet, Filter, BarChart3,
  PieChart as PieIcon, X,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';

interface Transaction {
  id: string; title: string; amount: number;
  type: 'income' | 'expense'; category: string; date: string; icon?: string;
}
interface TxRow extends Transaction { runningBalance: number; }

const fmt = (n: number) =>
  '₹' + Math.abs(n).toLocaleString('en-IN', { minimumFractionDigits: 2 });

const fmtShort = (n: number) => {
  const abs = Math.abs(n);
  if (abs >= 100000) return '₹' + (abs / 100000).toFixed(1) + 'L';
  if (abs >= 1000)   return '₹' + (abs / 1000).toFixed(1) + 'K';
  return '₹' + abs.toFixed(0);
};

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

const fmtDateLong = (d: string) =>
  new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' });

const toInput = (d: Date) => d.toISOString().split('T')[0];

const CHART_COLORS = [
  '#1d6fa8','#2eab7c','#f59e0b','#ef4444',
  '#8b5cf6','#ec4899','#06b6d4','#84cc16',
];

const TOOLTIP_STYLE = {
  backgroundColor: '#fff',
  border: '1px solid #e2e8f0',
  borderRadius: '8px',
  fontSize: '12px',
  color: '#1e293b',
};

const Reports = () => {
  const { user } = useAuth();

  const today    = new Date();
  const monthAgo = new Date(today); monthAgo.setMonth(today.getMonth() - 1);

  const [fromDate, setFromDate]       = useState(toInput(monthAgo));
  const [toDate, setToDate]           = useState(toInput(today));
  const [categoryFilter, setCategory] = useState('All');
  const [typeFilter, setType]         = useState('All');
  const [showFilters, setShowFilters] = useState(false);
  const [activeTab, setActiveTab]     = useState<'statement' | 'charts'>('statement');

  const [allTx, setAllTx]           = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading]       = useState(true);

  const fetchAll = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from('transactions').select('*')
      .eq('user_id', user.id).order('date', { ascending: true });
    const rows = (data || []) as Transaction[];
    setAllTx(rows);
    setCategories([...new Set(rows.map(r => r.category).filter(Boolean))].sort());
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const filtered = allTx.filter(tx => {
    if (tx.date < fromDate || tx.date > toDate) return false;
    if (categoryFilter !== 'All' && tx.category !== categoryFilter) return false;
    if (typeFilter === 'Income'  && tx.type !== 'income')  return false;
    if (typeFilter === 'Expense' && tx.type !== 'expense') return false;
    return true;
  });

  const totalIncome  = filtered.filter(t => t.type === 'income' ).reduce((s, t) => s + Math.abs(t.amount), 0);
  const totalExpense = filtered.filter(t => t.type === 'expense').reduce((s, t) => s + Math.abs(t.amount), 0);
  const netBalance   = totalIncome - totalExpense;
  const savingsRate  = totalIncome > 0 ? ((netBalance / totalIncome) * 100).toFixed(1) : '0.0';

  let running = 0;
  const rows: TxRow[] = filtered.map(tx => {
    running += tx.type === 'income' ? Math.abs(tx.amount) : -Math.abs(tx.amount);
    return { ...tx, runningBalance: running };
  });

  const catMap: Record<string, number> = {};
  filtered.filter(t => t.type === 'expense').forEach(t => {
    catMap[t.category] = (catMap[t.category] || 0) + Math.abs(t.amount);
  });
  const pieData = Object.entries(catMap)
    .sort((a, b) => b[1] - a[1]).slice(0, 8)
    .map(([name, value]) => ({ name, value }));

  const monthMap: Record<string, { month: string; income: number; expense: number }> = {};
  filtered.forEach(t => {
    const key = t.date.slice(0, 7);
    const label = new Date(t.date).toLocaleString('default', { month: 'short', year: '2-digit' });
    if (!monthMap[key]) monthMap[key] = { month: label, income: 0, expense: 0 };
    if (t.type === 'income')  monthMap[key].income  += Math.abs(t.amount);
    if (t.type === 'expense') monthMap[key].expense += Math.abs(t.amount);
  });
  const barData = Object.values(monthMap);

  const exportCSV = () => {
    const headers = ['Date', 'Description', 'Category', 'Debit (Dr)', 'Credit (Cr)', 'Balance'];
    const lines = rows.map(r => [
      r.date,
      `"${r.title}"`,
      r.category,
      r.type === 'expense' ? Math.abs(r.amount).toFixed(2) : '',
      r.type === 'income'  ? Math.abs(r.amount).toFixed(2) : '',
      r.runningBalance.toFixed(2),
    ].join(','));
    const csv = [headers.join(','), ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `CashesFlow_Statement_${fromDate}_${toDate}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const downloadStatement = () => {
    const userEmail = user?.email || '';
    const genTime   = new Date().toLocaleString('en-IN', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' });

    const tableRows = rows.map((r, idx) => `
      <tr style="background:${idx % 2 === 0 ? '#ffffff' : '#f8fafc'}">
        <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;font-size:12px;white-space:nowrap">${fmtDate(r.date)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;font-size:12px">${r.title}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;font-size:12px;color:#64748b">${r.category}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;font-size:12px;text-align:right;color:${r.type==='expense'?'#dc2626':'#94a3b8'};font-weight:${r.type==='expense'?'600':'400'}">
          ${r.type === 'expense' ? fmt(r.amount) : ''}
        </td>
        <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;font-size:12px;text-align:right;color:${r.type==='income'?'#16a34a':'#94a3b8'};font-weight:${r.type==='income'?'600':'400'}">
          ${r.type === 'income' ? fmt(r.amount) : ''}
        </td>
        <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;font-size:12px;text-align:right;font-weight:600;color:${r.runningBalance>=0?'#1e293b':'#dc2626'}">
          ${r.runningBalance < 0 ? '-' : ''}${fmt(r.runningBalance)}
        </td>
      </tr>`).join('');

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"/><title>Cashes Flow Statement</title>
<style>*{margin:0;padding:0;box-sizing:border-box;}body{font-family:Arial,sans-serif;background:#fff;color:#1e293b;}@media print{@page{margin:15mm}}</style>
</head><body>
<div style="background:linear-gradient(135deg,#1d3a6b,#1d6fa8);padding:20px 32px;display:flex;align-items:center;gap:16px;">
<div style="font-size:22px;font-weight:800;color:#fff">CashesFlow</div></div>
<div style="padding:24px 32px 16px">
<div style="font-size:18px;font-weight:700;text-transform:uppercase;letter-spacing:1px;border-bottom:2px solid #1d6fa8;padding-bottom:10px;margin-bottom:20px">Account Statement</div>
<table style="width:100%;border:1px solid #e2e8f0;font-size:12px;margin-bottom:24px">
<tr style="background:#f8fafc"><td style="padding:10px 16px;color:#64748b;font-weight:600">User:</td><td style="padding:10px 16px">${userEmail}</td>
<td style="padding:10px 16px;color:#64748b;font-weight:600">Generated:</td><td style="padding:10px 16px">${genTime}</td></tr>
<tr><td style="padding:10px 16px;color:#64748b;font-weight:600;border-top:1px solid #e2e8f0">From:</td><td style="padding:10px 16px;border-top:1px solid #e2e8f0">${fmtDateLong(fromDate)}</td>
<td style="padding:10px 16px;color:#64748b;font-weight:600;border-top:1px solid #e2e8f0">To:</td><td style="padding:10px 16px;border-top:1px solid #e2e8f0">${fmtDateLong(toDate)}</td></tr>
</table>
<table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0">
<thead><tr style="background:linear-gradient(135deg,#1d3a6b,#1d6fa8)">
${['Date','Description','Category','Debit','Credit','Balance'].map(h=>`<th style="padding:11px 10px;text-align:left;font-size:11px;font-weight:700;color:#fff">${h}</th>`).join('')}
</tr></thead><tbody>${tableRows}</tbody></table>
<div style="padding:12px 10px;background:#f8fafc;border:1px solid #e2e8f0;border-top:none">
<span style="font-size:12px;font-weight:700">Debits: ${fmt(totalExpense)} | Credits: ${fmt(totalIncome)} | Net: ${fmt(netBalance)}</span>
</div></div><script>window.onload=()=>window.print();</script></body></html>`;

    const w = window.open('', '_blank', 'width=900,height=700');
    if (w) { w.document.write(html); w.document.close(); }
  };

  const activeFilters = [
    categoryFilter !== 'All' && categoryFilter,
    typeFilter !== 'All' && typeFilter,
  ].filter(Boolean) as string[];

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="bg-card border-b border-border px-4 pt-12 pb-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
              <FileText className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-lg font-heading font-bold text-foreground">Reports</h1>
              <p className="text-[11px] text-muted-foreground">Account statement & analytics</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={exportCSV}
              className="flex items-center gap-1.5 px-2.5 py-2 rounded-xl border border-border bg-card text-xs font-semibold text-foreground hover:bg-secondary transition-colors">
              <Download className="w-3.5 h-3.5" /><span>CSV</span>
            </button>
            <button onClick={downloadStatement}
              className="flex items-center gap-1.5 px-2.5 py-2 rounded-xl gradient-primary text-primary-foreground text-xs font-semibold">
              <Download className="w-3.5 h-3.5" /><span>Statement</span>
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex-1 flex items-center gap-2 bg-secondary rounded-xl px-3 py-2">
            <div className="flex-1">
              <p className="text-[9px] text-muted-foreground font-semibold uppercase tracking-wider">From</p>
              <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)}
                className="bg-transparent text-xs font-semibold text-foreground border-0 outline-none w-full" />
            </div>
            <div className="w-px h-6 bg-border" />
            <div className="flex-1">
              <p className="text-[9px] text-muted-foreground font-semibold uppercase tracking-wider">To</p>
              <input type="date" value={toDate} onChange={e => setToDate(e.target.value)}
                className="bg-transparent text-xs font-semibold text-foreground border-0 outline-none w-full" />
            </div>
          </div>
          <button onClick={() => setShowFilters(v => !v)}
            className={`relative w-10 h-10 rounded-xl flex items-center justify-center border transition-colors flex-shrink-0 ${
              activeFilters.length > 0 || showFilters
                ? 'gradient-primary border-transparent'
                : 'bg-secondary border-border'
            }`}>
            <Filter className={`w-4 h-4 ${activeFilters.length > 0 || showFilters ? 'text-primary-foreground' : 'text-muted-foreground'}`} />
          </button>
        </div>

        {showFilters && (
          <div className="mt-3 p-3 bg-secondary/50 rounded-xl border border-border space-y-3">
            <div>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Type</p>
              <div className="flex gap-2">
                {['All', 'Income', 'Expense'].map(t => (
                  <button key={t} onClick={() => setType(t)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      typeFilter === t
                        ? t === 'Income' ? 'bg-success text-white' : t === 'Expense' ? 'bg-destructive text-white' : 'gradient-primary text-primary-foreground'
                        : 'bg-card border border-border text-muted-foreground'
                    }`}>{t}</button>
                ))}
              </div>
            </div>
            {categories.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Category</p>
                <div className="flex gap-1.5 flex-wrap">
                  {['All', ...categories].map(c => (
                    <button key={c} onClick={() => setCategory(c)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                        categoryFilter === c ? 'gradient-primary text-primary-foreground' : 'bg-card border border-border text-muted-foreground'
                      }`}>{c}</button>
                  ))}
                </div>
              </div>
            )}
            {activeFilters.length > 0 && (
              <button onClick={() => { setType('All'); setCategory('All'); }}
                className="flex items-center gap-1 text-xs text-destructive font-medium">
                <X className="w-3 h-3" /> Clear filters
              </button>
            )}
          </div>
        )}
      </div>

      <div className="px-4 pt-4">
        <div className="grid grid-cols-2 gap-3 mb-4">
          {[
            { label: 'Total Income',  value: fmt(totalIncome),  icon: TrendingUp,   color: 'text-success',     border: 'border-l-success'  },
            { label: 'Total Expense', value: fmt(totalExpense), icon: TrendingDown, color: 'text-destructive', border: 'border-l-destructive' },
            { label: 'Net Balance',   value: (netBalance < 0 ? '-' : '') + fmt(netBalance), icon: Wallet, color: netBalance >= 0 ? 'text-primary' : 'text-destructive', border: 'border-l-primary' },
            { label: 'Savings Rate',  value: savingsRate + '%', icon: BarChart3,    color: 'text-accent',      border: 'border-l-accent'   },
          ].map(({ label, value, icon: Icon, color, border }) => (
            <div key={label} className={`glass-card p-3 border-l-4 ${border}`}>
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{label}</p>
                <Icon className={`w-3.5 h-3.5 ${color}`} />
              </div>
              <p className={`text-base font-bold ${color}`}>{value}</p>
            </div>
          ))}
        </div>

        <div className="flex gap-1 p-1 bg-secondary rounded-xl mb-4">
          {[
            { id: 'statement', label: '📋 Statement' },
            { id: 'charts',    label: '📊 Analytics' },
          ].map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id as any)}
              className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${activeTab === t.id ? 'gradient-primary text-primary-foreground shadow-sm' : 'text-muted-foreground'}`}>
              {t.label}
            </button>
          ))}
        </div>

        {activeTab === 'statement' && (
          <div className="glass-card overflow-hidden mb-4">
            <div className="px-4 py-3 flex items-center justify-between" style={{ background: 'linear-gradient(135deg, #1d3a6b, #1d6fa8)' }}>
              <div>
                <p className="text-sm font-bold text-white">Statement Period</p>
                <p className="text-[11px] text-white/70 mt-0.5">{fmtDate(fromDate)} — {fmtDate(toDate)}</p>
              </div>
              <span className="text-xs font-semibold bg-white/15 text-white px-2.5 py-1 rounded-full">
                {filtered.length} txn{filtered.length !== 1 ? 's' : ''}
              </span>
            </div>

            {loading ? (
              <div className="py-12 text-center text-muted-foreground text-sm">Loading...</div>
            ) : rows.length === 0 ? (
              <div className="py-14 text-center">
                <FileText className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-sm font-medium text-muted-foreground">No transactions in this period</p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-[72px_1fr_80px_80px_80px] gap-1 px-3 py-2.5 bg-secondary border-b border-border">
                  {['DATE', 'DESCRIPTION', 'DEBIT', 'CREDIT', 'BALANCE'].map((h, i) => (
                    <p key={h} className={`text-[9px] font-bold text-muted-foreground tracking-wider ${i >= 2 ? 'text-right' : ''}`}>{h}</p>
                  ))}
                </div>

                <div className="divide-y divide-border">
                  {rows.map((tx, idx) => (
                    <div key={tx.id}
                      className={`grid grid-cols-[72px_1fr_80px_80px_80px] gap-1 items-center px-3 py-3 transition-colors ${idx % 2 === 0 ? 'bg-card' : 'bg-secondary/30'} hover:bg-primary/5`}>
                      <p className="text-[10px] text-muted-foreground font-medium">{fmtDate(tx.date)}</p>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-foreground truncate">{tx.title}</p>
                        <span className="text-[9px] bg-secondary text-muted-foreground px-1.5 py-0.5 rounded-md font-medium inline-block mt-0.5">{tx.category}</span>
                      </div>
                      <p className={`text-xs font-bold text-right ${tx.type === 'expense' ? 'text-destructive' : 'text-muted-foreground/30'}`}>
                        {tx.type === 'expense' ? fmt(tx.amount) : '—'}
                      </p>
                      <p className={`text-xs font-bold text-right ${tx.type === 'income' ? 'text-success' : 'text-muted-foreground/30'}`}>
                        {tx.type === 'income' ? fmt(tx.amount) : '—'}
                      </p>
                      <p className={`text-xs font-bold text-right ${tx.runningBalance >= 0 ? 'text-foreground' : 'text-destructive'}`}>
                        {tx.runningBalance < 0 ? '-' : ''}{fmt(tx.runningBalance)}
                      </p>
                    </div>
                  ))}
                </div>

                <div className="flex items-center justify-between px-3 py-3 bg-secondary border-t-2 border-primary/20">
                  <div className="flex items-center gap-3 text-xs">
                    <span className="text-muted-foreground">Debits: <span className="font-bold text-destructive">{fmt(totalExpense)}</span></span>
                    <span className="text-muted-foreground">Credits: <span className="font-bold text-success">{fmt(totalIncome)}</span></span>
                  </div>
                  <p className="text-xs font-bold text-muted-foreground">
                    Closing: <span className={netBalance >= 0 ? 'text-foreground' : 'text-destructive'}>
                      {netBalance < 0 ? '-' : ''}{fmt(netBalance)}
                    </span>
                  </p>
                </div>
              </>
            )}
          </div>
        )}

        {activeTab === 'charts' && (
          <div className="space-y-4 mb-4">
            {barData.length > 0 && (
              <div className="glass-card p-4">
                <h3 className="text-sm font-semibold text-foreground mb-1">Monthly Income vs Expense</h3>
                <p className="text-xs text-muted-foreground mb-4">Compare your earning and spending per month</p>
                <div className="h-52">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={barData} barSize={12} barCategoryGap="30%">
                      <XAxis dataKey="month" tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={fmtShort} />
                      <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: any) => fmt(v)} />
                      <Legend wrapperStyle={{ fontSize: '11px' }} />
                      <Bar dataKey="income"  name="Income"  fill="#2eab7c" radius={[4,4,0,0]} />
                      <Bar dataKey="expense" name="Expense" fill="#ef4444" radius={[4,4,0,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {pieData.length > 0 && (
              <div className="glass-card p-4">
                <h3 className="text-sm font-semibold text-foreground mb-1">Expense by Category</h3>
                <p className="text-xs text-muted-foreground mb-4">Where your money is going</p>
                <div className="h-52">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={pieData} cx="50%" cy="50%" innerRadius={45} outerRadius={80} paddingAngle={3} dataKey="value">
                        {pieData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} stroke="none" />)}
                      </Pie>
                      <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: any) => fmt(v)} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-2 mt-2">
                  {pieData.map((d, i) => (
                    <div key={d.name} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                        <span className="text-xs text-foreground">{d.name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-foreground">{fmt(d.value)}</span>
                        <span className="text-[10px] text-muted-foreground w-8 text-right">
                          {totalExpense > 0 ? Math.round((d.value / totalExpense) * 100) : 0}%
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {filtered.filter(t => t.type === 'expense').length > 0 && (
              <div className="glass-card p-4">
                <h3 className="text-sm font-semibold text-foreground mb-1">Top Expenses</h3>
                <p className="text-xs text-muted-foreground mb-3">Your biggest spends in this period</p>
                <div className="space-y-2">
                  {[...filtered]
                    .filter(t => t.type === 'expense')
                    .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
                    .slice(0, 5)
                    .map((tx, i) => (
                      <div key={tx.id} className="flex items-center gap-3">
                        <div className="w-6 h-6 rounded-full bg-secondary flex items-center justify-center text-[10px] font-bold text-muted-foreground flex-shrink-0">
                          {i + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-foreground truncate">{tx.title}</p>
                          <p className="text-[10px] text-muted-foreground">{tx.category} · {fmtDate(tx.date)}</p>
                        </div>
                        <p className="text-xs font-bold text-destructive flex-shrink-0">{fmt(tx.amount)}</p>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {barData.length === 0 && pieData.length === 0 && (
              <div className="text-center py-16 text-muted-foreground">
                <BarChart3 className="w-12 h-12 mx-auto mb-3 opacity-20" />
                <p className="font-medium">No data to chart</p>
                <p className="text-xs mt-1">Add transactions and adjust filters</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default Reports;
