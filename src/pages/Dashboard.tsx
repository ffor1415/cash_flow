import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useNavigate } from 'react-router-dom';
import {
  LogOut, Plus, ArrowUpRight, ArrowDownLeft,
  TrendingUp, TrendingDown, Bell, ChevronRight,
  Flame, Target,
} from 'lucide-react';
import {
  PieChart, Pie, Cell, ResponsiveContainer,
  AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts';
import AddTransactionSheet from '@/components/AddTransactionSheet';

const COLORS = [
  'hsl(190,55%,40%)', 'hsl(170,50%,55%)', 'hsl(38,92%,50%)',
  'hsl(280,60%,55%)', 'hsl(0,70%,50%)',   'hsl(210,60%,55%)',
];

const TOOLTIP_STYLE = {
  backgroundColor: 'hsl(210,45%,12%)',
  border: '1px solid hsl(210,30%,20%)',
  borderRadius: '12px',
  color: 'hsl(200,20%,95%)',
  fontSize: '12px',
};

const fmt = (n: number) =>
  '₹' + Math.abs(n).toLocaleString('en-IN', { maximumFractionDigits: 0 });

const greeting = () => {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
};

const relativeDate = (d: string) => {
  const diff = Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff < 7)  return `${diff}d ago`;
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
};

