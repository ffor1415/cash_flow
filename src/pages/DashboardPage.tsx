import { useMemo, useState } from "react";
import { useTransactions } from "@/hooks/useData";
import { useBorrowLend } from "@/hooks/useData";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Wallet, ArrowUpDown, HandCoins, HandHeart } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format, subMonths, startOfMonth } from "date-fns";

const CHART_COLORS = [
  "hsl(160, 84%, 39%)",
  "hsl(0, 72%, 51%)",
  "hsl(210, 90%, 55%)",
  "hsl(36, 95%, 55%)",
  "hsl(280, 60%, 55%)",
  "hsl(330, 70%, 50%)",
];

export default function DashboardPage() {
  const currentMonth = format(new Date(), "yyyy-MM");
  const { data: transactions } = useTransactions();
  const { data: borrowLendData } = useBorrowLend();

  const stats = useMemo(() => {
    if (!transactions) return { income: 0, expense: 0, balance: 0 };
    const income = transactions.filter((t) => t.type === "income").reduce((s, t) => s + Number(t.amount), 0);
    const expense = transactions.filter((t) => t.type === "expense").reduce((s, t) => s + Number(t.amount), 0);
    return { income, expense, balance: income - expense };
  }, [transactions]);

  const borrowLendStats = useMemo(() => {
    if (!borrowLendData) return { toGive: 0, toReceive: 0 };
    const toGive = borrowLendData.filter((r) => r.type === "borrow" && r.status === "pending").reduce((s, r) => s + Number(r.amount), 0);
    const toReceive = borrowLendData.filter((r) => r.type === "lend" && r.status === "pending").reduce((s, r) => s + Number(r.amount), 0);
    return { toGive, toReceive };
  }, [borrowLendData]);

  const monthlyData = useMemo(() => {
    if (!transactions) return [];
    const months: Record<string, { month: string; income: number; expense: number }> = {};
    for (let i = 5; i >= 0; i--) {
      const d = subMonths(new Date(), i);
      const key = format(d, "yyyy-MM");
      months[key] = { month: format(d, "MMM"), income: 0, expense: 0 };
    }
    transactions.forEach((t) => {
      const key = t.date.substring(0, 7);
      if (months[key]) {
        if (t.type === "income") months[key].income += Number(t.amount);
        else months[key].expense += Number(t.amount);
      }
    });
    return Object.values(months);
  }, [transactions]);

  const categoryData = useMemo(() => {
    if (!transactions) return [];
    const cats: Record<string, number> = {};
    transactions
      .filter((t) => t.type === "expense")
      .forEach((t) => {
        const name = t.categories?.name || "Uncategorized";
        cats[name] = (cats[name] || 0) + Number(t.amount);
      });
    return Object.entries(cats)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
  }, [transactions]);

  const fmt = (n: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "INR" }).format(n);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="text-muted-foreground">Your financial overview</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <SummaryCard icon={TrendingUp} label="Total Income" value={fmt(stats.income)} className="stat-income" />
        <SummaryCard icon={TrendingDown} label="Total Expenses" value={fmt(stats.expense)} className="stat-expense" />
        <SummaryCard icon={Wallet} label="Balance" value={fmt(stats.balance)} className={stats.balance >= 0 ? "stat-income" : "stat-expense"} />
        <SummaryCard icon={HandCoins} label="To Give" value={fmt(borrowLendStats.toGive)} className="stat-borrow" />
        <SummaryCard icon={HandHeart} label="To Receive" value={fmt(borrowLendStats.toReceive)} className="stat-lend" />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="text-base">Monthly Trends</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(150, 10%, 90%)" />
                <XAxis dataKey="month" fontSize={12} tickLine={false} />
                <YAxis fontSize={12} tickLine={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(0, 0%, 100%)",
                    border: "1px solid hsl(150, 10%, 90%)",
                    borderRadius: "8px",
                  }}
                />
                <Bar dataKey="income" fill="hsl(160, 84%, 39%)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="expense" fill="hsl(0, 72%, 51%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="text-base">Expense by Category</CardTitle>
          </CardHeader>
          <CardContent>
            {categoryData.length === 0 ? (
              <div className="flex items-center justify-center h-[280px] text-muted-foreground">
                No expense data yet
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={categoryData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={4}
                    dataKey="value"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    labelLine={false}
                    fontSize={11}
                  >
                    {categoryData.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number) => fmt(v)} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  className,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <Card className="glass-card">
      <CardContent className="pt-5 pb-4 px-5">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-muted">
            <Icon className={`w-5 h-5 ${className}`} />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className={`text-lg font-bold ${className}`}>{value}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
