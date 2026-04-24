import { useState, useEffect } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

const CATEGORIES = [
  { name: 'Food',          emoji: '🍔', type: 'expense' },
  { name: 'Travel',        emoji: '✈️', type: 'expense' },
  { name: 'Rent',          emoji: '🏠', type: 'expense' },
  { name: 'Shopping',      emoji: '🛍️', type: 'expense' },
  { name: 'Bills',         emoji: '📱', type: 'expense' },
  { name: 'Entertainment', emoji: '🎬', type: 'expense' },
  { name: 'Health',        emoji: '🏥', type: 'expense' },
  { name: 'Education',     emoji: '📚', type: 'expense' },
  { name: 'Salary',        emoji: '💰', type: 'income'  },
  { name: 'Freelance',     emoji: '💻', type: 'income'  },
  { name: 'Investment',    emoji: '📈', type: 'income'  },
  { name: 'Gift',          emoji: '🎁', type: 'income'  },
  { name: 'Other',         emoji: '📦', type: 'both'    },
];

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

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
  editTransaction?: Transaction | null;
}

const AddTransactionSheet = ({ open, onOpenChange, onSaved, editTransaction }: Props) => {
  const { user } = useAuth();
  const isEditMode = !!editTransaction;

  const [type, setType]         = useState<'expense' | 'income'>('expense');
  const [amount, setAmount]     = useState('');
  const [title, setTitle]       = useState('');
  const [category, setCategory] = useState('');
  const [note, setNote]         = useState('');
  const [date, setDate]         = useState(new Date().toISOString().split('T')[0]);
  const [saving, setSaving]     = useState(false);

  useEffect(() => {
    if (editTransaction) {
      setType(editTransaction.type);
      setAmount(String(Math.abs(editTransaction.amount)));
      setTitle(editTransaction.title);
      setCategory(editTransaction.category);
      setNote(editTransaction.notes || '');
      setDate(editTransaction.date);
    } else {
      reset();
    }
  }, [editTransaction, open]);

  const visibleCats = CATEGORIES.filter(c => c.type === type || c.type === 'both');

  const reset = () => {
    setAmount(''); setTitle(''); setCategory(''); setNote('');
    setDate(new Date().toISOString().split('T')[0]);
    setType('expense');
  };

  const handleSave = async () => {
    if (!title.trim())  { toast.error('Enter a title'); return; }
    if (!amount)        { toast.error('Enter an amount'); return; }
    if (!category)      { toast.error('Select a category'); return; }

    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) { toast.error('Enter a valid amount'); return; }

    setSaving(true);
    const icon = CATEGORIES.find(c => c.name === category)?.emoji || '💸';
    const payload = {
      title:    title.trim(),
      amount:   type === 'expense' ? -numAmount : numAmount,
      type,
      category,
      icon,
      date,
      notes:    note.trim() || null,
    };

    if (isEditMode && editTransaction) {
      const { error } = await supabase
        .from('transactions')
        .update(payload)
        .eq('id', editTransaction.id);
      setSaving(false);
      if (error) { toast.error('Failed to update: ' + error.message); return; }
      toast.success('✅ Transaction updated!');
    } else {
      const { error } = await supabase.from('transactions').insert({
        user_id: user!.id,
        ...payload,
      });
      setSaving(false);
      if (error) { toast.error('Failed to save: ' + error.message); return; }
      toast.success(`${type === 'income' ? '💰 Income' : '💸 Expense'} saved!`);
    }

    reset();
    onOpenChange(false);
    onSaved?.();
  };

  return (
    <Sheet open={open} onOpenChange={v => { if (!v) reset(); onOpenChange(v); }}>
      <SheetContent side="bottom" className="bg-card border-border rounded-t-3xl max-h-[92vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="font-heading text-foreground">
            {isEditMode ? '✏️ Edit Transaction' : 'Add Transaction'}
          </SheetTitle>
        </SheetHeader>

        <div className="space-y-5 mt-4 pb-8 px-5">
          {/* Type toggle */}
          <div className="flex gap-2 p-1 bg-secondary rounded-xl">
            {(['expense', 'income'] as const).map(t => (
              <button key={t} onClick={() => { setType(t); setCategory(''); }}
                className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all capitalize ${
                  type === t
                    ? t === 'expense' ? 'bg-destructive text-white' : 'bg-success text-white'
                    : 'text-muted-foreground'
                }`}>
                {t === 'expense' ? '💸 Expense' : '💰 Income'}
              </button>
            ))}
          </div>

          {/* Amount */}
          <div>
            <Label className="text-xs text-muted-foreground uppercase tracking-wider">Amount</Label>
            <div className="relative mt-1.5">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-2xl font-bold text-muted-foreground">₹</span>
              <Input type="number" placeholder="0.00" value={amount}
                onChange={e => setAmount(e.target.value)}
                className="bg-secondary border-border pl-10 text-3xl font-bold h-16 tracking-tight" />
            </div>
          </div>

          {/* Title */}
          <div>
            <Label className="text-xs text-muted-foreground uppercase tracking-wider">Title</Label>
            <Input placeholder={type === 'expense' ? 'e.g. Swiggy order, Uber...' : 'e.g. Monthly salary...'}
              value={title} onChange={e => setTitle(e.target.value)}
              className="bg-secondary border-border mt-1.5" />
          </div>

          {/* Category grid */}
          <div>
            <Label className="text-xs text-muted-foreground uppercase tracking-wider">Category</Label>
            <div className="grid grid-cols-4 gap-2 mt-2">
              {visibleCats.map(cat => (
                <button key={cat.name} onClick={() => setCategory(cat.name)}
                  className={`flex flex-col items-center gap-1 p-2.5 rounded-xl border transition-all ${
                    category === cat.name
                      ? 'border-primary bg-primary/15 scale-105'
                      : 'border-border bg-secondary hover:border-primary/50'
                  }`}>
                  <span className="text-xl">{cat.emoji}</span>
                  <span className="text-[9px] text-muted-foreground font-medium leading-tight text-center">{cat.name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Date + Note */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground uppercase tracking-wider">Date</Label>
              <Input type="date" value={date} onChange={e => setDate(e.target.value)}
                className="bg-secondary border-border mt-1.5" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground uppercase tracking-wider">Note</Label>
              <Input placeholder="Optional note..." value={note} onChange={e => setNote(e.target.value)}
                className="bg-secondary border-border mt-1.5" />
            </div>
          </div>

          {/* Preview */}
          {amount && category && title && (
            <div className={`rounded-xl p-3 flex items-center gap-3 ${type === 'expense' ? 'bg-destructive/10 border border-destructive/20' : 'bg-success/10 border border-success/20'}`}>
              <span className="text-2xl">{CATEGORIES.find(c => c.name === category)?.emoji}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground truncate">{title}</p>
                <p className="text-xs text-muted-foreground">{category} · {date}</p>
              </div>
              <p className={`text-base font-bold ${type === 'expense' ? 'text-destructive' : 'text-success'}`}>
                {type === 'expense' ? '-' : '+'}₹{parseFloat(amount || '0').toLocaleString('en-IN')}
              </p>
            </div>
          )}

          <Button onClick={handleSave} disabled={saving}
            className="w-full gradient-primary text-primary-foreground font-bold h-12 text-base">
            {saving
              ? (isEditMode ? 'Updating...' : 'Saving...')
              : (isEditMode ? '✓ Update Transaction' : '✓ Save Transaction')}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default AddTransactionSheet;
