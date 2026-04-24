import { useState, useEffect, useCallback } from 'react';
import {
  ArrowUpRight, ArrowDownLeft, Plus, Trash2,
  CheckCircle2, Clock, X, ChevronDown, ChevronUp,
  Search, AlertCircle,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

const fmt = (n: number) =>
  '₹' + Math.abs(n).toLocaleString('en-IN', { maximumFractionDigits: 0 });

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' });

const isOverdue = (dueDate?: string) => {
  if (!dueDate) return false;
  return new Date(dueDate) < new Date();
};

const daysUntilDue = (dueDate?: string) => {
  if (!dueDate) return null;
  return Math.ceil((new Date(dueDate).getTime() - Date.now()) / 86400000);
};

const BorrowLend = () => {
  const { user } = useAuth();
  const [records, setRecords]         = useState<any[]>([]);
  const [loading, setLoading]         = useState(true);
  const [showAdd, setShowAdd]         = useState(false);
  const [search, setSearch]           = useState('');
  const [activeTab, setActiveTab]     = useState<'all' | 'lent' | 'borrowed'>('all');
  const [showHistory, setShowHistory] = useState(false);
  const [expandedId, setExpandedId]   = useState<string | null>(null);

  const [form, setForm] = useState({
    person_name: '',
    amount: '',
    type: 'lent' as 'lent' | 'borrowed',
    date: new Date().toISOString().split('T')[0],
    due_date: '',
    notes: '',
  });
  const [saving, setSaving] = useState(false);

  const fetchRecords = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase.from('borrow_lend').select('*').eq('user_id', user.id).order('date', { ascending: false });
    setRecords(data || []);
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchRecords(); }, [fetchRecords]);

  const handleSave = async () => {
    if (!form.person_name.trim()) { toast.error('Enter a person name'); return; }
    if (!form.amount || parseFloat(form.amount) <= 0) { toast.error('Enter a valid amount'); return; }
    setSaving(true);
    const { error } = await supabase.from('borrow_lend').insert({
      user_id:     user!.id,
      person_name: form.person_name.trim(),
      amount:      parseFloat(form.amount),
      type:        form.type,
      date:        form.date,
      due_date:    form.due_date || null,
      notes:       form.notes.trim() || null,
      status:      'pending',
    });
    setSaving(false);
    if (error) { toast.error('Failed: ' + error.message); return; }
    toast.success(`${form.type === 'lent' ? 'Lent' : 'Borrowed'} ₹${parseFloat(form.amount).toLocaleString()} recorded!`);
    setForm({ person_name: '', amount: '', type: 'lent', date: new Date().toISOString().split('T')[0], due_date: '', notes: '' });
    setShowAdd(false);
    fetchRecords();
  };

  const handleSettle = async (id: string, person: string) => {
    const { error } = await supabase.from('borrow_lend').update({ status: 'paid' }).eq('id', id);
    if (error) { toast.error('Failed'); return; }
    toast.success(`✓ Settled with ${person}!`);
    fetchRecords();
  };

  const handleDelete = async (id: string) => {
    await supabase.from('borrow_lend').delete().eq('id', id);
    toast.success('Record deleted');
    fetchRecords();
  };

  const pending  = records.filter(r => r.status === 'pending');
  const settled  = records.filter(r => r.status === 'paid');

  const filtered = pending.filter(r => {
    const matchSearch = r.person_name.toLowerCase().includes(search.toLowerCase());
    const matchTab    = activeTab === 'all' || r.type === activeTab;
    return matchSearch && matchTab;
  });

  const overdueRecords = filtered.filter(r => isOverdue(r.due_date));
  const totalLent     = pending.filter(r => r.type === 'lent').reduce((s, r) => s + Number(r.amount), 0);
  const totalBorrowed = pending.filter(r => r.type === 'borrowed').reduce((s, r) => s + Number(r.amount), 0);
  const netPosition   = totalLent - totalBorrowed;

  return (
    <div className="min-h-screen bg-background pb-28">
      <div className="gradient-balance px-5 pt-12 pb-6 rounded-b-3xl">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-primary-foreground/70 text-xs uppercase tracking-wider font-medium">Borrow & Lend</p>
            <h1 className="text-xl font-heading font-bold text-primary-foreground">Track Money</h1>
          </div>
          <button onClick={() => setShowAdd(true)} className="w-10 h-10 gradient-primary rounded-xl flex items-center justify-center shadow-md bg-primary-foreground/20">
            <Plus className="w-5 h-5 text-primary-foreground" />
          </button>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-primary-foreground/10 rounded-xl p-3">
            <div className="flex items-center gap-1.5 mb-1"><ArrowUpRight className="w-3.5 h-3.5 text-success" /><span className="text-[10px] text-primary-foreground/60 font-medium">You Lent</span></div>
            <p className="text-base font-bold text-success">{fmt(totalLent)}</p>
            <p className="text-[9px] text-primary-foreground/50 mt-0.5">{pending.filter(r => r.type === 'lent').length} pending</p>
          </div>
          <div className="bg-primary-foreground/10 rounded-xl p-3">
            <div className="flex items-center gap-1.5 mb-1"><ArrowDownLeft className="w-3.5 h-3.5 text-destructive" /><span className="text-[10px] text-primary-foreground/60 font-medium">You Owe</span></div>
            <p className="text-base font-bold text-destructive">{fmt(totalBorrowed)}</p>
            <p className="text-[9px] text-primary-foreground/50 mt-0.5">{pending.filter(r => r.type === 'borrowed').length} pending</p>
          </div>
          <div className="bg-primary-foreground/10 rounded-xl p-3">
            <div className="flex items-center gap-1.5 mb-1"><span className="text-[10px] text-primary-foreground/60 font-medium">Net Position</span></div>
            <p className={`text-base font-bold ${netPosition >= 0 ? 'text-success' : 'text-destructive'}`}>{netPosition >= 0 ? '+' : '-'}{fmt(netPosition)}</p>
            <p className="text-[9px] text-primary-foreground/50 mt-0.5">overall</p>
          </div>
        </div>
      </div>

      <div className="px-5 mt-5 space-y-4">
        {overdueRecords.length > 0 && (
          <div className="bg-destructive/10 border border-destructive/30 rounded-2xl p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-foreground">{overdueRecords.length} overdue record{overdueRecords.length > 1 ? 's' : ''}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{overdueRecords.map(r => r.person_name).join(', ')}</p>
            </div>
          </div>
        )}

        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search by name..." value={search} onChange={e => setSearch(e.target.value)} className="bg-secondary border-border pl-10" />
          </div>
          <div className="flex gap-2 p-1 bg-secondary rounded-xl">
            {(['all', 'lent', 'borrowed'] as const).map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                className={`flex-1 py-2 rounded-lg text-xs font-semibold capitalize transition-all ${activeTab === tab ? 'gradient-primary text-primary-foreground' : 'text-muted-foreground'}`}>
                {tab === 'lent' ? '↑ Lent' : tab === 'borrowed' ? '↓ Borrowed' : 'All'}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="glass-card p-4 flex items-center gap-3"><div className="w-10 h-10 rounded-xl bg-secondary animate-pulse flex-shrink-0"/><div className="flex-1 space-y-2"><div className="h-3 bg-secondary rounded-full animate-pulse w-2/3"/><div className="h-2 bg-secondary rounded-full animate-pulse w-1/3"/></div></div>)}</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-14 text-muted-foreground">
            <p className="text-3xl mb-3">{activeTab === 'lent' ? '💸' : activeTab === 'borrowed' ? '🤲' : '🤝'}</p>
            <p className="font-medium text-foreground">No pending records</p>
            <p className="text-xs mt-1">Tap + to add a borrow/lend record</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map(rec => {
              const due      = daysUntilDue(rec.due_date);
              const overdue  = isOverdue(rec.due_date);
              const expanded = expandedId === rec.id;

              return (
                <div key={rec.id} className={`glass-card overflow-hidden transition-all ${overdue ? 'border border-destructive/30' : ''}`}>
                  <div className="p-4 flex items-center gap-3">
                    <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${rec.type === 'lent' ? 'bg-success/15' : 'bg-destructive/15'}`}>
                      {rec.type === 'lent' ? <ArrowUpRight className="w-5 h-5 text-success" /> : <ArrowDownLeft className="w-5 h-5 text-destructive" />}
                    </div>
                    <div className="flex-1 min-w-0" onClick={() => setExpandedId(expanded ? null : rec.id)}>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-foreground">{rec.person_name}</p>
                        {overdue && <AlertCircle className="w-3.5 h-3.5 text-destructive flex-shrink-0" />}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md ${rec.type === 'lent' ? 'bg-success/15 text-success' : 'bg-destructive/15 text-destructive'}`}>
                          {rec.type === 'lent' ? 'Lent' : 'Borrowed'}
                        </span>
                        <span className="text-[10px] text-muted-foreground">{fmtDate(rec.date)}</span>
                        {rec.due_date && (
                          <span className={`text-[10px] font-medium ${overdue ? 'text-destructive' : due !== null && due <= 3 ? 'text-warning' : 'text-muted-foreground'}`}>
                            {overdue ? `${Math.abs(due!)}d overdue` : due === 0 ? 'Due today' : `${due}d left`}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <p className={`text-sm font-bold ${rec.type === 'lent' ? 'text-success' : 'text-destructive'}`}>{fmt(rec.amount)}</p>
                      <button onClick={() => setExpandedId(expanded ? null : rec.id)} className="text-muted-foreground">
                        {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {expanded && (
                    <div className="px-4 pb-4 border-t border-border pt-3 space-y-3">
                      {rec.notes && <div className="bg-secondary/50 rounded-xl p-3"><p className="text-xs text-muted-foreground font-medium mb-1">Note</p><p className="text-sm text-foreground">{rec.notes}</p></div>}
                      {rec.due_date && (
                        <div className="flex items-center gap-2">
                          <Clock className="w-4 h-4 text-muted-foreground" />
                          <p className="text-xs text-muted-foreground">Due: <span className={`font-semibold ${overdue ? 'text-destructive' : 'text-foreground'}`}>{fmtDate(rec.due_date)}</span></p>
                        </div>
                      )}
                      <div className="flex gap-2">
                        <Button onClick={() => handleSettle(rec.id, rec.person_name)} className="flex-1 h-9 gradient-primary text-primary-foreground text-xs font-semibold">
                          <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" /> Mark Settled
                        </Button>
                        <button onClick={() => handleDelete(rec.id)} className="w-9 h-9 rounded-xl bg-destructive/10 flex items-center justify-center flex-shrink-0">
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {settled.length > 0 && (
          <div>
            <button onClick={() => setShowHistory(!showHistory)} className="flex items-center gap-2 text-xs text-muted-foreground font-semibold uppercase tracking-wider py-2 w-full">
              {showHistory ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              Settled History ({settled.length})
            </button>
            {showHistory && (
              <div className="space-y-2 mt-2">
                {settled.map(rec => (
                  <div key={rec.id} className="glass-card p-4 flex items-center gap-3 opacity-60">
                    <div className="w-10 h-10 rounded-xl bg-success/10 flex items-center justify-center flex-shrink-0"><CheckCircle2 className="w-5 h-5 text-success" /></div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground line-through">{rec.person_name}</p>
                      <p className="text-xs text-muted-foreground">{rec.type === 'lent' ? 'Lent' : 'Borrowed'} · {fmtDate(rec.date)}</p>
                    </div>
                    <div className="text-right flex items-center gap-2">
                      <p className="text-sm font-semibold text-muted-foreground line-through">{fmt(rec.amount)}</p>
                      <button onClick={() => handleDelete(rec.id)} className="text-muted-foreground hover:text-destructive transition-colors"><X className="w-3.5 h-3.5" /></button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <Sheet open={showAdd} onOpenChange={setShowAdd}>
        <SheetContent side="bottom" className="bg-card border-border rounded-t-3xl max-h-[90vh] overflow-y-auto">
          <SheetHeader><SheetTitle className="font-heading text-foreground">Add Record</SheetTitle></SheetHeader>
          <div className="space-y-4 mt-4 pb-8 px-5">
            <div className="flex gap-2 p-1 bg-secondary rounded-xl">
              {(['lent', 'borrowed'] as const).map(t => (
                <button key={t} onClick={() => setForm(f => ({ ...f, type: t }))}
                  className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all ${form.type === t ? t === 'lent' ? 'bg-success text-white' : 'bg-destructive text-white' : 'text-muted-foreground'}`}>
                  {t === 'lent' ? '↑ I Lent' : '↓ I Borrowed'}
                </button>
              ))}
            </div>

            <div>
              <Label className="text-xs text-muted-foreground uppercase tracking-wider">Person Name</Label>
              <Input placeholder="e.g. Rahul, Alice..." value={form.person_name} onChange={e => setForm(f => ({ ...f, person_name: e.target.value }))} className="bg-secondary border-border mt-1.5" />
            </div>

            <div>
              <Label className="text-xs text-muted-foreground uppercase tracking-wider">Amount</Label>
              <div className="relative mt-1.5">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xl font-bold text-muted-foreground">₹</span>
                <Input type="number" placeholder="0.00" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} className="bg-secondary border-border pl-10 text-2xl font-bold h-14" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground uppercase tracking-wider">Date</Label>
                <Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} className="bg-secondary border-border mt-1.5" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground uppercase tracking-wider">Due Date <span className="normal-case text-muted-foreground">(optional)</span></Label>
                <Input type="date" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} className="bg-secondary border-border mt-1.5" />
              </div>
            </div>

            <div>
              <Label className="text-xs text-muted-foreground uppercase tracking-wider">Note <span className="normal-case text-muted-foreground">(optional)</span></Label>
              <Input placeholder="What's it for? e.g. Lunch, Travel..." value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className="bg-secondary border-border mt-1.5" />
            </div>

            {form.person_name && form.amount && (
              <div className={`rounded-xl p-3 flex items-center gap-3 ${form.type === 'lent' ? 'bg-success/10 border border-success/20' : 'bg-destructive/10 border border-destructive/20'}`}>
                <span className="text-2xl">{form.type === 'lent' ? '💸' : '🤲'}</span>
                <div>
                  <p className="text-sm font-semibold text-foreground">{form.type === 'lent' ? 'Lent' : 'Borrowed'} {form.amount && `₹${parseFloat(form.amount).toLocaleString('en-IN')}`}</p>
                  <p className="text-xs text-muted-foreground">{form.type === 'lent' ? 'To' : 'From'} {form.person_name}{form.due_date ? ` · Due ${fmtDate(form.due_date)}` : ''}</p>
                </div>
              </div>
            )}

            <Button onClick={handleSave} disabled={saving} className="w-full gradient-primary text-primary-foreground h-12 font-bold">
              {saving ? 'Saving...' : '✓ Save Record'}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
};

export default BorrowLend;
