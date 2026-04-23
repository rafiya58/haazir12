import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { TopBar } from "@/components/TopBar";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, ChevronRight, Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";

interface OrderRow {
  id: string; status: string; total: number; pickup_code: string; created_at: string;
  restaurants: { name: string; emoji: string | null } | null;
}

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-warning/15 text-warning",
  preparing: "bg-navy/10 text-navy",
  ready: "bg-forest text-primary-foreground",
  completed: "bg-muted text-muted-foreground",
  cancelled: "bg-destructive/10 text-destructive",
};

const MyOrders = () => {
  const { user } = useAuth();
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const { data } = await supabase
        .from("orders")
        .select("id,status,total,pickup_code,created_at,restaurants(name,emoji)")
        .eq("student_id", user.id)
        .order("created_at", { ascending: false });
      setOrders((data as unknown as OrderRow[]) ?? []);
      setLoading(false);
    };
    load();

    const channel = supabase
      .channel("my-orders")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `student_id=eq.${user.id}` },
        () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user]);

  return (
    <div className="min-h-screen bg-background">
      <TopBar />
      <section className="container max-w-2xl py-8">
        <h1 className="font-display text-2xl font-bold text-navy">My orders</h1>
        <p className="text-sm text-muted-foreground">Track your past and current pre-orders</p>

        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-forest" /></div>
        ) : orders.length === 0 ? (
          <Card className="mt-6 flex flex-col items-center p-10 text-center">
            <Receipt className="h-8 w-8 text-muted-foreground" />
            <p className="mt-3 text-sm text-muted-foreground">No orders yet.</p>
            <Button asChild variant="cta" size="sm" className="mt-4"><Link to="/">Order now</Link></Button>
          </Card>
        ) : (
          <div className="mt-6 space-y-3">
            {orders.map((o) => (
              <Link key={o.id} to={`/order/${o.id}`}>
                <Card className="flex items-center justify-between gap-3 p-4 transition-all hover:shadow-card">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent text-2xl">{o.restaurants?.emoji ?? "🍽️"}</div>
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-navy">{o.restaurants?.name ?? "Restaurant"}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(o.created_at).toLocaleString()} · #{o.pickup_code}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-right">
                      <Badge className={`${STATUS_COLORS[o.status] ?? ""} border-0 capitalize`}>{o.status}</Badge>
                      <p className="mt-1 text-sm font-bold text-forest">Rs {Number(o.total).toFixed(0)}</p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

export default MyOrders;
