import { useEffect, useMemo, useState } from "react";
import { TopBar } from "@/components/TopBar";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, TrendingUp, ShoppingBag, DollarSign, Building2 } from "lucide-react";

interface OrderRow {
  id: string; status: string; total: number; created_at: string; restaurant_id: string;
  restaurants: { name: string; emoji: string | null } | null;
}

const AdminDashboard = () => {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from("orders")
        .select("id,status,total,created_at,restaurant_id,restaurants(name,emoji)")
        .order("created_at", { ascending: false });
      setOrders((data as unknown as OrderRow[]) ?? []);
      setLoading(false);
    };
    load();
    const channel = supabase
      .channel("admin-orders")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const stats = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const todayOrders = orders.filter((o) => new Date(o.created_at) >= today);
    const revenue = todayOrders.filter((o) => o.status !== "cancelled").reduce((s, o) => s + Number(o.total), 0);
    const byVendor = new Map<string, { name: string; emoji: string | null; orders: number; revenue: number }>();
    todayOrders.forEach((o) => {
      const key = o.restaurant_id;
      const existing = byVendor.get(key) ?? {
        name: o.restaurants?.name ?? "Unknown", emoji: o.restaurants?.emoji ?? "🍽️", orders: 0, revenue: 0
      };
      existing.orders += 1;
      if (o.status !== "cancelled") existing.revenue += Number(o.total);
      byVendor.set(key, existing);
    });
    return {
      todayCount: todayOrders.length,
      revenue,
      activeNow: orders.filter((o) => ["pending", "preparing", "ready"].includes(o.status)).length,
      byVendor: Array.from(byVendor.values()).sort((a, b) => b.revenue - a.revenue),
    };
  }, [orders]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <TopBar />
        <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-forest" /></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <TopBar />
      <section className="bg-gradient-hero py-6 text-primary-foreground">
        <div className="container">
          <Badge className="border-0 bg-forest text-primary-foreground hover:bg-forest">Haazir Admin</Badge>
          <h1 className="mt-2 font-display text-2xl font-bold sm:text-3xl">Today's overview</h1>
          <p className="text-sm text-primary-foreground/70">Live transactions across all campus vendors</p>
        </div>
      </section>

      <section className="container space-y-6 py-6">
        <div className="grid gap-3 sm:grid-cols-3">
          <StatCard icon={ShoppingBag} label="Orders today" value={stats.todayCount.toString()} />
          <StatCard icon={DollarSign} label="Revenue today" value={`Rs ${stats.revenue.toFixed(0)}`} />
          <StatCard icon={TrendingUp} label="Active right now" value={stats.activeNow.toString()} highlight />
        </div>

        <Card className="p-5">
          <h2 className="mb-4 flex items-center gap-2 font-display text-lg font-bold text-navy">
            <Building2 className="h-5 w-5 text-forest" /> By vendor (today)
          </h2>
          {stats.byVendor.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No orders today yet.</p>
          ) : (
            <ul className="space-y-2">
              {stats.byVendor.map((v) => (
                <li key={v.name} className="flex items-center justify-between rounded-lg bg-muted/40 p-3">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{v.emoji}</span>
                    <div>
                      <p className="font-semibold text-navy">{v.name}</p>
                      <p className="text-xs text-muted-foreground">{v.orders} order{v.orders !== 1 && "s"}</p>
                    </div>
                  </div>
                  <p className="font-bold text-forest">Rs {v.revenue.toFixed(0)}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-5">
          <h2 className="mb-4 font-display text-lg font-bold text-navy">Recent activity</h2>
          <ul className="divide-y">
            {orders.slice(0, 15).map((o) => (
              <li key={o.id} className="flex items-center justify-between py-2 text-sm">
                <div className="flex items-center gap-2">
                  <span>{o.restaurants?.emoji}</span>
                  <span className="font-medium text-navy">{o.restaurants?.name}</span>
                  <Badge variant="outline" className="capitalize text-[10px]">{o.status}</Badge>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <span className="text-muted-foreground">{new Date(o.created_at).toLocaleTimeString()}</span>
                  <span className="font-bold text-forest">Rs {Number(o.total).toFixed(0)}</span>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </section>
    </div>
  );
};

const StatCard = ({ icon: Icon, label, value, highlight = false }: { icon: any; label: string; value: string; highlight?: boolean }) => (
  <Card className={`p-5 ${highlight ? "bg-gradient-cta text-primary-foreground" : ""}`}>
    <div className="flex items-center justify-between">
      <p className={`text-xs uppercase tracking-wider ${highlight ? "text-primary-foreground/80" : "text-muted-foreground"}`}>{label}</p>
      <Icon className={`h-4 w-4 ${highlight ? "text-primary-foreground/80" : "text-forest"}`} />
    </div>
    <p className={`mt-2 font-display text-3xl font-bold ${highlight ? "text-primary-foreground" : "text-navy"}`}>{value}</p>
  </Card>
);

export default AdminDashboard;
