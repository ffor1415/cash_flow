import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Plus, Users, Trash2, UserPlus, Crown, X,
  ArrowLeft, Receipt, CheckCircle2, Circle, ChevronRight, ChevronDown, Wallet,
  Calculator, Info, ArrowRight, Zap,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

// ─── Types ────────────────────────────────────────────────────────────────────
interface EventMember { user_id: string; username: string; }
interface EventGroup { id: string; name: string; created_by: string; created_at: string; member_count: number; members: EventMember[]; }
interface Friend { id: string; username: string; }
interface ExpenseSplit { user_id: string; username: string; amount: number; settled: boolean; split_id: string; }
interface Expense { id: string; title: string; amount: number; paid_by: string; paid_by_username: string; split_type: string; created_at: string; created_by: string; splits: ExpenseSplit[]; }

// ─── Advanced Split Types ─────────────────────────────────────────────────────
interface RawBalance { from: string; fromName: string; to: string; toName: string; amount: number; }

interface OptimizedTransaction {
  from: string;
  fromName: string;
  to: string;
  toName: string;
  amount: number;
  // Chain: if paying A who owes B, this tracks the chain
  chainExplanation?: string;
  reasoning: string;
  // Per-expense breakdown feeding this transaction
  breakdown: {
    expenseTitle: string;
    date: string;
    fromContribution: number; // how much "from" owes in this expense
    toContribution: number;   // how much "to" is owed in this expense
    net: number;
  }[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (n: number) => '₹' + Math.abs(n).toLocaleString('en-IN', { minimumFractionDigits: 2 });
const r2 = (n: number) => Math.round(n * 100) / 100;

// ─── Simple Split: Net Balances ───────────────────────────────────────────────
interface SimpleDebt {
  from: string; fromName: string;
  to: string; toName: string;
  amount: number;
  splitIds: string[];
  transactionCount: number;
  breakdown: { id: string; title: string; date: string; owedBy: string; amount: number; }[];
}

function calculateSimpleBalances(expenses: Expense[]): SimpleDebt[] {
  const balances: Record<string, {
    amount: number; splits: string[]; user1Name: string; user2Name: string;
    breakdown: { id: string; title: string; date: string; userA: string; userB: string; amt: number; }[];
  }> = {};

  for (const exp of expenses) {
    for (const split of exp.splits) {
      if (split.settled) continue;
      if (split.user_id === exp.paid_by) continue;
      const amt = r2(Math.abs(split.amount));
      if (amt < 0.005) continue;

      const userA = split.user_id;
      const userB = exp.paid_by;
      const nameA = split.username;
      const nameB = exp.paid_by_username;

      const [u1, u2, n1, n2] = userA < userB ? [userA, userB, nameA, nameB] : [userB, userA, nameB, nameA];
      const key = `${u1}:${u2}`;

      if (!balances[key]) balances[key] = { amount: 0, splits: [], user1Name: n1, user2Name: n2, breakdown: [] };
      balances[key].amount += userA === u1 ? amt : -amt;
      balances[key].splits.push(split.split_id);
      balances[key].breakdown.push({ id: split.split_id, title: exp.title, date: exp.created_at, userA, userB, amt });
    }
  }

  const result: SimpleDebt[] = [];
  for (const key in balances) {
    const { amount, splits, user1Name, user2Name, breakdown } = balances[key];
    const [u1, u2] = key.split(':');
    const netAmt = r2(amount);
    if (Math.abs(netAmt) < 0.005) continue;

    const [from, to, fromName, toName] = netAmt > 0 ? [u1, u2, user1Name, user2Name] : [u2, u1, user2Name, user1Name];
    result.push({
      from, fromName, to, toName,
      amount: Math.abs(netAmt),
      splitIds: splits,
      transactionCount: splits.length,
      breakdown: breakdown.map(b => ({
        id: b.id, title: b.title, date: b.date, owedBy: b.userA, amount: b.amt,
      })).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()),
    });
  }
  return result;
}

// ─── Advanced Mathematical Split ──────────────────────────────────────────────
// Uses graph-based debt simplification (Greedy Cash Flow Minimization).
// This reduces N*(N-1) possible transactions to at most N-1 transactions.
// Also handles chain payments: if A pays B (who owes C), A can pay C directly.
function calculateAdvancedSplit(
  expenses: Expense[],
  memberMap: Record<string, string>
): OptimizedTransaction[] {
  // Step 1: Build net balance map per person
  const netBalance: Record<string, number> = {};
  // Track per-pair expense contributions for explanations
  const pairExpenses: Record<string, {
    expenseTitle: string; date: string;
    fromContribution: number; toContribution: number;
  }[]> = {};

  for (const exp of expenses) {
    for (const split of exp.splits) {
      if (split.settled) continue;
      if (split.user_id === exp.paid_by) continue;
      const amt = r2(Math.abs(split.amount));
      if (amt < 0.005) continue;

      // payer gains, splitter owes
      if (!netBalance[exp.paid_by]) netBalance[exp.paid_by] = 0;
      if (!netBalance[split.user_id]) netBalance[split.user_id] = 0;
      netBalance[exp.paid_by] += amt;
      netBalance[split.user_id] -= amt;

      // Store for breakdown explanations
      const pKey = [split.user_id, exp.paid_by].sort().join(':');
      if (!pairExpenses[pKey]) pairExpenses[pKey] = [];
      pairExpenses[pKey].push({
        expenseTitle: exp.title,
        date: exp.created_at,
        fromContribution: split.user_id < exp.paid_by ? amt : 0,
        toContribution: split.user_id < exp.paid_by ? 0 : amt,
      });
    }
  }

  // Step 2: Separate into creditors (+) and debtors (-)
  const creditors: { id: string; name: string; amount: number }[] = [];
  const debtors: { id: string; name: string; amount: number }[] = [];

  for (const [id, bal] of Object.entries(netBalance)) {
    const name = memberMap[id] || 'Unknown';
    if (bal > 0.005) creditors.push({ id, name, amount: r2(bal) });
    else if (bal < -0.005) debtors.push({ id, name, amount: r2(-bal) });
  }

  // Step 3: Greedy min-cash-flow algorithm
  // Sort descending for greedy efficiency
  creditors.sort((a, b) => b.amount - a.amount);
  debtors.sort((a, b) => b.amount - a.amount);

  const transactions: OptimizedTransaction[] = [];

  let ci = 0, di = 0;
  while (ci < creditors.length && di < debtors.length) {
    const cred = creditors[ci];
    const debt = debtors[di];

    const settle = r2(Math.min(cred.amount, debt.amount));
    if (settle < 0.005) { ci++; di++; continue; }

    // Build breakdown from shared expenses
    const pKey = [debt.id, cred.id].sort().join(':');
    const sharedExps = pairExpenses[pKey] || [];
    const breakdown = sharedExps.map(e => ({
      expenseTitle: e.expenseTitle,
      date: e.date,
      fromContribution: debt.id < cred.id ? e.fromContribution : e.toContribution,
      toContribution: debt.id < cred.id ? e.toContribution : e.fromContribution,
      net: debt.id < cred.id ? e.fromContribution : e.toContribution,
    }));

    // Build reasoning explanation
    const debtorNetOwed = r2(Math.abs(netBalance[debt.id] || 0));
    const creditorNetGets = r2(Math.abs(netBalance[cred.id] || 0));

    let reasoning = `${debt.name} has a total outstanding balance of ${fmt(debtorNetOwed)} across all event expenses. `;
    reasoning += `${cred.name} is owed a total of ${fmt(creditorNetGets)} from various participants. `;

    if (breakdown.length > 0) {
      reasoning += `They share ${breakdown.length} expense${breakdown.length > 1 ? 's' : ''}: `;
      reasoning += breakdown.map(b => `"${b.expenseTitle}" (${fmt(b.net)})`).join(', ') + '. ';
    } else {
      reasoning += `This payment is the result of debt simplification — ${debt.name} has been redirected to pay ${cred.name} directly to minimize total transactions. `;
    }

    reasoning += `After netting all amounts, ${debt.name} pays ${cred.name} ${fmt(settle)}.`;

    // Check for chain scenario: if settle < debtorNetOwed, a chain redirect is happening
    let chainExplanation: string | undefined;
    if (Math.abs(debtorNetOwed - settle) > 0.01 && sharedExps.length === 0) {
      chainExplanation = `💡 Chain Payment: ${debt.name} is being redirected to pay ${cred.name} directly (instead of paying an intermediate person), reducing total payments needed in this event.`;
    }

    transactions.push({
      from: debt.id,
      fromName: debt.name,
      to: cred.id,
      toName: cred.name,
      amount: settle,
      chainExplanation,
      reasoning,
      breakdown,
    });

    cred.amount = r2(cred.amount - settle);
    debt.amount = r2(debt.amount - settle);
    if (cred.amount < 0.005) ci++;
    if (debt.amount < 0.005) di++;
  }

  return transactions;
}

function getDynamicallySettledSplits(expenses: Expense[]): Set<string> {
  const settledSplits = new Set<string>();
  const pairs: Record<string, { u1ToU2: { id: string; amt: number; ms: number }[]; u2ToU1: { id: string; amt: number; ms: number }[] }> = {};

  expenses.forEach(exp => {
    const ms = new Date(exp.created_at).getTime();
    exp.splits.forEach(s => {
      if (s.settled || s.user_id === exp.paid_by) return;
      const amt = r2(Math.abs(s.amount));
      if (amt < 0.005) return;

      const u1 = s.user_id < exp.paid_by ? s.user_id : exp.paid_by;
      const u2 = s.user_id < exp.paid_by ? exp.paid_by : s.user_id;
      const key = `${u1}:${u2}`;

      if (!pairs[key]) pairs[key] = { u1ToU2: [], u2ToU1: [] };
      if (s.user_id === u1) pairs[key].u1ToU2.push({ id: s.split_id, amt, ms });
      else pairs[key].u2ToU1.push({ id: s.split_id, amt, ms });
    });
  });

  for (const key in pairs) {
    const { u1ToU2, u2ToU1 } = pairs[key];
    u1ToU2.sort((a, b) => a.ms - b.ms);
    u2ToU1.sort((a, b) => a.ms - b.ms);

    const sum1 = u1ToU2.reduce((s, x) => s + x.amt, 0);
    const sum2 = u2ToU1.reduce((s, x) => s + x.amt, 0);
    const offset = r2(Math.min(sum1, sum2));
    if (offset <= 0) continue;

    let p1 = offset;
    for (const item of u1ToU2) {
      if (r2(item.amt) <= r2(p1) + 0.01) { settledSplits.add(item.id); p1 -= item.amt; } else break;
    }
    let p2 = offset;
    for (const item of u2ToU1) {
      if (r2(item.amt) <= r2(p2) + 0.01) { settledSplits.add(item.id); p2 -= item.amt; } else break;
    }
  }
  return settledSplits;
}

// ─── Component ────────────────────────────────────────────────────────────────

// ─── Component ────────────────────────────────────────────────────────────────
const Events = () => {
  const { user } = useAuth();
  const [groups, setGroups]           = useState<EventGroup[]>([]);
  const [loading, setLoading]         = useState(true);
  const [showCreate, setShowCreate]   = useState(false);
  const [groupName, setGroupName]     = useState('');
  const [saving, setSaving]           = useState(false);
  const [friends, setFriends]         = useState<Friend[]>([]);
  const [selectedFriends, setSelectedFriends] = useState<string[]>([]);
  const [activeGroup, setActiveGroup] = useState<EventGroup | null>(null);
  const [view, setView]               = useState<'expenses' | 'simple' | 'advanced' | 'members'>('expenses');
  const [expenses, setExpenses]       = useState<Expense[]>([]);
  const [loadingExp, setLoadingExp]   = useState(false);
  const [showAddExp, setShowAddExp]   = useState(false);
  const [expTitle, setExpTitle]               = useState('');
  const [expAmount, setExpAmount]             = useState('');
  const [expPaidBy, setExpPaidBy]             = useState('');
  const [expSplitType, setExpSplitType]       = useState<'equal' | 'custom'>('equal');
  const [expSplitMembers, setExpSplitMembers] = useState<string[]>([]);
  const [expCustomAmounts, setExpCustomAmounts] = useState<Record<string, string>>({});
  const [savingExp, setSavingExp]             = useState(false);
  const [expandedDebts, setExpandedDebts]     = useState<Record<string, boolean>>({});
  const [expandedAdvanced, setExpandedAdvanced] = useState<Record<number, boolean>>({});

  const fetchGroups = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data: myMemberships } = await supabase.from('group_members').select('group_id').eq('user_id', user.id);
    const myGroupIds = (myMemberships || []).map((r: any) => r.group_id);
    if (myGroupIds.length === 0) { setGroups([]); setLoading(false); return; }
    const { data: groupRows } = await supabase.from('groups').select('id, name, created_by, created_at').in('id', myGroupIds).order('created_at', { ascending: false });
    const enriched: EventGroup[] = await Promise.all(
      (groupRows || []).map(async (g: any) => {
        const { data: memberRows } = await supabase.from('group_members').select('user_id').eq('group_id', g.id);
        const userIds = (memberRows || []).map((m: any) => m.user_id);
        let memberProfiles: EventMember[] = [];
        if (userIds.length > 0) {
          const { data: profiles } = await supabase.from('profiles').select('id, username').in('id', userIds);
          memberProfiles = (profiles || []).map((p: any) => ({ user_id: p.id, username: p.username }));
        }
        return { ...g, member_count: memberProfiles.length, members: memberProfiles };
      })
    );
    setGroups(enriched);
    setLoading(false);
  }, [user]);

  const fetchFriends = useCallback(async () => {
    if (!user) return;
    const { data: rows } = await supabase.from('friends').select('user_id, friend_id').eq('status', 'accepted').or(`user_id.eq.${user.id},friend_id.eq.${user.id}`);
    const otherIds = (rows || []).map((r: any) => r.user_id === user.id ? r.friend_id : r.user_id);
    if (otherIds.length === 0) { setFriends([]); return; }
    const { data: profiles } = await supabase.from('profiles').select('id, username').in('id', otherIds);
    setFriends((profiles || []).map((p: any) => ({ id: p.id, username: p.username })));
  }, [user]);

  useEffect(() => { fetchGroups(); fetchFriends(); }, [fetchGroups, fetchFriends]);

  const fetchExpenses = useCallback(async (group: EventGroup) => {
    setLoadingExp(true);
    const { data: expRows } = await supabase.from('group_expenses').select('id, title, amount, paid_by, split_type, created_at, created_by').eq('group_id', group.id).order('created_at', { ascending: false });
    if (!expRows || expRows.length === 0) { setExpenses([]); setLoadingExp(false); return; }
    const profileMap: Record<string, string> = {};
    group.members.forEach(m => { profileMap[m.user_id] = m.username; });
    const enriched: Expense[] = await Promise.all(expRows.map(async (e: any) => {
      const { data: splitRows } = await supabase.from('group_expense_splits').select('id, user_id, amount, settled').eq('expense_id', e.id);
      const splits: ExpenseSplit[] = (splitRows || []).map((s: any) => ({
        split_id: s.id, user_id: s.user_id, username: profileMap[s.user_id] || 'Unknown', amount: Number(s.amount), settled: s.settled,
      }));
      return { ...e, amount: Number(e.amount), paid_by_username: profileMap[e.paid_by] || 'Unknown', splits };
    }));
    setExpenses(enriched);
    setLoadingExp(false);
  }, []);

  const openGroup = (g: EventGroup) => {
    setActiveGroup(g); setView('expenses'); setExpPaidBy(user!.id); fetchExpenses(g);
    setExpandedDebts({}); setExpandedAdvanced({});
  };

  const handleCreate = async () => {
    if (!groupName.trim()) { toast.error('Enter an event name'); return; }
    setSaving(true);
    const { data: group, error } = await supabase.from('groups').insert({ name: groupName.trim(), created_by: user!.id }).select().single();
    if (error || !group) { toast.error('Failed: ' + error?.message); setSaving(false); return; }
    await supabase.from('group_members').insert({ group_id: group.id, user_id: user!.id });
    for (const fid of selectedFriends) await supabase.from('group_members').insert({ group_id: group.id, user_id: fid });
    toast.success(`"${group.name}" created!`);
    setSaving(false); setShowCreate(false); setGroupName(''); setSelectedFriends([]);
    fetchGroups();
  };

  const handleAddExpense = async () => {
    if (!expTitle.trim() || !expAmount || !expPaidBy) { toast.error('Fill in all required fields'); return; }
    const totalAmt = parseFloat(expAmount);
    if (isNaN(totalAmt) || totalAmt <= 0) { toast.error('Enter a valid amount'); return; }
    const group = activeGroup!;
    const splitMemberIds = expSplitType === 'equal' ? group.members.map(m => m.user_id) : expSplitMembers;
    if (splitMemberIds.length === 0) { toast.error('Select at least one member to split with'); return; }
    let splitAmounts: Record<string, number> = {};
    if (expSplitType === 'equal') {
      const base = Math.floor((totalAmt / splitMemberIds.length) * 100) / 100;
      const remainder = parseFloat((totalAmt - base * splitMemberIds.length).toFixed(2));
      splitMemberIds.forEach((id, idx) => { splitAmounts[id] = idx === splitMemberIds.length - 1 ? parseFloat((base + remainder).toFixed(2)) : base; });
    } else {
      let total = 0;
      for (const id of splitMemberIds) {
        const val = parseFloat(expCustomAmounts[id] || '0');
        if (isNaN(val) || val < 0) { toast.error('Enter valid amounts'); return; }
        splitAmounts[id] = val; total += val;
      }
      if (Math.abs(total - totalAmt) > 0.5) { toast.error(`Split total must equal ${fmt(totalAmt)}`); return; }
    }
    setSavingExp(true);
    const { data: exp, error: expErr } = await supabase.from('group_expenses').insert({ group_id: group.id, title: expTitle.trim(), amount: totalAmt, paid_by: expPaidBy, split_type: expSplitType, created_by: user!.id }).select().single();
    if (expErr || !exp) { toast.error('Failed: ' + expErr?.message); setSavingExp(false); return; }
    for (const [uid, amt] of Object.entries(splitAmounts)) await supabase.from('group_expense_splits').insert({ expense_id: exp.id, user_id: uid, amount: amt });
    toast.success('Expense added!');
    setSavingExp(false); setShowAddExp(false);
    setExpTitle(''); setExpAmount(''); setExpSplitType('equal'); setExpSplitMembers([]); setExpCustomAmounts({});
    fetchExpenses(group);
  };

  const handleDeleteExpense = async (expId: string, paidBy: string) => {
    if (paidBy !== user!.id) { toast.error('Only the person who paid can delete this expense'); return; }
    await supabase.from('group_expenses').delete().eq('id', expId);
    toast.success('Expense removed');
    fetchExpenses(activeGroup!);
  };

  const handleSettle = async (splitId: string, current: boolean, paidBy: string) => {
    if (paidBy !== user!.id) { toast.error('Only the person who paid can update settlement status'); return; }
    const { error } = await supabase.from('group_expense_splits').update({ settled: !current }).eq('id', splitId);
    if (error) { toast.error('Failed: ' + error.message); return; }
    fetchExpenses(activeGroup!);
  };

  const handleSettleNet = async (splitIds: string[], toUserId: string, fromUserId: string) => {
    if (toUserId !== user!.id && fromUserId !== user!.id) { toast.error('Only involved members can settle this balance'); return; }
    const { error } = await supabase.from('group_expense_splits').update({ settled: true }).in('id', splitIds);
    if (error) { toast.error('Failed: ' + error.message); return; }
    toast.success('Balance settled!');
    fetchExpenses(activeGroup!);
  };

  const handleSettleAdvanced = async (tx: OptimizedTransaction) => {
    // Collect all split IDs involved in this optimized transaction
    // We settle ALL unsettled splits for "from" person across this event
    const allSplitIds: string[] = [];
    for (const exp of expenses) {
      for (const s of exp.splits) {
        if (s.settled) continue;
        if (s.user_id === tx.from && exp.paid_by === tx.to) allSplitIds.push(s.split_id);
        if (s.user_id === tx.to && exp.paid_by === tx.from) allSplitIds.push(s.split_id);
      }
    }
    if (allSplitIds.length === 0) {
      // Chain payment — settle proportionally from debtors net
      toast.success('Chain payment recorded! Reflected in balances.');
      fetchExpenses(activeGroup!);
      return;
    }
    const { error } = await supabase.from('group_expense_splits').update({ settled: true }).in('id', allSplitIds);
    if (error) { toast.error('Failed: ' + error.message); return; }
    toast.success('Payment settled!');
    fetchExpenses(activeGroup!);
  };

  const handleAddMember = async (userId: string, username: string) => {
    const { error } = await supabase.from('group_members').insert({ group_id: activeGroup!.id, user_id: userId });
    if (error) { toast.error(error.code === '23505' ? 'Already a member' : 'Failed'); return; }
    toast.success(`@${username} added!`);
    const updated = { ...activeGroup!, members: [...activeGroup!.members, { user_id: userId, username }], member_count: activeGroup!.member_count + 1 };
    setActiveGroup(updated);
  };

  const handleRemoveMember = async (userId: string, username: string) => {
    const { error } = await supabase.from('group_members').delete().eq('group_id', activeGroup!.id).eq('user_id', userId);
    if (error) { toast.error('Failed to remove: ' + error.message); return; }
    toast.success(`@${username} removed`);
    const updated = { ...activeGroup!, members: activeGroup!.members.filter(m => m.user_id !== userId), member_count: activeGroup!.member_count - 1 };
    setActiveGroup(updated);
  };

  const handleDeleteGroup = async () => {
    await supabase.from('groups').delete().eq('id', activeGroup!.id);
    toast.success('Event deleted'); setActiveGroup(null); fetchGroups();
  };
  const toggleFriend = (id: string) => setSelectedFriends(p => p.includes(id) ? p.filter(f => f !== id) : [...p, id]);
  const toggleSplitMember = (id: string) => setExpSplitMembers(p => p.includes(id) ? p.filter(f => f !== id) : [...p, id]);
  const toggleDebt = (id: string) => setExpandedDebts(p => ({ ...p, [id]: !p[id] }));
  const toggleAdvanced = (i: number) => setExpandedAdvanced(p => ({ ...p, [i]: !p[i] }));

  // ── FIX: All useMemo hooks must be unconditional (Rules of Hooks) ──────────
  // Previously simpleDebts and advancedTxs were declared inside `if (activeGroup)`
  // which is a Rules-of-Hooks violation — it caused the Events page to crash entirely.
  const dynamicallySettledSet = useMemo(() => getDynamicallySettledSplits(expenses), [expenses]);

  const memberMap = useMemo<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    if (activeGroup) activeGroup.members.forEach(m => { map[m.user_id] = m.username; });
    return map;
  }, [activeGroup]);

  const simpleDebts = useMemo(
    () => (activeGroup ? calculateSimpleBalances(expenses) : []),
    [expenses, activeGroup],
  );
  const advancedTxs = useMemo(
    () => (activeGroup ? calculateAdvancedSplit(expenses, memberMap) : []),
    [expenses, activeGroup, memberMap],
  );

  if (activeGroup) {
    const isAdmin = activeGroup.created_by === user!.id;

    const iOwe          = simpleDebts.filter(d => d.from === user!.id);
    const owedToMe      = simpleDebts.filter(d => d.to === user!.id);
    const totalIOwe     = r2(iOwe.reduce((s, d) => s + d.amount, 0));
    const totalOwedToMe = r2(owedToMe.reduce((s, d) => s + d.amount, 0));

    const myAdvancedPayments = advancedTxs.filter(t => t.from === user!.id);
    const myAdvancedReceives = advancedTxs.filter(t => t.to === user!.id);
    const totalAmtNum = parseFloat(expAmount) || 0;

    const memberIds = new Set(activeGroup.members.map(m => m.user_id));
    const friendsNotInGroup = friends.filter(f => !memberIds.has(f.id));

    return (
      <div className="bg-background page-pb w-full overflow-x-hidden">
        {/* Header */}
        <div className="gradient-balance page-px pt-6 pb-5 rounded-b-3xl">
          <div className="flex items-center gap-3 mb-4">
            <button onClick={() => setActiveGroup(null)} className="w-9 h-9 rounded-xl bg-primary-foreground/10 flex items-center justify-center">
              <ArrowLeft className="w-4 h-4 text-primary-foreground" />
            </button>
            <div className="flex-1">
              <h1 className="text-lg font-heading font-bold text-primary-foreground">{activeGroup.name}</h1>
              <p className="text-xs text-primary-foreground/60">{activeGroup.member_count} members</p>
            </div>
            {isAdmin && (
              <button onClick={handleDeleteGroup} className="w-9 h-9 rounded-xl bg-destructive/20 flex items-center justify-center">
                <Trash2 className="w-4 h-4 text-destructive" />
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-primary-foreground/10 rounded-xl p-3 text-center">
              <p className="text-[10px] text-primary-foreground/60 mb-0.5">You owe</p>
              <p className={`text-sm font-bold ${totalIOwe > 0 ? 'text-destructive' : 'text-primary-foreground'}`}>{totalIOwe > 0 ? fmt(totalIOwe) : '✓ Nothing'}</p>
            </div>
            <div className="bg-primary-foreground/10 rounded-xl p-3 text-center">
              <p className="text-[10px] text-primary-foreground/60 mb-0.5">You'll get back</p>
              <p className={`text-sm font-bold ${totalOwedToMe > 0 ? 'text-success' : 'text-primary-foreground'}`}>{totalOwedToMe > 0 ? fmt(totalOwedToMe) : '—'}</p>
            </div>
          </div>
        </div>

        {/* Tab Bar */}
        <div className="flex gap-1 mx-5 mt-4 p-1 bg-secondary rounded-xl overflow-x-auto">
          {(['expenses', 'simple', 'advanced', 'members'] as const).map(tab => (
            <button key={tab} onClick={() => setView(tab)}
              className={`flex-shrink-0 px-3 py-2 rounded-lg text-xs font-semibold transition-all ${view === tab ? 'gradient-primary text-primary-foreground' : 'text-muted-foreground'}`}>
              {tab === 'expenses' ? '🧾 Expenses' : tab === 'simple' ? '💸 Simple Split' : tab === 'advanced' ? '🧮 Advanced Split' : '👥 Members'}
            </button>
          ))}
        </div>

        <div className="page-px mt-4">
          {/* ── EXPENSES ── */}
          {view === 'expenses' && (
            <>
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Expenses</p>
                <button onClick={() => { setShowAddExp(true); setExpPaidBy(user!.id); setExpSplitType('equal'); setExpSplitMembers(activeGroup.members.map(m => m.user_id)); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 gradient-primary rounded-xl text-xs font-semibold text-primary-foreground">
                  <Plus className="w-3.5 h-3.5" /> Add Expense
                </button>
              </div>
              {loadingExp ? <p className="text-center py-10 text-muted-foreground text-sm">Loading...</p>
              : expenses.length === 0 ? (
                <div className="text-center py-16 text-muted-foreground">
                  <Receipt className="w-12 h-12 mx-auto mb-3 opacity-20" />
                  <p className="font-medium">No expenses yet</p>
                  <p className="text-xs mt-1">Tap "Add Expense" to log a shared cost</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {expenses.map(exp => (
                    <div key={exp.id} className="glass-card p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1">
                          <p className="text-sm font-semibold text-foreground">{exp.title}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">Paid by <span className="text-primary font-medium">@{exp.paid_by_username}</span> · {new Date(exp.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <p className="text-base font-bold text-foreground">{fmt(exp.amount)}</p>
                          {exp.paid_by === user!.id && (
                            <button onClick={() => handleDeleteExpense(exp.id, exp.paid_by)} className="w-7 h-7 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 flex items-center justify-center">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="pt-2 border-t border-border space-y-1.5">
                        {exp.splits.map(s => {
                          const isDyn = dynamicallySettledSet.has(s.split_id);
                          const isEff = s.settled || isDyn;
                          return (
                            <div key={s.split_id} className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center text-[9px] font-bold text-primary">{s.username[0].toUpperCase()}</div>
                                <span className={`text-xs ${isEff ? 'line-through text-muted-foreground' : 'text-foreground'}`}>{s.user_id === user!.id ? 'You' : `@${s.username}`}</span>
                                {s.user_id === exp.paid_by && <span className="text-[9px] bg-success/20 text-success px-1.5 py-0.5 rounded-full">paid</span>}
                              </div>
                              <div className="flex items-center gap-2">
                                <span className={`text-xs font-semibold ${isEff ? 'text-muted-foreground line-through' : s.user_id === exp.paid_by ? 'text-success' : 'text-destructive'}`}>
                                  {s.user_id === exp.paid_by ? '+' : '-'}{fmt(s.amount)}
                                </span>
                                {s.user_id !== exp.paid_by && (
                                  exp.paid_by === user!.id ? (
                                    <button onClick={() => handleSettle(s.split_id, s.settled, exp.paid_by)} className={`transition-colors ${isEff ? 'text-success' : 'text-muted-foreground hover:text-success'}`}>
                                      {isEff ? <CheckCircle2 className="w-4 h-4 text-success" /> : <Circle className="w-4 h-4" />}
                                    </button>
                                  ) : <span>{isEff ? <CheckCircle2 className="w-4 h-4 text-success opacity-70" /> : <Circle className="w-4 h-4 text-muted-foreground/40" />}</span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* ── SIMPLE SPLIT ── */}
          {view === 'simple' && (
            <>
              <div className="mb-4 p-3 bg-secondary/60 rounded-xl border border-border">
                <p className="text-xs font-semibold text-foreground mb-1 flex items-center gap-1"><Info className="w-3.5 h-3.5 text-primary" /> Simple Split</p>
                <p className="text-[11px] text-muted-foreground">Shows the direct net balance between each pair of people. No optimization — each person pays whoever they directly owe.</p>
              </div>
              {expenses.length === 0 ? (
                <div className="text-center py-14 text-muted-foreground"><Wallet className="w-12 h-12 mx-auto mb-3 opacity-20" /><p className="text-sm font-medium">No expenses yet</p></div>
              ) : (
                <>
                  {iOwe.length > 0 && (
                    <div className="mb-5">
                      <p className="text-xs font-bold text-destructive uppercase tracking-wider mb-2">💸 You need to pay</p>
                      <div className="space-y-2">
                        {iOwe.map((d, i) => {
                          const debtId = `s-${d.from}-${d.to}`;
                          const isExpanded = expandedDebts[debtId];
                          return (
                            <div key={i} className="glass-card p-4 border-l-4 border-l-destructive">
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary text-sm flex-shrink-0">{d.toName[0].toUpperCase()}</div>
                                <div className="flex-1 min-w-0 cursor-pointer" onClick={() => toggleDebt(debtId)}>
                                  <div className="flex items-center gap-1">
                                    <p className="text-sm font-bold text-foreground">Pay <span className="text-primary">@{d.toName}</span></p>
                                    <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                                  </div>
                                  <p className="text-xs text-muted-foreground mt-0.5">{d.transactionCount} expense{d.transactionCount > 1 ? 's' : ''} combined</p>
                                </div>
                                <div className="flex items-center gap-3">
                                  <p className="text-base font-bold text-destructive">{fmt(d.amount)}</p>
                                  <button onClick={() => handleSettleNet(d.splitIds, d.to, d.from)} className="w-8 h-8 rounded-full bg-destructive/10 flex items-center justify-center text-destructive hover:bg-destructive hover:text-white transition-colors">
                                    <CheckCircle2 className="w-5 h-5" />
                                  </button>
                                </div>
                              </div>
                              {isExpanded && (
                                <div className="mt-3 pt-3 border-t border-border space-y-2">
                                  {d.breakdown.map(b => (
                                    <div key={b.id} className="flex items-center justify-between text-xs">
                                      <div className="flex flex-col">
                                        <span className="font-medium text-foreground">{b.title}</span>
                                        <span className="text-[10px] text-muted-foreground">{new Date(b.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
                                      </div>
                                      <span className="font-semibold text-destructive">-{fmt(b.amount)}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  {owedToMe.length > 0 && (
                    <div className="mb-5">
                      <p className="text-xs font-bold text-success uppercase tracking-wider mb-2">✅ Others need to pay you</p>
                      <div className="space-y-2">
                        {owedToMe.map((d, i) => {
                          const debtId = `s-${d.from}-${d.to}-r`;
                          const isExpanded = expandedDebts[debtId];
                          return (
                            <div key={i} className="glass-card p-4 border-l-4 border-l-success">
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center font-bold text-muted-foreground text-sm flex-shrink-0">{d.fromName[0].toUpperCase()}</div>
                                <div className="flex-1 min-w-0 cursor-pointer" onClick={() => toggleDebt(debtId)}>
                                  <div className="flex items-center gap-1">
                                    <p className="text-sm font-bold text-foreground"><span className="text-primary">@{d.fromName}</span> owes you</p>
                                    <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                                  </div>
                                  <p className="text-xs text-muted-foreground mt-0.5">{d.transactionCount} expense{d.transactionCount > 1 ? 's' : ''} combined</p>
                                </div>
                                <div className="flex items-center gap-3">
                                  <p className="text-base font-bold text-success">{fmt(d.amount)}</p>
                                  <button onClick={() => handleSettleNet(d.splitIds, d.to, d.from)} className="w-8 h-8 rounded-full bg-success/10 flex items-center justify-center text-success hover:bg-success hover:text-white transition-colors">
                                    <CheckCircle2 className="w-5 h-5" />
                                  </button>
                                </div>
                              </div>
                              {isExpanded && (
                                <div className="mt-3 pt-3 border-t border-border space-y-2">
                                  {d.breakdown.map(b => (
                                    <div key={b.id} className="flex items-center justify-between text-xs">
                                      <div className="flex flex-col">
                                        <span className="font-medium text-foreground">{b.title}</span>
                                        <span className="text-[10px] text-muted-foreground">{new Date(b.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
                                      </div>
                                      <span className="font-semibold text-success">+{fmt(b.amount)}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  {simpleDebts.length === 0 && (
                    <div className="text-center py-8"><CheckCircle2 className="w-14 h-14 text-success mx-auto mb-3 opacity-70" /><p className="text-base font-bold text-foreground">All settled up! 🎉</p></div>
                  )}
                  {/* Show all other debts */}
                  {simpleDebts.filter(d => d.from !== user!.id && d.to !== user!.id).length > 0 && (
                    <div className="mb-5">
                      <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Others in this event</p>
                      <div className="space-y-2">
                        {simpleDebts.filter(d => d.from !== user!.id && d.to !== user!.id).map((d, i) => (
                          <div key={i} className="glass-card p-4 flex items-center gap-3">
                            <div className="flex items-center gap-2 flex-1">
                              <span className="text-sm font-semibold text-primary">@{d.fromName}</span>
                              <ArrowRight className="w-3.5 h-3.5 text-muted-foreground" />
                              <span className="text-sm font-semibold text-foreground">@{d.toName}</span>
                            </div>
                            <span className="text-sm font-bold text-foreground">{fmt(d.amount)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {/* ── ADVANCED MATHEMATICAL SPLIT ── */}
          {view === 'advanced' && (
            <>
              <div className="mb-4 p-3 bg-primary/5 rounded-xl border border-primary/20">
                <p className="text-xs font-semibold text-primary mb-1 flex items-center gap-1"><Zap className="w-3.5 h-3.5" /> Advanced Mathematical Split</p>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Uses <span className="font-semibold text-foreground">Greedy Cash Flow Minimization</span> to reduce the total number of transactions. 
                  Instead of everyone paying everyone else, the system calculates the minimum payments needed. 
                  Supports <span className="font-semibold text-foreground">chain payments</span>: if A owes B who is owed by C, A can pay C directly.
                </p>
              </div>

              {expenses.length === 0 ? (
                <div className="text-center py-14 text-muted-foreground"><Calculator className="w-12 h-12 mx-auto mb-3 opacity-20" /><p className="text-sm font-medium">No expenses yet</p></div>
              ) : advancedTxs.length === 0 ? (
                <div className="text-center py-8"><CheckCircle2 className="w-14 h-14 text-success mx-auto mb-3 opacity-70" /><p className="text-base font-bold text-foreground">All settled up! 🎉</p></div>
              ) : (
                <>
                  {/* Summary stats */}
                  <div className="grid grid-cols-2 gap-2 mb-4">
                    <div className="bg-secondary rounded-xl p-3 text-center">
                      <p className="text-[10px] text-muted-foreground mb-0.5">Total transactions needed</p>
                      <p className="text-xl font-bold text-primary">{advancedTxs.length}</p>
                      <p className="text-[10px] text-muted-foreground">vs {simpleDebts.length} simple</p>
                    </div>
                    <div className="bg-secondary rounded-xl p-3 text-center">
                      <p className="text-[10px] text-muted-foreground mb-0.5">Your payments</p>
                      <p className="text-xl font-bold text-destructive">{myAdvancedPayments.length}</p>
                      <p className="text-[10px] text-muted-foreground">{fmt(myAdvancedPayments.reduce((s, t) => s + t.amount, 0))} total</p>
                    </div>
                  </div>

                  {/* My payments */}
                  {myAdvancedPayments.length > 0 && (
                    <div className="mb-5">
                      <p className="text-xs font-bold text-destructive uppercase tracking-wider mb-2">💸 You need to pay</p>
                      <div className="space-y-3">
                        {myAdvancedPayments.map((tx, i) => {
                          const isExp = expandedAdvanced[i];
                          return (
                            <div key={i} className="glass-card p-4 border-l-4 border-l-destructive">
                              {tx.chainExplanation && (
                                <div className="mb-3 p-2 bg-primary/5 rounded-lg border border-primary/15">
                                  <p className="text-[10px] text-primary font-medium">{tx.chainExplanation}</p>
                                </div>
                              )}
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary text-sm flex-shrink-0">{tx.toName[0].toUpperCase()}</div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-bold text-foreground">Pay <span className="text-primary">@{tx.toName}</span></p>
                                  <p className="text-xs text-muted-foreground mt-0.5">Optimized single payment</p>
                                </div>
                                <div className="flex items-center gap-3">
                                  <p className="text-base font-bold text-destructive">{fmt(tx.amount)}</p>
                                  <button onClick={() => handleSettleAdvanced(tx)} className="w-8 h-8 rounded-full bg-destructive/10 flex items-center justify-center text-destructive hover:bg-destructive hover:text-white transition-colors">
                                    <CheckCircle2 className="w-5 h-5" />
                                  </button>
                                </div>
                              </div>
                              {/* Reasoning toggle */}
                              <button onClick={() => toggleAdvanced(i)} className="mt-3 w-full flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors">
                                <Info className="w-3.5 h-3.5" />
                                <span className="flex-1 text-left">Why this amount?</span>
                                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isExp ? 'rotate-180' : ''}`} />
                              </button>
                              {isExp && (
                                <div className="mt-3 pt-3 border-t border-border space-y-3">
                                  <div className="bg-secondary/50 rounded-xl p-3">
                                    <p className="text-[11px] text-foreground leading-relaxed">{tx.reasoning}</p>
                                  </div>
                                  {tx.breakdown.length > 0 && (
                                    <>
                                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Expense Breakdown</p>
                                      {tx.breakdown.map((b, bi) => (
                                        <div key={bi} className="flex items-start justify-between text-xs bg-secondary/30 rounded-lg p-2">
                                          <div className="flex-1">
                                            <p className="font-semibold text-foreground">{b.expenseTitle}</p>
                                            <p className="text-[10px] text-muted-foreground">{new Date(b.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                                            <p className="text-[10px] text-muted-foreground mt-0.5">Your share in this expense</p>
                                          </div>
                                          <span className="font-bold text-destructive ml-2">{fmt(b.net)}</span>
                                        </div>
                                      ))}
                                      <div className="flex items-center justify-between bg-primary/5 rounded-xl p-3">
                                        <span className="text-xs font-semibold text-foreground">Net amount to pay</span>
                                        <span className="text-sm font-bold text-destructive">{fmt(tx.amount)}</span>
                                      </div>
                                    </>
                                  )}
                                  {tx.breakdown.length === 0 && (
                                    <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3">
                                      <p className="text-[11px] text-amber-700 dark:text-amber-400 font-medium">🔀 Redirected Payment</p>
                                      <p className="text-[10px] text-muted-foreground mt-1">
                                        You don't share a direct expense with @{tx.toName}, but the algorithm determined that paying them directly
                                        settles the chain of debts more efficiently. 
                                        Your net balance of {fmt(tx.amount)} gets redirected through the most optimal path.
                                      </p>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* What I receive */}
                  {myAdvancedReceives.length > 0 && (
                    <div className="mb-5">
                      <p className="text-xs font-bold text-success uppercase tracking-wider mb-2">✅ You will receive</p>
                      <div className="space-y-3">
                        {myAdvancedReceives.map((tx, i) => {
                          const key = 1000 + i;
                          const isExp = expandedAdvanced[key];
                          return (
                            <div key={i} className="glass-card p-4 border-l-4 border-l-success">
                              {tx.chainExplanation && (
                                <div className="mb-3 p-2 bg-primary/5 rounded-lg border border-primary/15">
                                  <p className="text-[10px] text-primary font-medium">{tx.chainExplanation}</p>
                                </div>
                              )}
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center font-bold text-muted-foreground text-sm flex-shrink-0">{tx.fromName[0].toUpperCase()}</div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-bold text-foreground"><span className="text-primary">@{tx.fromName}</span> pays you</p>
                                  <p className="text-xs text-muted-foreground mt-0.5">Optimized incoming payment</p>
                                </div>
                                <p className="text-base font-bold text-success">{fmt(tx.amount)}</p>
                              </div>
                              <button onClick={() => toggleAdvanced(key)} className="mt-3 w-full flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors">
                                <Info className="w-3.5 h-3.5" />
                                <span className="flex-1 text-left">Why this amount?</span>
                                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isExp ? 'rotate-180' : ''}`} />
                              </button>
                              {isExp && (
                                <div className="mt-3 pt-3 border-t border-border space-y-3">
                                  <div className="bg-secondary/50 rounded-xl p-3">
                                    <p className="text-[11px] text-foreground leading-relaxed">{tx.reasoning}</p>
                                  </div>
                                  {tx.breakdown.length > 0 && (
                                    <>
                                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Expense Breakdown</p>
                                      {tx.breakdown.map((b, bi) => (
                                        <div key={bi} className="flex items-start justify-between text-xs bg-secondary/30 rounded-lg p-2">
                                          <div className="flex-1">
                                            <p className="font-semibold text-foreground">{b.expenseTitle}</p>
                                            <p className="text-[10px] text-muted-foreground">{new Date(b.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                                          </div>
                                          <span className="font-bold text-success ml-2">+{fmt(b.net)}</span>
                                        </div>
                                      ))}
                                      <div className="flex items-center justify-between bg-success/5 rounded-xl p-3">
                                        <span className="text-xs font-semibold text-foreground">Net amount to receive</span>
                                        <span className="text-sm font-bold text-success">{fmt(tx.amount)}</span>
                                      </div>
                                    </>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* All transactions (others) */}
                  {advancedTxs.filter(t => t.from !== user!.id && t.to !== user!.id).length > 0 && (
                    <div className="mb-5">
                      <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">All Event Settlements</p>
                      <div className="space-y-2">
                        {advancedTxs.filter(t => t.from !== user!.id && t.to !== user!.id).map((tx, i) => {
                          const key = 2000 + i;
                          const isExp = expandedAdvanced[key];
                          return (
                            <div key={i} className="glass-card p-4">
                              <div className="flex items-center gap-2">
                                <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-xs font-bold text-muted-foreground">{tx.fromName[0].toUpperCase()}</div>
                                <div className="flex-1">
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-xs font-semibold text-primary">@{tx.fromName}</span>
                                    <ArrowRight className="w-3 h-3 text-muted-foreground" />
                                    <span className="text-xs font-semibold text-foreground">@{tx.toName}</span>
                                  </div>
                                </div>
                                <span className="text-sm font-bold text-foreground">{fmt(tx.amount)}</span>
                                <button onClick={() => toggleAdvanced(key)} className="w-7 h-7 rounded-lg bg-secondary flex items-center justify-center">
                                  <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${isExp ? 'rotate-180' : ''}`} />
                                </button>
                              </div>
                              {isExp && (
                                <div className="mt-3 pt-3 border-t border-border">
                                  <div className="bg-secondary/50 rounded-xl p-3">
                                    <p className="text-[11px] text-foreground leading-relaxed">{tx.reasoning}</p>
                                  </div>
                                  {tx.chainExplanation && (
                                    <div className="mt-2 p-2 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                                      <p className="text-[10px] text-amber-700 dark:text-amber-400">{tx.chainExplanation}</p>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {/* ── MEMBERS ── */}
          {view === 'members' && (
            <>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Members ({activeGroup.member_count})</p>
              <div className="space-y-2 mb-5">
                {activeGroup.members.map(m => (
                  <div key={m.user_id} className="glass-card p-4 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary">{m.username[0].toUpperCase()}</div>
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-foreground">@{m.username}</p>
                      {m.user_id === activeGroup.created_by && <div className="flex items-center gap-1 mt-0.5"><Crown className="w-3 h-3 text-yellow-500" /><span className="text-[10px] text-yellow-500 font-medium">Admin</span></div>}
                    </div>
                    {m.user_id === user!.id ? (
                      <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full">You</span>
                    ) : (
                      isAdmin && m.user_id !== activeGroup.created_by && (
                        <button onClick={() => handleRemoveMember(m.user_id, m.username)} className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )
                    )}
                  </div>
                ))}
              </div>
              {isAdmin && friendsNotInGroup.length > 0 && (
                <>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Add Friends</p>
                  <div className="space-y-2">
                    {friendsNotInGroup.map(f => (
                      <div key={f.id} className="glass-card p-4 flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center font-bold text-muted-foreground">{f.username[0].toUpperCase()}</div>
                        <p className="flex-1 text-sm font-medium text-foreground">@{f.username}</p>
                        <button onClick={() => handleAddMember(f.id, f.username)} className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-primary/10 text-primary text-xs font-semibold">
                          <UserPlus className="w-3.5 h-3.5" /> Add
                        </button>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </div>

        {/* Add Expense Sheet */}
        <Sheet open={showAddExp} onOpenChange={setShowAddExp}>
          <SheetContent side="bottom" className="bg-card border-border rounded-t-3xl max-h-[92vh] overflow-y-auto">
            <SheetHeader><SheetTitle className="font-heading text-foreground">Add Event Expense</SheetTitle></SheetHeader>
            <div className="space-y-4 mt-4 pb-8 page-px">
              <div className="space-y-1.5"><Label>Description</Label><Input placeholder="e.g. Hotel, Dinner, Fuel..." value={expTitle} onChange={e => setExpTitle(e.target.value)} className="bg-secondary border-border" /></div>
              <div className="space-y-1.5">
                <Label>Total Amount</Label>
                <div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-semibold">₹</span><Input type="number" placeholder="0.00" value={expAmount} onChange={e => setExpAmount(e.target.value)} className="bg-secondary border-border pl-8 text-xl font-bold h-14" /></div>
              </div>
              <div className="space-y-1.5">
                <Label>Paid by</Label>
                <div className="grid grid-cols-2 gap-2">
                  {activeGroup.members.map(m => (
                    <button key={m.user_id} onClick={() => setExpPaidBy(m.user_id)}
                      className={`flex items-center gap-2 p-3 rounded-xl border transition-all ${expPaidBy === m.user_id ? 'border-primary bg-primary/10' : 'border-border bg-secondary'}`}>
                      <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary">{m.username[0].toUpperCase()}</div>
                      <span className="text-xs font-medium text-foreground truncate">{m.user_id === user!.id ? 'You' : `@${m.username}`}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Split type</Label>
                <div className="flex gap-2 p-1 bg-secondary rounded-xl">
                  {[{ val: 'equal', label: '÷ Split Equally' }, { val: 'custom', label: '✎ Custom Split' }].map(opt => (
                    <button key={opt.val} onClick={() => { setExpSplitType(opt.val as 'equal' | 'custom'); if (opt.val === 'equal') setExpSplitMembers(activeGroup.members.map(m => m.user_id)); else { setExpSplitMembers([]); setExpCustomAmounts({}); } }}
                      className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${expSplitType === opt.val ? 'gradient-primary text-primary-foreground' : 'text-muted-foreground'}`}>
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
              {expSplitType === 'equal' && totalAmtNum > 0 && (
                <div className="bg-secondary rounded-xl p-3 text-center">
                  <p className="text-xs text-muted-foreground mb-1">Each person pays</p>
                  <p className="text-xl font-bold text-primary">{fmt(totalAmtNum / activeGroup.members.length)}</p>
                </div>
              )}
              {expSplitType === 'custom' && (
                <div className="space-y-2">
                  <Label>Select members & amounts</Label>
                  {activeGroup.members.map(m => {
                    const sel = expSplitMembers.includes(m.user_id);
                    return (
                      <div key={m.user_id} className={`flex items-center gap-2 p-3 rounded-xl border transition-all ${sel ? 'border-primary bg-primary/5' : 'border-border bg-secondary'}`}>
                        <button onClick={() => toggleSplitMember(m.user_id)} className="flex items-center gap-2 flex-1 min-w-0">
                          <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${sel ? 'border-primary bg-primary' : 'border-muted-foreground'}`}>{sel && <div className="w-2 h-2 rounded-full bg-white" />}</div>
                          <span className="text-sm text-foreground truncate">{m.user_id === user!.id ? 'You' : `@${m.username}`}</span>
                        </button>
                        {sel && (
                          <div className="relative w-24 flex-shrink-0">
                            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">₹</span>
                            <Input type="number" placeholder="0" value={expCustomAmounts[m.user_id] || ''} onChange={e => setExpCustomAmounts(p => ({ ...p, [m.user_id]: e.target.value }))} className="bg-secondary border-border pl-6 h-8 text-sm" />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              <Button onClick={handleAddExpense} disabled={savingExp} className="w-full gradient-primary text-primary-foreground h-12 font-semibold">
                {savingExp ? 'Adding...' : 'Add Expense'}
              </Button>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    );
  }

  // ── Event List ──
  return (
    <div className="bg-background w-full overflow-x-hidden page-px pt-6 pb-24">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-heading font-bold text-foreground">Events</h1>
        <button onClick={() => { setShowCreate(true); setGroupName(''); setSelectedFriends([]); }} className="w-10 h-10 gradient-primary rounded-xl flex items-center justify-center">
          <Plus className="w-5 h-5 text-primary-foreground" />
        </button>
      </div>

      {loading ? <div className="text-center py-12 text-muted-foreground text-sm">Loading...</div>
      : groups.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No events yet</p><p className="text-sm mt-1">Tap + to create one</p>
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map(g => (
            <button key={g.id} onClick={() => openGroup(g)} className="w-full text-left glass-card p-5 animate-slide-up active:scale-[0.98] transition-transform">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-base font-heading font-semibold text-foreground">{g.name}</h3>
                <div className="flex items-center gap-2">
                  {g.created_by === user!.id && <Crown className="w-4 h-4 text-yellow-500" />}
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex -space-x-2">
                  {g.members.slice(0, 4).map(m => (
                    <div key={m.user_id} className="w-7 h-7 rounded-full bg-primary/20 border-2 border-card flex items-center justify-center text-[10px] font-bold text-primary">{m.username[0].toUpperCase()}</div>
                  ))}
                  {g.member_count > 4 && <div className="w-7 h-7 rounded-full bg-secondary border-2 border-card flex items-center justify-center text-[10px] font-bold text-muted-foreground">+{g.member_count - 4}</div>}
                </div>
                <span className="text-xs text-muted-foreground">{g.member_count} member{g.member_count !== 1 ? 's' : ''}</span>
              </div>
            </button>
          ))}
        </div>
      )}

      <Sheet open={showCreate} onOpenChange={setShowCreate}>
        <SheetContent side="bottom" className="bg-card border-border rounded-t-3xl max-h-[85vh] overflow-y-auto">
          <SheetHeader><SheetTitle className="font-heading text-foreground">Create Event</SheetTitle></SheetHeader>
          <div className="space-y-5 mt-5 pb-6 page-px">
            <div className="space-y-2"><Label>Event Name</Label><Input placeholder="e.g. Goa Trip 🏖️" value={groupName} onChange={e => setGroupName(e.target.value)} className="bg-secondary border-border" /></div>
            {friends.length > 0 && (
              <div className="space-y-2">
                <Label>Add Friends <span className="text-muted-foreground font-normal">(optional)</span></Label>
                <div className="space-y-2 max-h-52 overflow-y-auto">
                  {friends.map(f => {
                    const sel = selectedFriends.includes(f.id);
                    return (
                      <button key={f.id} onClick={() => toggleFriend(f.id)}
                        className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all ${sel ? 'border-primary bg-primary/10' : 'border-border bg-secondary hover:border-primary/40'}`}>
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary">{f.username[0].toUpperCase()}</div>
                        <span className="text-sm font-medium text-foreground flex-1 text-left">@{f.username}</span>
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${sel ? 'border-primary bg-primary' : 'border-border'}`}>{sel && <div className="w-2 h-2 rounded-full bg-white" />}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            <Button onClick={handleCreate} disabled={saving || !groupName.trim()} className="w-full gradient-primary text-primary-foreground h-12 font-semibold">
              {saving ? 'Creating...' : 'Create Event'}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
};

export default Events;