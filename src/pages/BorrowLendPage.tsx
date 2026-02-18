import { useState } from "react";
import { useBorrowLend, type BorrowLend } from "@/hooks/useData";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, Check } from "lucide-react";
import { format } from "date-fns";

export default function BorrowLendPage() {
  const { data: records, isLoading, addRecord, updateRecord, deleteRecord } = useBorrowLend();
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<BorrowLend | null>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const payload = {
      person_name: form.get("person_name") as string,
      amount: parseFloat(form.get("amount") as string),
      type: form.get("type") as "borrow" | "lend",
      date: form.get("date") as string,
      notes: (form.get("notes") as string) || null,
      status: (form.get("status") as "pending" | "settled") || "pending",
    };

    try {
      if (editing) {
        await updateRecord.mutateAsync({ id: editing.id, ...payload });
        toast({ title: "Record updated" });
      } else {
        await addRecord.mutateAsync(payload);
        toast({ title: "Record added" });
      }
      setDialogOpen(false);
      setEditing(null);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const handleSettle = async (id: string) => {
    try {
      await updateRecord.mutateAsync({ id, status: "settled" });
      toast({ title: "Marked as settled" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteRecord.mutateAsync(id);
      toast({ title: "Record deleted" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const fmt = (n: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "INR" }).format(n);

  const pendingBorrow = records?.filter((r) => r.type === "borrow" && r.status === "pending") || [];
  const pendingLend = records?.filter((r) => r.type === "lend" && r.status === "pending") || [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Borrow & Lend</h1>
          <p className="text-muted-foreground">Track money given and received</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) setEditing(null); }}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="w-4 h-4 mr-1" /> New Record
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editing ? "Edit Record" : "New Record"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label>Person Name</Label>
                <Input name="person_name" defaultValue={editing?.person_name || ""} required />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Amount</Label>
                  <Input name="amount" type="number" step="0.01" min="0.01" defaultValue={editing?.amount || ""} required />
                </div>
                <div className="space-y-2">
                  <Label>Type</Label>
                  <Select name="type" defaultValue={editing?.type || "lend"}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="borrow">Borrowed (I owe)</SelectItem>
                      <SelectItem value="lend">Lent (They owe me)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Date</Label>
                  <Input name="date" type="date" defaultValue={editing?.date || format(new Date(), "yyyy-MM-dd")} required />
                </div>
                {editing && (
                  <div className="space-y-2">
                    <Label>Status</Label>
                    <Select name="status" defaultValue={editing.status}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="settled">Settled</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea name="notes" defaultValue={editing?.notes || ""} rows={2} />
              </div>
              <Button type="submit" className="w-full">
                {editing ? "Update" : "Add"} Record
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card className="glass-card border-l-4" style={{ borderLeftColor: "hsl(210, 90%, 55%)" }}>
          <CardContent className="pt-4 pb-4">
            <p className="text-sm text-muted-foreground">I Need to Give</p>
            <p className="text-xl font-bold stat-borrow">{fmt(pendingBorrow.reduce((s, r) => s + Number(r.amount), 0))}</p>
            <p className="text-xs text-muted-foreground">{pendingBorrow.length} pending</p>
          </CardContent>
        </Card>
        <Card className="glass-card border-l-4" style={{ borderLeftColor: "hsl(36, 95%, 55%)" }}>
          <CardContent className="pt-4 pb-4">
            <p className="text-sm text-muted-foreground">I Need to Receive</p>
            <p className="text-xl font-bold stat-lend">{fmt(pendingLend.reduce((s, r) => s + Number(r.amount), 0))}</p>
            <p className="text-xs text-muted-foreground">{pendingLend.length} pending</p>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      <Card className="glass-card overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Person</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Notes</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="w-[100px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Loading...</TableCell>
                </TableRow>
              ) : !records?.length ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No records yet</TableCell>
                </TableRow>
              ) : (
                records.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.person_name}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={r.type === "borrow" ? "stat-borrow border-borrow" : "stat-lend border-lend"}>
                        {r.type === "borrow" ? "Borrowed" : "Lent"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">{format(new Date(r.date), "MMM d, yyyy")}</TableCell>
                    <TableCell className="text-sm text-muted-foreground truncate max-w-[150px]">{r.notes || "—"}</TableCell>
                    <TableCell>
                      <Badge variant={r.status === "settled" ? "default" : "secondary"}>
                        {r.status}
                      </Badge>
                    </TableCell>
                    <TableCell className={`text-right font-medium ${r.type === "borrow" ? "stat-borrow" : "stat-lend"}`}>
                      {fmt(Number(r.amount))}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {r.status === "pending" && (
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-income" onClick={() => handleSettle(r.id)}>
                            <Check className="w-3.5 h-3.5" />
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditing(r); setDialogOpen(true); }}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(r.id)}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}
