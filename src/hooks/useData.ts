import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface Transaction {
  id: string;
  user_id: string;
  amount: number;
  type: "income" | "expense";
  category_id: string | null;
  date: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Category {
  id: string;
  user_id: string;
  name: string;
  type: "income" | "expense";
  created_at: string;
}

export interface BorrowLend {
  id: string;
  user_id: string;
  person_name: string;
  amount: number;
  type: "borrow" | "lend";
  date: string;
  notes: string | null;
  status: "pending" | "settled";
  created_at: string;
  updated_at: string;
}

export function useCategories() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("*")
        .order("name");
      if (error) throw error;
      return data as Category[];
    },
    enabled: !!user,
  });

  const addCategory = useMutation({
    mutationFn: async (cat: { name: string; type: "income" | "expense" }) => {
      const { error } = await supabase
        .from("categories")
        .insert({ ...cat, user_id: user!.id });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["categories"] }),
  });

  return { ...query, addCategory };
}

export function useTransactions(filters?: { month?: string; categoryId?: string }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["transactions", filters],
    queryFn: async () => {
      let q = supabase
        .from("transactions")
        .select("*, categories(name)")
        .order("date", { ascending: false });

      if (filters?.month) {
        const [year, month] = filters.month.split("-");
        const start = `${year}-${month}-01`;
        const endDate = new Date(parseInt(year), parseInt(month), 0);
        const end = `${year}-${month}-${String(endDate.getDate()).padStart(2, "0")}`;
        q = q.gte("date", start).lte("date", end);
      }

      if (filters?.categoryId) {
        q = q.eq("category_id", filters.categoryId);
      }

      const { data, error } = await q;
      if (error) throw error;
      return data as (Transaction & { categories: { name: string } | null })[];
    },
    enabled: !!user,
  });

  const addTransaction = useMutation({
    mutationFn: async (tx: Omit<Transaction, "id" | "user_id" | "created_at" | "updated_at">) => {
      const { error } = await supabase
        .from("transactions")
        .insert({ ...tx, user_id: user!.id });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["transactions"] }),
  });

  const updateTransaction = useMutation({
    mutationFn: async ({ id, ...tx }: Partial<Transaction> & { id: string }) => {
      const { error } = await supabase
        .from("transactions")
        .update(tx)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["transactions"] }),
  });

  const deleteTransaction = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("transactions")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["transactions"] }),
  });

  return { ...query, addTransaction, updateTransaction, deleteTransaction };
}

export function useBorrowLend() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["borrow_lend"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("borrow_lend")
        .select("*")
        .order("date", { ascending: false });
      if (error) throw error;
      return data as BorrowLend[];
    },
    enabled: !!user,
  });

  const addRecord = useMutation({
    mutationFn: async (record: Omit<BorrowLend, "id" | "user_id" | "created_at" | "updated_at">) => {
      const { error } = await supabase
        .from("borrow_lend")
        .insert({ ...record, user_id: user!.id });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["borrow_lend"] }),
  });

  const updateRecord = useMutation({
    mutationFn: async ({ id, ...record }: Partial<BorrowLend> & { id: string }) => {
      const { error } = await supabase
        .from("borrow_lend")
        .update(record)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["borrow_lend"] }),
  });

  const deleteRecord = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("borrow_lend")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["borrow_lend"] }),
  });

  return { ...query, addRecord, updateRecord, deleteRecord };
}