const Dashboard = () => {
  const { user, signOut } = useAuth();
  const navigate          = useNavigate();
  const [showAdd, setShowAdd]           = useState(false);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [borrowLend, setBorrowLend]     = useState<any[]>([]);
  const [loading, setLoading]           = useState(true);

  const username = user?.user_metadata?.username || user?.email?.split('@')[0] || 'there';

  const fetchAll = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const [txRes, blRes] = await Promise.all([
      supabase.from('transactions').select('*').eq('user_id', user.id).order('date', { ascending: false }).limit(100),
      supabase.from('borrow_lend').select('*').eq('user_id', user.id).eq('status', 'pending'),
    ]);
    setTransactions(txRes.data || []);
    setBorrowLend(blRes.data || []);
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const thisMonth = new Date().toISOString().slice(0, 7);
  const monthTx   = transactions.filter(t => t.date?.startsWith(thisMonth));

  const totalIncome  = monthTx.filter(t => t.type === 'income').reduce((s, t) => s + Math.abs(Number(t.amount)), 0);
  const totalExpense = monthTx.filter(t => t.type === 'expense').reduce((s, t) => s + Math.abs(Number(t.amount)), 0);
  const balance      = transactions.reduce((s, t) => s + Number(t.amount), 0);

  const catMap: Record<string, number> = {};
  monthTx.filter(t => t.type === 'expense').forEach(t => {
    catMap[t.category] = (catMap[t.category] || 0) + Math.abs(Number(t.amount));
  });
  const categoryData = Object.entries(catMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, value], i) => ({ name, value, color: COLORS[i] }));

  const monthlyMap: Record<string, { month: string; income: number; expense: number }> = {};
  for (let i = 5; i >= 0; i--) {
    const d = new Date(); d.setMonth(d.getMonth() - i);
    const key = d.toISOString().slice(0, 7);
    const label = d.toLocaleString('default', { month: 'short' });
    monthlyMap[key] = { month: label, income: 0, expense: 0 };
  }
  transactions.forEach(t => {
    const key = t.date?.slice(0, 7);
    if (!monthlyMap[key]) return;
    if (t.type === 'income')  monthlyMap[key].income  += Math.abs(Number(t.amount));
    if (t.type === 'expense') monthlyMap[key].expense += Math.abs(Number(t.amount));
  });
  const chartData = Object.values(monthlyMap);

  const topCat      = categoryData[0];
  const savingsRate = totalIncome > 0 ? Math.round(((totalIncome - totalExpense) / totalIncome) * 100) : 0;
  const pendingLent     = borrowLend.filter(r => r.type === 'lent').reduce((s, r) => s + Number(r.amount), 0);
  const pendingBorrowed = borrowLend.filter(r => r.type === 'borrowed').reduce((s, r) => s + Number(r.amount), 0);
  const recent = transactions.slice(0, 5);

  return (
    <div className="bg-background page-pb w-full overflow-x-hidden">

      {/* ── Gradient header ── */}
      <div className="gradient-balance page-px pt-10 pb-5 rounded-b-3xl relative overflow-hidden">
        <div className="absolute -top-10 -right-10 w-36 h-36 rounded-full bg-white/5 pointer-events-none" />
        <div className="absolute top-4 -right-4 w-20 h-20 rounded-full bg-white/5 pointer-events-none" />

        {/* Top row: greeting + buttons */}
        <div className="flex items-start justify-between mb-4 relative gap-2">
          <div className="min-w-0">
            <p className="text-primary-foreground/70 text-sm">{greeting()},</p>
            <h1 className="text-lg font-heading font-bold text-primary-foreground capitalize truncate">{username} 👋</h1>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => navigate('/borrow-lend')}
              className="relative p-2 rounded-xl bg-primary-foreground/10 backdrop-blur touch-min"
              aria-label="Notifications"
            >
              <Bell className="w-5 h-5 text-primary-foreground" />
              {borrowLend.length > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-destructive rounded-full text-[9px] font-bold text-white flex items-center justify-center">
                  {borrowLend.length}
                </span>
              )}
            </button>
            <button
              onClick={signOut}
              className="p-2 rounded-xl bg-primary-foreground/10 backdrop-blur touch-min"
              aria-label="Sign out"
            >
              <LogOut className="w-5 h-5 text-primary-foreground" />
            </button>
          </div>
        </div>

        {/* Balance card */}
        <div className="bg-primary-foreground/10 backdrop-blur-xl rounded-2xl p-4 border border-primary-foreground/20">
          <p className="text-primary-foreground/60 text-xs uppercase tracking-wider font-medium mb-1">Net Balance</p>
          <h2 className={`font-heading font-bold mb-3 ${balance >= 0 ? 'text-primary-foreground' : 'text-red-300'}`}
              style={{ fontSize: 'clamp(1.75rem, 8vw, 2.5rem)' }}>
            {balance < 0 ? '-' : ''}{fmt(balance)}
          </h2>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-success/25 flex items-center justify-center flex-shrink-0">
                <ArrowDownLeft className="w-4 h-4 text-success" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] text-primary-foreground/60 font-medium uppercase tracking-wide leading-tight">Income</p>
                <p className="text-sm font-bold text-primary-foreground truncate">{fmt(totalIncome)}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-destructive/25 flex items-center justify-center flex-shrink-0">
                <ArrowUpRight className="w-4 h-4 text-destructive" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] text-primary-foreground/60 font-medium uppercase tracking-wide leading-tight">Spent</p>
                <p className="text-sm font-bold text-primary-foreground truncate">{fmt(totalExpense)}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="page-px mt-4 space-y-4">

        {/* ── Quick stats ── */}
        {!loading && (
          <div className="grid grid-cols-3 gap-2">
            <div className="glass-card p-3 text-center">
              <Target className="w-4 h-4 text-primary mx-auto mb-1" />
              <p className="text-xs text-muted-foreground leading-tight">Saved</p>
              <p className={`text-sm font-bold ${savingsRate >= 20 ? 'text-success' : savingsRate >= 0 ? 'text-warning' : 'text-destructive'}`}>
                {savingsRate}%
              </p>
            </div>
            <div className="glass-card p-3 text-center cursor-pointer active:scale-95 transition-transform" onClick={() => navigate('/borrow-lend')}>
              <TrendingUp className="w-4 h-4 text-success mx-auto mb-1" />
              <p className="text-xs text-muted-foreground leading-tight">Lent</p>
              <p className="text-sm font-bold text-success truncate">{fmt(pendingLent)}</p>
            </div>
            <div className="glass-card p-3 text-center cursor-pointer active:scale-95 transition-transform" onClick={() => navigate('/borrow-lend')}>
              <TrendingDown className="w-4 h-4 text-destructive mx-auto mb-1" />
              <p className="text-xs text-muted-foreground leading-tight">Owe</p>
              <p className="text-sm font-bold text-destructive truncate">{fmt(pendingBorrowed)}</p>
            </div>
          </div>
        )}

        {/* ── Spending alert ── */}
        {!loading && topCat && totalExpense > 0 && (
          <div className="glass-card p-3 flex items-center gap-3 border-l-4 border-warning">
            <Flame className="w-5 h-5 text-warning flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground truncate">Top spend: {topCat.name}</p>
              <p className="text-xs text-muted-foreground truncate">
                {fmt(topCat.value)} · {Math.round((topCat.value / totalExpense) * 100)}% of expenses
              </p>
            </div>
          </div>
        )}

        {/* ── 6-month area chart ── */}
        {!loading && chartData.some(d => d.income > 0 || d.expense > 0) && (
          <div className="glass-card p-4">
            <h3 className="text-sm font-heading font-semibold text-foreground mb-3">6-Month Overview</h3>
            <div style={{ height: 160 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                  <defs>
                    <linearGradient id="incomeGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="hsl(160,60%,45%)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(160,60%,45%)" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="expenseGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="hsl(0,70%,50%)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(0,70%,50%)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(210,20%,88%)" />
                  <XAxis dataKey="month" tick={{ fill: 'hsl(200,15%,55%)', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: 'hsl(200,15%,55%)', fontSize: 9 }} axisLine={false} tickLine={false}
                    tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(0)}k` : String(v)} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: any) => fmt(v)} />
                  <Area type="monotone" dataKey="income"  stroke="hsl(160,60%,45%)" strokeWidth={2} fill="url(#incomeGrad)"  dot={false} name="Income" />
                  <Area type="monotone" dataKey="expense" stroke="hsl(0,70%,50%)"   strokeWidth={2} fill="url(#expenseGrad)" dot={false} name="Expense" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="flex gap-3 mt-2">
              {[{ color: 'hsl(160,60%,45%)', label: 'Income' }, { color: 'hsl(0,70%,50%)', label: 'Expense' }].map(l => (
                <div key={l.label} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: l.color }} />
                  {l.label}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Category pie ── */}
        {!loading && categoryData.length > 0 && (
          <div className="glass-card p-4">
            <h3 className="text-sm font-heading font-semibold text-foreground mb-3">This Month by Category</h3>
            <div className="flex gap-3 items-center">
              <div className="flex-shrink-0" style={{ width: 120, height: 120 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={categoryData} cx="50%" cy="50%" innerRadius={34} outerRadius={56} paddingAngle={3} dataKey="value" startAngle={90} endAngle={-270}>
                      {categoryData.map((e, i) => <Cell key={i} fill={e.color} stroke="none" />)}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex-1 min-w-0 space-y-1.5">
                {categoryData.map((cat) => (
                  <div key={cat.name} className="flex items-center justify-between gap-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: cat.color }} />
                      <span className="text-xs text-muted-foreground truncate">{cat.name}</span>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <span className="text-xs font-semibold text-foreground">{fmt(cat.value)}</span>
                      <span className="text-[9px] text-muted-foreground w-6 text-right">
                        {totalExpense > 0 ? Math.round((cat.value / totalExpense) * 100) : 0}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Recent transactions ── */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-heading font-semibold text-foreground">Recent Transactions</h3>
            <button
              onClick={() => navigate('/transactions')}
              className="flex items-center gap-0.5 text-xs text-primary font-medium touch-min"
            >
              See all <ChevronRight className="w-3 h-3" />
            </button>
          </div>

          {loading ? (
            <div className="space-y-2">
              {[1,2,3].map(i => (
                <div key={i} className="glass-card p-3 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-secondary animate-pulse flex-shrink-0" />
                  <div className="flex-1 space-y-2 min-w-0">
                    <div className="h-3 bg-secondary rounded-full animate-pulse w-3/4" />
                    <div className="h-2 bg-secondary rounded-full animate-pulse w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : recent.length === 0 ? (
            <div className="glass-card p-8 text-center text-muted-foreground">
              <p className="text-2xl mb-2">💸</p>
              <p className="text-sm font-medium">No transactions yet</p>
              <p className="text-xs mt-1">Tap + to add your first one</p>
            </div>
          ) : (
            <div className="space-y-2">
              {recent.map(tx => (
                <div key={tx.id} className="glass-card p-3 flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-base flex-shrink-0 ${
                    tx.type === 'income' ? 'bg-success/15' : 'bg-secondary'
                  }`}>
                    {tx.icon || '💸'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{tx.title}</p>
                    <p className="text-xs text-muted-foreground truncate">{tx.category} · {relativeDate(tx.date)}</p>
                  </div>
                  <p className={`text-sm font-bold flex-shrink-0 ${tx.type === 'income' ? 'text-success' : 'text-destructive'}`}>
                    {tx.type === 'income' ? '+' : '-'}{fmt(Math.abs(Number(tx.amount)))}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>

      {/* FAB */}
      <button
        onClick={() => setShowAdd(true)}
        className="fixed bottom-24 right-4 z-40 w-13 h-13 gradient-primary rounded-2xl flex items-center justify-center shadow-xl active:scale-95 transition-transform"
        style={{ width: 52, height: 52, bottom: 'calc(env(safe-area-inset-bottom, 0px) + 5rem)' }}
        aria-label="Add transaction"
      >
        <Plus className="w-6 h-6 text-primary-foreground" />
      </button>

      <AddTransactionSheet open={showAdd} onOpenChange={setShowAdd} onSaved={fetchAll} />
    </div>
  );
};

export default Dashboard;