import { useState, useEffect, useCallback } from 'react';
import {
  Search, ArrowUpRight, ArrowDownLeft, Trash2, Pencil,
  Plus, X, SlidersHorizontal,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import AddTransactionSheet from '@/components/AddTransactionSheet';

const fmt = (n: number) =>
  '₹' + Math.abs(n).toLocaleString('en-IN', { maximumFractionDigits: 0 });

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' });

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

interface Transaction {
  id: string;
  title: string;
  amount: number;
  type: 'income' | 'expense';
  category: string;
  icon?: string;
  date: string;
  notes?: string | null;
}

const Transactions = () => {
  const { user } = useAuth();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading]           = useState(true);
  const [showAdd, setShowAdd]           = useState(false);
  const [showFilters, setShowFilters]   = useState(false);
  const [editTransaction, setEditTransaction] = useState<Transaction | null>(null);

  const [search, setSearch]                 = useState('');
  const [typeFilter, setTypeFilter]         = useState<'All' | 'Income' | 'Expense'>('All');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [monthFilter, setMonthFilter]       = useState('All');
  const [categories, setCategories]         = useState<string[]>([]);

  const fetchTransactions = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from('transactions')
      .select('*')
      .eq('user_id', user.id)
      .order('date', { ascending: false });
    const rows = (data || []) as Transaction[];
    setTransactions(rows);
    const cats = [...new Set(rows.map(r => r.category).filter(Boolean))].sort() as string[];
    setCategories(cats);
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchTransactions(); }, [fetchTransactions]);

  const handleDelete = async (id: string, title: string) => {
    const { error } = await supabase.from('transactions').delete().eq('id', id);
    if (error) { toast.error('Failed to delete'); return; }
    toast.success(`"${title}" deleted`);
    fetchTransactions();
  };

  const handleEdit = (tx: Transaction) => {
    setEditTransaction(tx);
    setShowAdd(true);
  };

  const handleSheetOpenChange = (open: boolean) => {
    setShowAdd(open);
    if (!open) setEditTransaction(null);
  };

  const filtered = transactions.filter(tx => {
    if (search && !tx.title.toLowerCase().includes(search.toLowerCase()) && !tx.category.toLowerCase().includes(search.toLowerCase())) return false;
    if (typeFilter !== 'All' && tx.type !== typeFilter.toLowerCase()) return false;
    if (categoryFilter !== 'All' && tx.category !== categoryFilter) return false;
    if (monthFilter !== 'All') {
      const txMonth = new Date(tx.date).getMonth();
      if (txMonth !== parseInt(monthFilter)) return false;
    }
    return true;
  });

  const grouped: Record<string, Transaction[]> = {};
  filtered.forEach(tx => {
    const key = tx.date;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(tx);
  });
  const groupedDates = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

  const filteredIncome  = filtered.filter(t => t.type === 'income').reduce((s, t) => s + Math.abs(Number(t.amount)), 0);
  const filteredExpense = filtered.filter(t => t.type === 'expense').reduce((s, t) => s + Math.abs(Number(t.amount)), 0);

  const activeFilterCount = [typeFilter !== 'All', categoryFilter !== 'All', monthFilter !== 'All'].filter(Boolean).length;

  return (
    <div className="min-h-screen bg-background pb-28">
      <div className="px-5 pt-12 pb-4">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-heading font-bold text-foreground">Transactions</h1>
          <button onClick={() => { setEditTransaction(null); setShowAdd(true); }}
            className="w-10 h-10 gradient-primary rounded-xl flex items-center justify-center shadow-md">
            <Plus className="w-5 h-5 text-primary-foreground" />
          </button>
        </div>

        <div className="flex gap-2 mb-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search by title or category..."
              value={search} onChange={e => setSearch(e.target.value)}
              className="bg-secondary border-border pl-10" />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2">
                <X className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
            )}
          </div>
          <button onClick={() => setShowFilters(!showFilters)}
            className={`relative w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 border transition-colors ${
              activeFilterCount > 0
                ? 'gradient-primary border-transparent'
                : 'bg-secondary border-border'
            }`}>
            <SlidersHorizontal className={`w-4 h-4 ${activeFilterCount > 0 ? 'text-primary-foreground' : 'text-muted-foreground'}`} />
            {activeFilterCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-destructive rounded-full text-[9px] font-bold text-white flex items-center justify-center">
                {activeFilterCount}
              </span>
            )}
          </button>
        </div>

        {showFilters && (
          <div className="bg-secondary/50 rounded-2xl p-4 space-y-3 mb-3 border border-border">
            <div>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Type</p>
              <div className="flex gap-2">
                {(['All', 'Income', 'Expense'] as const).map(f => (
                  <button key={f} onClick={() => setTypeFilter(f)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                      typeFilter === f
                        ? f === 'Income' ? 'bg-success text-white'
                          : f === 'Expense' ? 'bg-destructive text-white'
                          : 'gradient-primary text-primary-foreground'
                        : 'bg-secondary text-muted-foreground border border-border'
                    }`}>{f}</button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Month</p>
              <div className="flex gap-1.5 flex-wrap">
                <button onClick={() => setMonthFilter('All')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${monthFilter === 'All' ? 'gradient-primary text-primary-foreground' : 'bg-secondary text-muted-foreground border border-border'}`}>
                  All
                </button>
                {MONTHS.map((m, i) => (
                  <button key={m} onClick={() => setMonthFilter(String(i))}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${monthFilter === String(i) ? 'gradient-primary text-primary-foreground' : 'bg-secondary text-muted-foreground border border-border'}`}>
                    {m}
                  </button>
                ))}
              </div>
            </div>

            {categories.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Category</p>
                <div className="flex gap-1.5 flex-wrap">
                  <button onClick={() => setCategoryFilter('All')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${categoryFilter === 'All' ? 'gradient-primary text-primary-foreground' : 'bg-secondary text-muted-foreground border border-border'}`}>
                    All
                  </button>
                  {categories.map(c => (
                    <button key={c} onClick={() => setCategoryFilter(c)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${categoryFilter === c ? 'gradient-primary text-primary-foreground' : 'bg-secondary text-muted-foreground border border-border'}`}>
                      {c}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {activeFilterCount > 0 && (
              <button onClick={() => { setTypeFilter('All'); setCategoryFilter('All'); setMonthFilter('All'); }}
                className="text-xs text-destructive font-medium">
                Clear all filters
              </button>
            )}
          </div>
        )}

        {filtered.length > 0 && (
          <div className="flex items-center justify-between py-2 px-3 bg-secondary/40 rounded-xl">
            <span className="text-xs text-muted-foreground">{filtered.length} transaction{filtered.length !== 1 ? 's' : ''}</span>
            <div className="flex items-center gap-3 text-xs">
              <span className="text-success font-semibold">+{fmt(filteredIncome)}</span>
              <span className="text-destructive font-semibold">-{fmt(filteredExpense)}</span>
            </div>
          </div>
        )}
      </div>

      <div className="px-5">
        {loading ? (
          <div className="space-y-2">
            {[1,2,3,4].map(i => (
              <div key={i} className="glass-card p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-secondary animate-pulse flex-shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 bg-secondary rounded-full animate-pulse w-2/3" />
                  <div className="h-2 bg-secondary rounded-full animate-pulse w-1/3" />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <p className="text-3xl mb-3">{search || activeFilterCount > 0 ? '🔍' : '📋'}</p>
            <p className="font-medium text-foreground">
              {search || activeFilterCount > 0 ? 'No matching transactions' : 'No transactions yet'}
            </p>
            <p className="text-xs mt-1">
              {search || activeFilterCount > 0 ? 'Try changing your filters' : 'Tap + to add your first one'}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {groupedDates.map(dateKey => {
              const dayTx = grouped[dateKey];
              const dayIncome  = dayTx.filter(t => t.type === 'income').reduce((s, t) => s + Math.abs(Number(t.amount)), 0);
              const dayExpense = dayTx.filter(t => t.type === 'expense').reduce((s, t) => s + Math.abs(Number(t.amount)), 0);

              return (
                <div key={dateKey}>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold text-muted-foreground">{fmtDate(dateKey)}</p>
                    <div className="flex gap-3 text-xs">
                      {dayIncome  > 0 && <span className="text-success font-semibold">+{fmt(dayIncome)}</span>}
                      {dayExpense > 0 && <span className="text-destructive font-semibold">-{fmt(dayExpense)}</span>}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    {dayTx.map(tx => (
                      <div key={tx.id} className="glass-card p-4 flex items-center gap-3 group">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg flex-shrink-0 ${
                          tx.type === 'income' ? 'bg-success/15' : 'bg-secondary'
                        }`}>
                          {tx.icon || '💸'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-foreground truncate">{tx.title}</p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-medium ${
                              tx.type === 'income'
                                ? 'bg-success/15 text-success'
                                : 'bg-secondary text-muted-foreground'
                            }`}>
                              {tx.category}
                            </span>
                            {tx.notes && <span className="text-[10px] text-muted-foreground truncate">· {tx.notes}</span>}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <p className={`text-sm font-bold ${tx.type === 'income' ? 'text-success' : 'text-foreground'}`}>
                            {tx.type === 'income' ? '+' : '-'}{fmt(Math.abs(Number(tx.amount)))}
                          </p>
                          <button
                            onClick={() => handleEdit(tx)}
                            className="opacity-0 group-hover:opacity-100 w-7 h-7 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 flex items-center justify-center transition-all">
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDelete(tx.id, tx.title)}
                            className="opacity-0 group-hover:opacity-100 w-7 h-7 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 flex items-center justify-center transition-all">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <AddTransactionSheet
        open={showAdd}
        onOpenChange={handleSheetOpenChange}
        onSaved={fetchTransactions}
        editTransaction={editTransaction}
      />
    </div>
  );
};

export default Transactions;
