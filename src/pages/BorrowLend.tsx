import { useState, useEffect, useCallback, useRef } from 'react';
import {
  ArrowUpRight, ArrowDownLeft, Plus, Trash2,
  CheckCircle2, Clock, X, ChevronDown, ChevronUp,
  Search, AlertCircle, User, AtSign,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

// ─── Helpers ─────────────────────────────────────────────
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
  const diff = Math.ceil((new Date(dueDate).getTime() - Date.now()) / 86400000);
  return diff;
};

// ─── Types ────────────────────────────────────────────────
interface BorrowRecord {
  id: string;
  user_id: string;
  person_name: string;
  linked_user_id: string | null;
  linked_username: string | null;
  amount: number;
  type: 'lent' | 'borrowed';
  date: string;
  due_date: string | null;
  notes: string | null;
  status: 'pending' | 'paid';
}

interface FoundProfile {
  id: string;
  username: string;
}

// ─── Component ───────────────────────────────────────────
const BorrowLend = () => {
  const { user } = useAuth();
  const [records, setRecords]         = useState<BorrowRecord[]>([]);
  const [loading, setLoading]         = useState(true);
  const [showAdd, setShowAdd]         = useState(false);
  const [search, setSearch]           = useState('');
  const [activeTab, setActiveTab]     = useState<'all' | 'lent' | 'borrowed'>('all');
  const [showHistory, setShowHistory] = useState(false);
  const [expandedId, setExpandedId]   = useState<string | null>(null);

  // Records where current user is tagged by someone else (read-only)
  const [linkedRecords, setLinkedRecords] = useState<BorrowRecord[]>([]);
  const [creatorNames, setCreatorNames]   = useState<Record<string, string>>({});

  // Form state
  const [form, setForm] = useState({
    person_name: '',
    amount: '',
    type: 'lent' as 'lent' | 'borrowed',
    date: new Date().toISOString().split('T')[0],
    due_date: '',
    notes: '',
    useUsername: false,
    usernameQuery: '',
  });
  const [saving, setSaving] = useState(false);

  // Username live-search
  const [searchingUser, setSearchingUser] = useState(false);
  const [foundProfile, setFoundProfile]   = useState<FoundProfile | null>(null);
  const [usernameError, setUsernameError] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Fetch own records ────────────────────────────────
  const fetchRecords = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from('borrow_lend')
      .select('*')
      .eq('user_id', user.id)
      .order('date', { ascending: false });
    setRecords((data as BorrowRecord[]) || []);
    setLoading(false);
  }, [user]);

  // ── Fetch records where current user is the linked person ──
  const fetchLinkedRecords = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('borrow_lend')
      .select('*')
      .eq('linked_user_id', user.id)
      .eq('status', 'pending')
      .order('date', { ascending: false });
    const rows = (data as BorrowRecord[]) || [];
    setLinkedRecords(rows);

    // Batch-fetch creator usernames
    if (rows.length > 0) {
      const creatorIds = [...new Set(rows.map(r => r.user_id))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, username')
        .in('id', creatorIds);
      const map: Record<string, string> = {};
      (profiles || []).forEach((p: FoundProfile) => { map[p.id] = p.username; });
      setCreatorNames(map);
    }
  }, [user]);

  useEffect(() => {
    fetchRecords();
    fetchLinkedRecords();
  }, [fetchRecords, fetchLinkedRecords]);

  // ── Username live lookup with debounce ───────────────
  useEffect(() => {
    if (!form.useUsername) return;
    const q = form.usernameQuery.trim().replace(/^@/, '');

    if (!q) {
      setFoundProfile(null);
      setUsernameError('');
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setSearchingUser(true);
      setUsernameError('');
      setFoundProfile(null);

      const { data } = await supabase
        .from('profiles')
        .select('id, username')
        .ilike('username', q)
        .limit(1)
        .single();

      setSearchingUser(false);

      if (!data) {
        setUsernameError(`No user found for "${q}"`);
        return;
      }
      if (data.id === user!.id) {
        setUsernameError("You can't link to yourself");
        return;
      }
      setFoundProfile(data as FoundProfile);
    }, 500);
  }, [form.usernameQuery, form.useUsername, user]);

  // ── Toggle username mode ─────────────────────────────
  const toggleUseUsername = (val: boolean) => {
    setForm(f => ({ ...f, useUsername: val, usernameQuery: '', person_name: val ? '' : f.person_name }));
    setFoundProfile(null);
    setUsernameError('');
  };

  // ── Save ─────────────────────────────────────────────
  const handleSave = async () => {
    const resolvedName = form.useUsername
      ? (foundProfile?.username || '')
      : form.person_name.trim();

    if (!resolvedName) {
      toast.error(form.useUsername ? 'Find a valid @username first' : 'Enter a person name');
      return;
    }
    if (form.useUsername && !foundProfile) {
      toast.error('Username not resolved yet');
      return;
    }
    if (!form.amount || parseFloat(form.amount) <= 0) {
      toast.error('Enter a valid amount');
      return;
    }

    setSaving(true);
    const { error } = await supabase.from('borrow_lend').insert({
      user_id:         user!.id,
      person_name:     resolvedName,
      linked_user_id:  foundProfile?.id   ?? null,
      linked_username: foundProfile?.username ?? null,
      amount:          parseFloat(form.amount),
      type:            form.type,
      date:            form.date,
      due_date:        form.due_date || null,
      notes:           form.notes.trim() || null,
      status:          'pending',
    });
    setSaving(false);

    if (error) { toast.error('Failed: ' + error.message); return; }
    toast.success(`${form.type === 'lent' ? 'Lent' : 'Borrowed'} ₹${parseFloat(form.amount).toLocaleString()} recorded!`);
    setForm({
      person_name: '', amount: '', type: 'lent',
      date: new Date().toISOString().split('T')[0], due_date: '', notes: '',
      useUsername: false, usernameQuery: '',
    });
    setFoundProfile(null);
    setUsernameError('');
    setShowAdd(false);
    fetchRecords();
    fetchLinkedRecords();
  };

  // ── Mark settled ─────────────────────────────────────
  const handleSettle = async (id: string, person: string) => {
    const { error } = await supabase.from('borrow_lend').update({ status: 'paid' }).eq('id', id);
    if (error) { toast.error('Failed'); return; }
    toast.success(`✓ Settled with ${person}!`);
    fetchRecords();
    fetchLinkedRecords();
  };

  // ── Delete (own records only) ─────────────────────────
  const handleDelete = async (id: string) => {
    await supabase.from('borrow_lend').delete().eq('id', id);
    toast.success('Record deleted');
    fetchRecords();
    fetchLinkedRecords();
  };

  // ── Filter ────────────────────────────────────────────
  const pending  = records.filter(r => r.status === 'pending');
  const settled  = records.filter(r => r.status === 'paid');

  const filtered = pending.filter(r => {
    const matchSearch = r.person_name.toLowerCase().includes(search.toLowerCase());
    const matchTab    = activeTab === 'all' || r.type === activeTab;
    return matchSearch && matchTab;
  });

  const overdueRecords = filtered.filter(r => isOverdue(r.due_date ?? undefined));
  const totalLent      = pending.filter(r => r.type === 'lent').reduce((s, r) => s + Number(r.amount), 0);
  const totalBorrowed  = pending.filter(r => r.type === 'borrowed').reduce((s, r) => s + Number(r.amount), 0);
  const netPosition    = totalLent - totalBorrowed;

  return (
    <div className="bg-background page-pb w-full overflow-x-hidden">

      {/* ── Header ── */}
      <div className="gradient-balance page-px pt-6 pb-6 rounded-b-3xl">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-primary-foreground/70 text-xs uppercase tracking-wider font-medium">Borrow & Lend</p>
            <h1 className="text-xl font-heading font-bold text-primary-foreground">Track Money</h1>
          </div>
          <button onClick={() => setShowAdd(true)}
            className="w-10 h-10 gradient-primary rounded-xl flex items-center justify-center shadow-md bg-primary-foreground/20">
            <Plus className="w-5 h-5 text-primary-foreground" />
          </button>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-primary-foreground/10 rounded-xl p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <ArrowUpRight className="w-3.5 h-3.5 text-success" />
              <span className="text-[10px] text-primary-foreground/60 font-medium">You Lent</span>
            </div>
            <p className="text-base font-bold text-success">{fmt(totalLent)}</p>
            <p className="text-[9px] text-primary-foreground/50 mt-0.5">
              {pending.filter(r => r.type === 'lent').length} pending
            </p>
          </div>
          <div className="bg-primary-foreground/10 rounded-xl p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <ArrowDownLeft className="w-3.5 h-3.5 text-destructive" />
              <span className="text-[10px] text-primary-foreground/60 font-medium">You Owe</span>
            </div>
            <p className="text-base font-bold text-destructive">{fmt(totalBorrowed)}</p>
            <p className="text-[9px] text-primary-foreground/50 mt-0.5">
              {pending.filter(r => r.type === 'borrowed').length} pending
            </p>
          </div>
          <div className="bg-primary-foreground/10 rounded-xl p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <span className="text-[10px] text-primary-foreground/60 font-medium">Net Position</span>
            </div>
            <p className={`text-base font-bold ${netPosition >= 0 ? 'text-success' : 'text-destructive'}`}>
              {netPosition >= 0 ? '+' : '-'}{fmt(netPosition)}
            </p>
            <p className="text-[9px] text-primary-foreground/50 mt-0.5">overall</p>
          </div>
        </div>
      </div>

      <div className="page-px mt-4 space-y-4">

        {/* ── Tagged by others section (read-only) ── */}
        {linkedRecords.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <AtSign className="w-3.5 h-3.5" /> Tagged in records
            </p>
            {linkedRecords.map(rec => {
              const iOwe   = rec.type === 'lent'; // creator lent → I need to pay back
              const overdue = isOverdue(rec.due_date ?? undefined);
              const creator = creatorNames[rec.user_id] || 'someone';
              return (
                <div key={rec.id}
                  className={`glass-card p-4 flex items-center gap-3 border ${
                    overdue ? 'border-destructive/40' : 'border-primary/20'
                  }`}>
                  <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${
                    iOwe ? 'bg-destructive/10' : 'bg-success/10'
                  }`}>
                    {iOwe
                      ? <ArrowDownLeft className="w-5 h-5 text-destructive" />
                      : <ArrowUpRight className="w-5 h-5 text-success" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className="text-sm font-semibold text-foreground">
                        {iOwe ? 'You owe' : 'You are owed'}
                      </p>
                      <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-md bg-primary/10 text-primary font-medium">
                        <AtSign className="w-2.5 h-2.5" />{creator}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {fmtDate(rec.date)}
                      {rec.due_date && ` · Due ${fmtDate(rec.due_date)}`}
                      {overdue && <span className="text-destructive font-semibold"> · Overdue</span>}
                    </p>
                    {rec.notes && (
                      <p className="text-[10px] text-muted-foreground italic truncate mt-0.5">{rec.notes}</p>
                    )}
                  </div>
                  <div className="flex-shrink-0 text-right">
                    <p className={`text-sm font-bold ${iOwe ? 'text-destructive' : 'text-success'}`}>
                      {fmt(rec.amount)}
                    </p>
                    <p className="text-[9px] text-muted-foreground mt-0.5">view only</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── Overdue alert ── */}
        {overdueRecords.length > 0 && (
          <div className="bg-destructive/10 border border-destructive/30 rounded-2xl p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-foreground">
                {overdueRecords.length} overdue record{overdueRecords.length > 1 ? 's' : ''}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {overdueRecords.map(r => r.person_name).join(', ')}
              </p>
            </div>
          </div>
        )}

        {/* ── Search + tabs ── */}
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search by name..." value={search}
              onChange={e => setSearch(e.target.value)} className="bg-secondary border-border pl-10" />
          </div>
          <div className="flex gap-2 p-1 bg-secondary rounded-xl">
            {(['all', 'lent', 'borrowed'] as const).map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                className={`flex-1 py-2 rounded-lg text-xs font-semibold capitalize transition-all ${
                  activeTab === tab ? 'gradient-primary text-primary-foreground' : 'text-muted-foreground'
                }`}>
                {tab === 'lent' ? '↑ Lent' : tab === 'borrowed' ? '↓ Borrowed' : 'All'}
              </button>
            ))}
          </div>
        </div>

        {/* ── Pending records ── */}
        {loading ? (
          <div className="space-y-2">
            {[1,2,3].map(i => (
              <div key={i} className="glass-card p-4 flex items-center gap-3">
                <div className="w-10 h-10 touch-min rounded-xl bg-secondary animate-pulse flex-shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 bg-secondary rounded-full animate-pulse w-2/3" />
                  <div className="h-2 bg-secondary rounded-full animate-pulse w-1/3" />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-14 text-muted-foreground">
            <p className="text-3xl mb-3">{activeTab === 'lent' ? '💸' : activeTab === 'borrowed' ? '🤲' : '🤝'}</p>
            <p className="font-medium text-foreground">No pending records</p>
            <p className="text-xs mt-1">Tap + to add a borrow/lend record</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map(rec => {
              const due      = daysUntilDue(rec.due_date ?? undefined);
              const overdue  = isOverdue(rec.due_date ?? undefined);
              const expanded = expandedId === rec.id;

              return (
                <div key={rec.id} className={`glass-card overflow-hidden transition-all ${overdue ? 'border border-destructive/30' : ''}`}>
                  {/* Main row */}
                  <div className="p-4 flex items-center gap-3">
                    <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${
                      rec.type === 'lent' ? 'bg-success/15' : 'bg-destructive/15'
                    }`}>
                      {rec.type === 'lent'
                        ? <ArrowUpRight className="w-5 h-5 text-success" />
                        : <ArrowDownLeft className="w-5 h-5 text-destructive" />}
                    </div>

                    <div className="flex-1 min-w-0" onClick={() => setExpandedId(expanded ? null : rec.id)}>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="text-sm font-semibold text-foreground">{rec.person_name}</p>
                        {rec.linked_username && (
                          <span className="inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-primary/10 text-primary">
                            <AtSign className="w-2.5 h-2.5" />{rec.linked_username}
                          </span>
                        )}
                        {overdue && <AlertCircle className="w-3.5 h-3.5 text-destructive flex-shrink-0" />}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md ${
                          rec.type === 'lent'
                            ? 'bg-success/15 text-success'
                            : 'bg-destructive/15 text-destructive'
                        }`}>
                          {rec.type === 'lent' ? 'Lent' : 'Borrowed'}
                        </span>
                        <span className="text-[10px] text-muted-foreground">{fmtDate(rec.date)}</span>
                        {rec.due_date && (
                          <span className={`text-[10px] font-medium ${overdue ? 'text-destructive' : due !== null && due <= 3 ? 'text-warning' : 'text-muted-foreground'}`}>
                            {overdue
                              ? `${Math.abs(due!)}d overdue`
                              : due === 0 ? 'Due today'
                              : `${due}d left`}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      <p className={`text-sm font-bold ${rec.type === 'lent' ? 'text-success' : 'text-destructive'}`}>
                        {fmt(rec.amount)}
                      </p>
                      <button onClick={() => setExpandedId(expanded ? null : rec.id)}
                        className="text-muted-foreground">
                        {expanded
                          ? <ChevronUp className="w-4 h-4" />
                          : <ChevronDown className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Expanded detail */}
                  {expanded && (
                    <div className="page-px pb-4 border-t border-border pt-3 space-y-3">
                      {rec.linked_username && (
                        <div className="bg-primary/5 border border-primary/15 rounded-xl p-3 flex items-center gap-2">
                          <AtSign className="w-4 h-4 text-primary flex-shrink-0" />
                          <div>
                            <p className="text-xs font-semibold text-primary">Linked to @{rec.linked_username}</p>
                            <p className="text-[10px] text-muted-foreground">This person can see this record in their account</p>
                          </div>
                        </div>
                      )}
                      {rec.notes && (
                        <div className="bg-secondary/50 rounded-xl p-3">
                          <p className="text-xs text-muted-foreground font-medium mb-1">Note</p>
                          <p className="text-sm text-foreground">{rec.notes}</p>
                        </div>
                      )}
                      {rec.due_date && (
                        <div className="flex items-center gap-2">
                          <Clock className="w-4 h-4 text-muted-foreground" />
                          <p className="text-xs text-muted-foreground">
                            Due: <span className={`font-semibold ${overdue ? 'text-destructive' : 'text-foreground'}`}>
                              {fmtDate(rec.due_date)}
                            </span>
                          </p>
                        </div>
                      )}
                      <div className="flex gap-2">
                        <Button onClick={() => handleSettle(rec.id, rec.person_name)}
                          className="flex-1 h-9 gradient-primary text-primary-foreground text-xs font-semibold">
                          <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                          Mark Settled
                        </Button>
                        <button onClick={() => handleDelete(rec.id)}
                          className="w-9 h-9 rounded-xl bg-destructive/10 flex items-center justify-center flex-shrink-0">
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

        {/* ── Settled history ── */}
        {settled.length > 0 && (
          <div>
            <button onClick={() => setShowHistory(!showHistory)}
              className="flex items-center gap-2 text-xs text-muted-foreground font-semibold uppercase tracking-wider py-2 w-full">
              {showHistory ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              Settled History ({settled.length})
            </button>

            {showHistory && (
              <div className="space-y-2 mt-2">
                {settled.map(rec => (
                  <div key={rec.id} className="glass-card p-4 flex items-center gap-3 opacity-60">
                    <div className="w-10 h-10 touch-min rounded-xl bg-success/10 flex items-center justify-center flex-shrink-0">
                      <CheckCircle2 className="w-5 h-5 text-success" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="text-sm font-medium text-foreground line-through">{rec.person_name}</p>
                        {rec.linked_username && (
                          <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-md bg-primary/10 text-primary line-through">
                            <AtSign className="w-2.5 h-2.5" />{rec.linked_username}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {rec.type === 'lent' ? 'Lent' : 'Borrowed'} · {fmtDate(rec.date)}
                      </p>
                    </div>
                    <div className="text-right flex items-center gap-2">
                      <p className="text-sm font-semibold text-muted-foreground line-through">{fmt(rec.amount)}</p>
                      <button onClick={() => handleDelete(rec.id)}
                        className="text-muted-foreground hover:text-destructive transition-colors">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Add Sheet ── */}
      <Sheet open={showAdd} onOpenChange={(open) => {
        if (!open) { setFoundProfile(null); setUsernameError(''); }
        setShowAdd(open);
      }}>
        <SheetContent side="bottom" className="bg-card border-border rounded-t-3xl max-h-[90vh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="font-heading text-foreground">Add Record</SheetTitle>
          </SheetHeader>

          <div className="space-y-4 mt-4 pb-8">
            {/* Type toggle */}
            <div className="flex gap-2 p-1 bg-secondary rounded-xl">
              {(['lent', 'borrowed'] as const).map(t => (
                <button key={t} onClick={() => setForm(f => ({ ...f, type: t }))}
                  className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                    form.type === t
                      ? t === 'lent' ? 'bg-success text-white' : 'bg-destructive text-white'
                      : 'text-muted-foreground'
                  }`}>
                  {t === 'lent' ? '↑ I Lent' : '↓ I Borrowed'}
                </button>
              ))}
            </div>

            {/* Input mode toggle: Name vs @Username */}
            <div className="flex gap-2 p-1 bg-secondary rounded-xl">
              <button
                onClick={() => toggleUseUsername(false)}
                className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1.5 ${
                  !form.useUsername ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'
                }`}>
                <User className="w-3.5 h-3.5" />
                Name / Friend
              </button>
              <button
                onClick={() => toggleUseUsername(true)}
                className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1.5 ${
                  form.useUsername ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'
                }`}>
                <AtSign className="w-3.5 h-3.5" />
                @Username
              </button>
            </div>

            {/* Conditional person input */}
            {!form.useUsername ? (
              <div>
                <Label className="text-xs text-muted-foreground uppercase tracking-wider">Person Name</Label>
                <Input
                  placeholder="e.g. Rahul, Alice..."
                  value={form.person_name}
                  onChange={e => setForm(f => ({ ...f, person_name: e.target.value }))}
                  className="bg-secondary border-border mt-1.5"
                />
                <p className="text-[10px] text-muted-foreground mt-1">For friends or anyone not in the app</p>
              </div>
            ) : (
              <div>
                <Label className="text-xs text-muted-foreground uppercase tracking-wider">App Username</Label>
                <div className="relative mt-1.5">
                  <AtSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="username"
                    value={form.usernameQuery}
                    onChange={e => setForm(f => ({ ...f, usernameQuery: e.target.value.replace(/^@/, '') }))}
                    className="bg-secondary border-border pl-9"
                    autoCapitalize="none"
                    autoCorrect="off"
                  />
                </div>
                {/* Lookup states */}
                {searchingUser && (
                  <p className="text-[10px] text-muted-foreground mt-1.5 animate-pulse">Looking up…</p>
                )}
                {!searchingUser && foundProfile && (
                  <div className="mt-2 flex items-center gap-2 bg-success/10 border border-success/20 rounded-xl px-3 py-2.5">
                    <CheckCircle2 className="w-4 h-4 text-success flex-shrink-0" />
                    <div>
                      <p className="text-xs font-semibold text-success">@{foundProfile.username} found ✓</p>
                      <p className="text-[10px] text-muted-foreground">They'll see this record in their account (view only)</p>
                    </div>
                  </div>
                )}
                {!searchingUser && usernameError && (
                  <div className="mt-2 flex items-center gap-2 bg-destructive/10 border border-destructive/20 rounded-xl px-3 py-2.5">
                    <AlertCircle className="w-4 h-4 text-destructive flex-shrink-0" />
                    <p className="text-xs text-destructive">{usernameError}</p>
                  </div>
                )}
              </div>
            )}

            {/* Amount */}
            <div>
              <Label className="text-xs text-muted-foreground uppercase tracking-wider">Amount</Label>
              <div className="relative mt-1.5">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xl font-bold text-muted-foreground">₹</span>
                <Input type="number" placeholder="0.00" value={form.amount}
                  onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                  className="bg-secondary border-border pl-10 text-2xl font-bold h-14" />
              </div>
            </div>

            {/* Dates */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground uppercase tracking-wider">Date</Label>
                <Input type="date" value={form.date}
                  onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                  className="bg-secondary border-border mt-1.5" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground uppercase tracking-wider">
                  Due Date <span className="normal-case text-muted-foreground">(optional)</span>
                </Label>
                <Input type="date" value={form.due_date}
                  onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))}
                  className="bg-secondary border-border mt-1.5" />
              </div>
            </div>

            {/* Notes */}
            <div>
              <Label className="text-xs text-muted-foreground uppercase tracking-wider">
                Note <span className="normal-case text-muted-foreground">(optional)</span>
              </Label>
              <Input placeholder="What's it for? e.g. Lunch, Travel..." value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                className="bg-secondary border-border mt-1.5" />
            </div>

            {/* Preview */}
            {(form.useUsername ? foundProfile?.username : form.person_name) && form.amount && (
              <div className={`rounded-xl p-3 flex items-center gap-3 ${
                form.type === 'lent'
                  ? 'bg-success/10 border border-success/20'
                  : 'bg-destructive/10 border border-destructive/20'
              }`}>
                <span className="text-2xl">{form.type === 'lent' ? '💸' : '🤲'}</span>
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    {form.type === 'lent' ? 'Lent' : 'Borrowed'}{' '}
                    {form.amount && `₹${parseFloat(form.amount).toLocaleString('en-IN')}`}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {form.type === 'lent' ? 'To' : 'From'}{' '}
                    {form.useUsername
                      ? <span className="font-medium text-primary">@{foundProfile?.username}</span>
                      : form.person_name}
                    {form.due_date ? ` · Due ${fmtDate(form.due_date)}` : ''}
                  </p>
                </div>
              </div>
            )}

            <Button
              onClick={handleSave}
              disabled={saving || (form.useUsername && (!foundProfile || searchingUser))}
              className="w-full gradient-primary text-primary-foreground h-12 font-bold">
              {saving ? 'Saving...' : '✓ Save Record'}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
};

export default BorrowLend;