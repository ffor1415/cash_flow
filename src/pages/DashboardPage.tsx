import { useMemo } from "react";
import { useTransactions } from "@/hooks/useData";
import { useBorrowLend } from "@/hooks/useData";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Wallet, HandCoins, HandHeart } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, AreaChart, Area } from "recharts";
import { format, subMonths } from "date-fns";
import { motion } from "framer-motion";

const CHART_COLORS = [
  "hsl(160, 84%, 39%)",
  "hsl(0, 72%, 51%)",
  "hsl(210, 90%, 55%)",
  "hsl(36, 95%, 55%)",
  "hsl(280, 60%, 55%)",
  "hsl(330, 70%, 50%)",
];

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.08 } },
};
const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4 } },
};

export default function DashboardPage() {
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

  const summaryCards = [
    { icon: TrendingUp, label: "Total Income", value: fmt(stats.income), colorClass: "stat-income", bgGradient: "from-emerald-500/10 to-emerald-500/5" },
    { icon: TrendingDown, label: "Total Expenses", value: fmt(stats.expense), colorClass: "stat-expense", bgGradient: "from-red-500/10 to-red-500/5" },
    { icon: Wallet, label: "Balance", value: fmt(stats.balance), colorClass: stats.balance >= 0 ? "stat-income" : "stat-expense", bgGradient: stats.balance >= 0 ? "from-emerald-500/10 to-emerald-500/5" : "from-red-500/10 to-red-500/5" },
    { icon: HandCoins, label: "To Give", value: fmt(borrowLendStats.toGive), colorClass: "stat-borrow", bgGradient: "from-blue-500/10 to-blue-500/5" },
    { icon: HandHeart, label: "To Receive", value: fmt(borrowLendStats.toReceive), colorClass: "stat-lend", bgGradient: "from-amber-500/10 to-amber-500/5" },
  ];

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-6">
      <motion.div variants={item}>
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="text-muted-foreground">Your financial overview</p>
      </motion.div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {summaryCards.map((card, i) => (
          <motion.div key={card.label} variants={item}>
            <Card className="glass-card group hover:scale-[1.02] transition-transform duration-200 overflow-hidden relative">
              <div className={`absolute inset-0 bg-gradient-to-br ${card.bgGradient} opacity-0 group-hover:opacity-100 transition-opacity duration-300`} />
              <CardContent className="pt-5 pb-4 px-5 relative">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-muted group-hover:shadow-md transition-shadow">
                    <card.icon className={`w-5 h-5 ${card.colorClass}`} />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">{card.label}</p>
                    <p className={`text-lg font-bold ${card.colorClass}`}>{card.value}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <motion.div variants={item}>
          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="text-base">Monthly Trends</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={monthlyData}>
                  <defs>
                    <linearGradient id="incomeGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(160, 84%, 39%)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(160, 84%, 39%)" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="expenseGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(0, 72%, 51%)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(0, 72%, 51%)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="month" fontSize={12} tickLine={false} stroke="hsl(var(--muted-foreground))" />
                  <YAxis fontSize={12} tickLine={false} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "12px",
                      boxShadow: "var(--shadow-card-hover)",
                    }}
                  />
                  <Area type="monotone" dataKey="income" stroke="hsl(160, 84%, 39%)" fill="url(#incomeGrad)" strokeWidth={2} />
                  <Area type="monotone" dataKey="expense" stroke="hsl(0, 72%, 51%)" fill="url(#expenseGrad)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div variants={item}>
          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="text-base">Expense by Category</CardTitle>
            </CardHeader>
            <CardContent>
              {categoryData.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-[280px] text-muted-foreground gap-2">
                  <Wallet className="w-10 h-10 opacity-30" />
                  <p>No expense data yet</p>
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
        </motion.div>
      </div>
    </motion.div>
  );
}
