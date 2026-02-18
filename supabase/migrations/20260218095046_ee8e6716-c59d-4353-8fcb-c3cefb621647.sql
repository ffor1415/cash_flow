
-- Create transaction type enum
CREATE TYPE public.transaction_type AS ENUM ('income', 'expense');

-- Create borrow/lend type enum
CREATE TYPE public.borrow_lend_type AS ENUM ('borrow', 'lend');

-- Create borrow/lend status enum
CREATE TYPE public.borrow_lend_status AS ENUM ('pending', 'settled');

-- Categories table
CREATE TABLE public.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type transaction_type NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Transactions table
CREATE TABLE public.transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  type transaction_type NOT NULL,
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Borrow/Lend table
CREATE TABLE public.borrow_lend (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  person_name TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  type borrow_lend_type NOT NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT,
  status borrow_lend_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Helper function
CREATE OR REPLACE FUNCTION public.is_owner(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _user_id = auth.uid()
$$;

-- Enable RLS
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.borrow_lend ENABLE ROW LEVEL SECURITY;

-- Categories RLS
CREATE POLICY "Users can view own categories" ON public.categories FOR SELECT USING (is_owner(user_id));
CREATE POLICY "Users can create own categories" ON public.categories FOR INSERT WITH CHECK (is_owner(user_id));
CREATE POLICY "Users can update own categories" ON public.categories FOR UPDATE USING (is_owner(user_id));
CREATE POLICY "Users can delete own categories" ON public.categories FOR DELETE USING (is_owner(user_id));

-- Transactions RLS
CREATE POLICY "Users can view own transactions" ON public.transactions FOR SELECT USING (is_owner(user_id));
CREATE POLICY "Users can create own transactions" ON public.transactions FOR INSERT WITH CHECK (is_owner(user_id));
CREATE POLICY "Users can update own transactions" ON public.transactions FOR UPDATE USING (is_owner(user_id));
CREATE POLICY "Users can delete own transactions" ON public.transactions FOR DELETE USING (is_owner(user_id));

-- Borrow/Lend RLS
CREATE POLICY "Users can view own borrow_lend" ON public.borrow_lend FOR SELECT USING (is_owner(user_id));
CREATE POLICY "Users can create own borrow_lend" ON public.borrow_lend FOR INSERT WITH CHECK (is_owner(user_id));
CREATE POLICY "Users can update own borrow_lend" ON public.borrow_lend FOR UPDATE USING (is_owner(user_id));
CREATE POLICY "Users can delete own borrow_lend" ON public.borrow_lend FOR DELETE USING (is_owner(user_id));

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Triggers
CREATE TRIGGER update_transactions_updated_at BEFORE UPDATE ON public.transactions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_borrow_lend_updated_at BEFORE UPDATE ON public.borrow_lend FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
