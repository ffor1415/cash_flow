import { useState, useMemo } from "react";
import { useTransactions, useCategories } from "@/hooks/useData";
import { generateStatementPDF } from "@/utils/generateStatement";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  FileText,
  TrendingUp,
  TrendingDown,
  Wallet,
  CalendarDays,
  Filter,
  Download,
} from "lucide-react";
import { format } from "date-fns";
import { motion } from "framer-motion";

export default function ReportsPage() {
  const { user } = useAuth();
  const today = new Date();
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

  const [fromDate, setFromDate] = useState(format(firstOfMonth, "yyyy-MM-dd"));
  const [toDate, setToDate] = useState(format(today, "yyyy-MM-dd"));
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState<"all" | "income" | "expense">("all");

  // Fetch all transactions (no server-side filter so we can compute running balance)
  const { data: allTransactions, isLoading } = useTransactions();
  const { data: categories } = useCategories();

  const fmt = (n: number) =>
    new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(n);

  // Filter & sort
  const filtered = useMemo(() => {
    if (!allTransactions) return [];

    return allTransactions
      .filter((tx) => {
        if (tx.date < fromDate || tx.date > toDate) return false;
        if (categoryFilter !== "all" && tx.category_id !== categoryFilter) return false;
        if (typeFilter !== "all" && tx.type !== typeFilter) return false;
        return true;
      })
      .sort((a, b) => a.date.localeCompare(b.date) || a.created_at.localeCompare(b.created_at));
  }, [allTransactions, fromDate, toDate, categoryFilter, typeFilter]);

  // Running balance & summary
  const { rows, totalIncome, totalExpense } = useMemo(() => {
    let balance = 0;
    let income = 0;
    let expense = 0;
    const rows = filtered.map((tx) => {
      const amt = Number(tx.amount);
      if (tx.type === "income") {
        balance += amt;
        income += amt;
      } else {
        balance -= amt;
        expense += amt;
      }
      return { ...tx, runningBalance: balance };
    });
    return { rows, totalIncome: income, totalExpense: expense };
  }, [filtered]);

  const netBalance = totalIncome - totalExpense;

  const handleExportCSV = () => {
    if (!rows.length) return;
    const header = "Date,Description,Category,Type,Amount,Balance\n";
    const csv = rows
      .map(
        (r) =>
          `${r.date},"${r.notes || "—"}","${r.categories?.name || "—"}",${r.type},${r.type === "income" ? "" : "-"}${r.amount},${r.runningBalance.toFixed(2)}`
      )
      .join("\n");
    const blob = new Blob([header + csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `report_${fromDate}_to_${toDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadStatement = async () => {
    if (!allTransactions) return;
    // For statement: use ALL transactions in date range (no category/type filter)
    const statementTx = allTransactions
      .filter((tx) => tx.date >= fromDate && tx.date <= toDate)
      .sort((a, b) => a.date.localeCompare(b.date) || a.created_at.localeCompare(b.created_at));

    let balance = 0;
    let income = 0;
    let expense = 0;
    const mapped = statementTx.map((tx) => {
      const amt = Number(tx.amount);
      if (tx.type === "income") { balance += amt; income += amt; }
      else { balance -= amt; expense += amt; }
      return {
        date: tx.date,
        notes: tx.notes,
        categoryName: tx.categories?.name || null,
        type: tx.type,
        amount: amt,
        runningBalance: balance,
      };
    });

  await generateStatementPDF({
      fromDate,
      toDate,
      transactions: mapped,
      totalIncome: income,
      totalExpense: expense,
      netBalance: income - expense,
      userEmail: user?.email || "No Email", // ✅ ADD THIS
    });
};
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <FileText className="w-6 h-6 text-primary" />
            Transaction Report
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Analyze your finances like a bank statement
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleDownloadStatement}>
            <Download className="w-4 h-4 mr-1" />
            Download Statement
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportCSV} disabled={!rows.length}>
            <Download className="w-4 h-4 mr-1" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card className="glass-card">
        <CardContent className="pt-5 pb-5">
          <div className="flex items-center gap-2 mb-4">
            <Filter className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium text-foreground">Filters</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">From Date</Label>
              <Input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">To Date</Label>
              <Input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Category</Label>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All Categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {categories?.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Transaction Type</Label>
              <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as any)}>
                <SelectTrigger>
                  <SelectValue placeholder="All Types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All (Income & Expense)</SelectItem>
                  <SelectItem value="income">Income Only</SelectItem>
                  <SelectItem value="expense">Expense Only</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0 }}>
          <Card className="glass-card border-l-4" style={{ borderLeftColor: "hsl(var(--income))" }}>
            <CardContent className="pt-5 pb-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">Total Income</p>
                  <p className="text-2xl font-bold stat-income mt-1">{fmt(totalIncome)}</p>
                </div>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "hsl(var(--income) / 0.12)" }}>
                  <TrendingUp className="w-5 h-5 stat-income" />
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
          <Card className="glass-card border-l-4" style={{ borderLeftColor: "hsl(var(--expense))" }}>
            <CardContent className="pt-5 pb-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">Total Expense</p>
                  <p className="text-2xl font-bold stat-expense mt-1">{fmt(totalExpense)}</p>
                </div>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "hsl(var(--expense) / 0.12)" }}>
                  <TrendingDown className="w-5 h-5 stat-expense" />
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <Card className="glass-card border-l-4 border-l-primary">
            <CardContent className="pt-5 pb-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">Net Balance</p>
                  <p className={`text-2xl font-bold mt-1 ${netBalance >= 0 ? "stat-income" : "stat-expense"}`}>
                    {fmt(netBalance)}
                  </p>
                </div>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-primary/10">
                  <Wallet className="w-5 h-5 text-primary" />
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Statement Header */}
      <Card className="glass-card overflow-hidden">
        <div className="gradient-primary px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div className="flex items-center gap-2 text-primary-foreground">
            <CalendarDays className="w-4 h-4" />
            <span className="text-sm font-medium">
              Statement Period: {format(new Date(fromDate), "dd MMM yyyy")} — {format(new Date(toDate), "dd MMM yyyy")}
            </span>
          </div>
          <span className="text-xs text-primary-foreground/70">
            {rows.length} transaction{rows.length !== 1 ? "s" : ""}
          </span>
        </div>

        <Separator />

        {/* Statement Table */}
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead className="font-semibold text-xs uppercase tracking-wider w-[110px]">Date</TableHead>
                <TableHead className="font-semibold text-xs uppercase tracking-wider">Description</TableHead>
                <TableHead className="font-semibold text-xs uppercase tracking-wider w-[120px]">Category</TableHead>
                <TableHead className="font-semibold text-xs uppercase tracking-wider w-[90px]">Type</TableHead>
                <TableHead className="font-semibold text-xs uppercase tracking-wider text-right w-[110px]">Amount</TableHead>
                <TableHead className="font-semibold text-xs uppercase tracking-wider text-right w-[110px]">Balance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                    Loading transactions...
                  </TableCell>
                </TableRow>
              ) : !rows.length ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                    No transactions found for the selected filters.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((tx, i) => (
                  <TableRow key={tx.id} className="group hover:bg-muted/20 transition-colors">
                    <TableCell className="text-sm font-mono whitespace-nowrap">
                      {format(new Date(tx.date), "dd MMM yyyy")}
                    </TableCell>
                    <TableCell className="text-sm max-w-[200px] truncate">
                      {tx.notes || "—"}
                    </TableCell>
                    <TableCell>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                        {tx.categories?.name || "Uncategorized"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={tx.type === "income" ? "default" : "destructive"}
                        className="text-[10px] uppercase tracking-wider font-semibold"
                      >
                        {tx.type}
                      </Badge>
                    </TableCell>
                    <TableCell
                      className={`text-right font-semibold font-mono text-sm ${
                        tx.type === "income" ? "stat-income" : "stat-expense"
                      }`}
                    >
                      {tx.type === "income" ? "+" : "−"} {fmt(Number(tx.amount))}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm font-medium">
                      {fmt(tx.runningBalance)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Statement Footer */}
        {rows.length > 0 && (
          <>
            <Separator />
            <div className="px-6 py-4 bg-muted/20 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-sm">
              <div className="flex items-center gap-6">
                <span className="text-muted-foreground">
                  Credits: <strong className="stat-income">{fmt(totalIncome)}</strong>
                </span>
                <span className="text-muted-foreground">
                  Debits: <strong className="stat-expense">{fmt(totalExpense)}</strong>
                </span>
              </div>
              <span className="font-semibold">
                Closing Balance:{" "}
                <span className={netBalance >= 0 ? "stat-income" : "stat-expense"}>
                  {fmt(netBalance)}
                </span>
              </span>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
