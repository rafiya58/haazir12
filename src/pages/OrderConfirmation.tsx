import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { TopBar } from "@/components/TopBar";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { QRCodeSVG } from "qrcode.react";
import { CheckCircle2, Clock, ChefHat, Bell, Loader2, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Order {
  id: string; status: string; total: number; pickup_code: string; notes: string | null; created_at: string; restaurant_id: string; pickup_time: string | null; service_fee: number;
}
interface OrderItem { id: string; item_name: string; quantity: number; unit_price: number; }
interface Restaurant { name: string; emoji: string | null; }

const STATUS_FLOW = [
  { key: "pending", label: "Received", icon: CheckCircle2 },
  { key: "preparing", label: "Preparing", icon: ChefHat },
  { key: "ready", label: "Ready for pickup", icon: Bell },
  { key: "completed", label: "Picked up", icon: CheckCircle2 },
];

const OrderConfirmation = () => {
  const { id } = useParams<{ id: string }>();
  const [order, setOrder] = useState<Order | null>(null);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const { data: o } = await supabase.from("orders").select("*").eq("id", id).maybeSingle();
      if (!o) { setLoading(false); return; }
      setOrder(o as Order);
      const [{ data: it }, { data: r }] = await Promise.all([
        supabase.from("order_items").select("*").eq("order_id", id),
        supabase.from("restaurants").select("name,emoji").eq("id", o.restaurant_id).maybeSingle(),
      ]);
      setItems((it as OrderItem[]) ?? []);
      setRestaurant((r as Restaurant) ?? null);
      setLoading(false);
    })();

    const channel = supabase
      .channel(`order-${id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "orders", filter: `id=eq.${id}` },
        (payload) => setOrder(payload.new as Order))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <TopBar />
        <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-forest" /></div>
      </div>
    );
  }
  if (!order) {
    return (
      <div className="min-h-screen bg-background">
        <TopBar />
        <p className="container py-20 text-center text-muted-foreground">Order not found.</p>
      </div>
    );
  }

  const currentIdx = STATUS_FLOW.findIndex((s) => s.key === order.status);
  const isCancelled = order.status === "cancelled";

  return (
    <div className="min-h-screen bg-background">
      <TopBar />

      <section className="bg-gradient-hero py-8 text-primary-foreground">
        <div className="container max-w-2xl">
          <Button asChild variant="ghost" size="sm" className="mb-3 text-primary-foreground/80 hover:bg-navy-light hover:text-primary-foreground">
            <Link to="/orders" className="gap-1.5"><ArrowLeft className="h-4 w-4" /> My orders</Link>
          </Button>
          <Badge className="border-0 bg-forest text-primary-foreground hover:bg-forest">Order confirmed</Badge>
          <h1 className="mt-2 font-display text-2xl font-bold sm:text-3xl">Show this code at pickup</h1>
          <p className="text-sm text-primary-foreground/70">{restaurant?.emoji} {restaurant?.name}</p>
        </div>
      </section>

      <section className="container max-w-2xl space-y-4 py-6">
        <Card className="flex flex-col items-center gap-4 p-6 text-center shadow-elevated">
          <div className="rounded-2xl bg-cream p-4">
            <QRCodeSVG value={order.pickup_code} size={160} bgColor="transparent" fgColor="hsl(201 100% 13%)" />
          </div>
          <div>
            <p className="text-xs uppercase tracking-widest text-muted-foreground">Pickup code</p>
            <p className="font-display text-4xl font-bold tracking-[0.3em] text-navy">{order.pickup_code}</p>
          </div>
        </Card>

        {!isCancelled ? (
          <Card className="p-5">
            <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status</p>
            <ol className="space-y-3">
              {STATUS_FLOW.map((s, idx) => {
                const reached = idx <= currentIdx;
                const isCurrent = idx === currentIdx;
                const Icon = s.icon;
                return (
                  <li key={s.key} className="flex items-center gap-3">
                    <div className={`flex h-8 w-8 items-center justify-center rounded-full ${
                      reached ? "bg-forest text-primary-foreground" : "bg-muted text-muted-foreground"
                    } ${isCurrent ? "animate-pulse-soft ring-2 ring-forest/30 ring-offset-2" : ""}`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <span className={`text-sm ${reached ? "font-semibold text-navy" : "text-muted-foreground"}`}>{s.label}</span>
                  </li>
                );
              })}
            </ol>
          </Card>
        ) : (
          <Card className="border-destructive/30 bg-destructive/5 p-5 text-sm text-destructive">
            This order was cancelled.
          </Card>
        )}

        <Card className="p-5">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Order summary</p>
          <ul className="space-y-2 text-sm">
            {items.map((i) => (
              <li key={i.id} className="flex justify-between">
                <span><span className="font-medium text-navy">{i.quantity}×</span> {i.item_name}</span>
                <span className="text-muted-foreground">Rs {(i.unit_price * i.quantity).toFixed(0)}</span>
              </li>
            ))}
          </ul>
          {order.notes && (
            <p className="mt-3 rounded-md bg-muted p-2 text-xs text-muted-foreground">"{order.notes}"</p>
          )}
          {order.service_fee > 0 && (
            <div className="mt-3 flex justify-between text-xs text-muted-foreground">
              <span>Service fee</span><span>Rs {Number(order.service_fee).toFixed(0)}</span>
            </div>
          )}
          <div className="mt-2 flex justify-between border-t pt-3 font-bold text-navy">
            <span>Total</span><span>Rs {Number(order.total).toFixed(0)}</span>
          </div>
        </Card>

        <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
          <Clock className="h-3 w-3" />
          {order.pickup_time
            ? `Pickup at ${new Date(order.pickup_time).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
            : "Estimated pickup in 8–12 minutes"}
        </p>
      </section>
    </div>
  );
};

export default OrderConfirmation;
