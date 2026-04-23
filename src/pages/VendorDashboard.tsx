import { useEffect, useState } from "react";
import { TopBar } from "@/components/TopBar";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Loader2, ChefHat, Bell, CheckCircle2, X, BadgeCheck } from "lucide-react";
import { toast } from "sonner";

interface MenuItem { id: string; name: string; description: string | null; price: number; category: string; is_available: boolean; restaurant_id: string; }
interface OrderItem { id: string; item_name: string; quantity: number; unit_price: number; }
interface Order {
  id: string; status: string; total: number; pickup_code: string; notes: string | null; created_at: string;
  student_id: string;
  order_items: OrderItem[];
  profiles?: { full_name: string | null; email: string } | null;
}

const ACTIVE_STATUSES = ["pending", "preparing", "ready"];

const VendorDashboard = () => {
  const { restaurantId } = useAuth();
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [restaurantName, setRestaurantName] = useState("");
  const [loading, setLoading] = useState(true);
  const [verifyCode, setVerifyCode] = useState("");

  useEffect(() => {
    if (!restaurantId) { setLoading(false); return; }
    const load = async () => {
      const [{ data: r }, { data: m }, { data: o }] = await Promise.all([
        supabase.from("restaurants").select("name").eq("id", restaurantId).maybeSingle(),
        supabase.from("menu_items").select("*").eq("restaurant_id", restaurantId).order("category").order("name"),
        supabase.from("orders").select("*, order_items(*)").eq("restaurant_id", restaurantId).order("created_at", { ascending: false }),
      ]);
      setRestaurantName(r?.name ?? "Vendor");
      setMenu((m as MenuItem[]) ?? []);
      setOrders((o as unknown as Order[]) ?? []);
      setLoading(false);
    };
    load();

    const channel = supabase
      .channel(`vendor-${restaurantId}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "orders", filter: `restaurant_id=eq.${restaurantId}` },
        () => load())
      .on("postgres_changes",
        { event: "*", schema: "public", table: "order_items" },
        () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [restaurantId]);

  const toggleAvailable = async (item: MenuItem) => {
    const next = !item.is_available;
    setMenu((prev) => prev.map((m) => (m.id === item.id ? { ...m, is_available: next } : m)));
    const { error } = await supabase.from("menu_items").update({ is_available: next }).eq("id", item.id);
    if (error) {
      toast.error(error.message);
      setMenu((prev) => prev.map((m) => (m.id === item.id ? { ...m, is_available: !next } : m)));
    } else {
      toast.success(`${item.name} ${next ? "available" : "marked sold out"}`);
    }
  };

  const updatePrice = async (item: MenuItem, raw: string) => {
    const price = parseFloat(raw);
    if (isNaN(price) || price < 0) return;
    const { error } = await supabase.from("menu_items").update({ price }).eq("id", item.id);
    if (error) toast.error(error.message);
    else toast.success(`Price updated`);
  };

  const updateOrderStatus = async (id: string, status: "pending" | "preparing" | "ready" | "completed" | "cancelled") => {
    const { error } = await supabase.from("orders").update({ status }).eq("id", id);
    if (error) toast.error(error.message);
    else toast.success(`Order marked ${status}`);
  };

  const verify = (code: string) => {
    const match = orders.find((o) => o.pickup_code.toUpperCase() === code.trim().toUpperCase() && ACTIVE_STATUSES.includes(o.status));
    if (match) {
      updateOrderStatus(match.id, "completed");
      setVerifyCode("");
      toast.success(`Verified ${code} — marked picked up`);
    } else {
      toast.error("No active order with that code");
    }
  };

  if (!restaurantId) {
    return (
      <div className="min-h-screen bg-background">
        <TopBar />
        <p className="container py-20 text-center text-muted-foreground">No restaurant linked to this account.</p>
      </div>
    );
  }
  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <TopBar />
        <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-forest" /></div>
      </div>
    );
  }

  const active = orders.filter((o) => ACTIVE_STATUSES.includes(o.status));
  const past = orders.filter((o) => !ACTIVE_STATUSES.includes(o.status));

  return (
    <div className="min-h-screen bg-background">
      <TopBar />

      <section className="bg-gradient-hero py-6 text-primary-foreground">
        <div className="container">
          <Badge className="border-0 bg-forest text-primary-foreground hover:bg-forest">Vendor Dashboard</Badge>
          <h1 className="mt-2 font-display text-2xl font-bold sm:text-3xl">{restaurantName}</h1>
          <p className="text-sm text-primary-foreground/70">{active.length} active order{active.length !== 1 && "s"} · live</p>
        </div>
      </section>

      <section className="container py-6">
        <Tabs defaultValue="orders">
          <TabsList>
            <TabsTrigger value="orders">Live orders</TabsTrigger>
            <TabsTrigger value="menu">Menu manager</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
          </TabsList>

          <TabsContent value="orders" className="mt-5 space-y-4">
            <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-navy">Verify pickup code</p>
                <p className="text-xs text-muted-foreground">Enter the 6-character code shown on the student's screen</p>
              </div>
              <div className="flex gap-2">
                <Input value={verifyCode} onChange={(e) => setVerifyCode(e.target.value.toUpperCase())} placeholder="ABC123" maxLength={6} className="w-32 text-center font-mono uppercase tracking-widest" />
                <Button onClick={() => verify(verifyCode)} variant="cta"><BadgeCheck className="h-4 w-4" /> Verify</Button>
              </div>
            </Card>

            {active.length === 0 ? (
              <Card className="p-10 text-center text-sm text-muted-foreground">No active orders right now.</Card>
            ) : (
              <div className="grid gap-3">
                {active.map((o) => (
                  <Card key={o.id} className="p-4 shadow-card animate-fade-in">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-display text-lg font-bold text-navy">#{o.pickup_code}</p>
                          <Badge variant="outline" className="capitalize">{o.status}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">{new Date(o.created_at).toLocaleTimeString()}</p>
                      </div>
                      <p className="font-bold text-forest">Rs {Number(o.total).toFixed(0)}</p>
                    </div>
                    <ul className="mt-3 space-y-1 text-sm">
                      {o.order_items.map((it) => (
                        <li key={it.id} className="flex justify-between text-navy">
                          <span><span className="font-semibold">{it.quantity}×</span> {it.item_name}</span>
                          <span className="text-muted-foreground">Rs {(it.unit_price * it.quantity).toFixed(0)}</span>
                        </li>
                      ))}
                    </ul>
                    {o.notes && <p className="mt-2 rounded-md bg-muted p-2 text-xs italic text-muted-foreground">"{o.notes}"</p>}
                    <div className="mt-4 flex flex-wrap gap-2">
                      {o.status === "pending" && (
                        <Button onClick={() => updateOrderStatus(o.id, "preparing")} variant="cta" size="sm">
                          <ChefHat className="h-4 w-4" /> Start preparing
                        </Button>
                      )}
                      {o.status === "preparing" && (
                        <Button onClick={() => updateOrderStatus(o.id, "ready")} variant="cta" size="sm">
                          <Bell className="h-4 w-4" /> Mark ready
                        </Button>
                      )}
                      {o.status === "ready" && (
                        <Button onClick={() => updateOrderStatus(o.id, "completed")} variant="cta" size="sm">
                          <CheckCircle2 className="h-4 w-4" /> Picked up
                        </Button>
                      )}
                      <Button onClick={() => updateOrderStatus(o.id, "cancelled")} variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10 hover:text-destructive">
                        <X className="h-4 w-4" /> Cancel
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="menu" className="mt-5 space-y-3">
            {menu.map((item) => (
              <Card key={item.id} className="flex flex-wrap items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <p className={`font-semibold ${item.is_available ? "text-navy" : "text-muted-foreground line-through"}`}>{item.name}</p>
                  <p className="text-xs text-muted-foreground">{item.category}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Rs</span>
                  <Input type="number" defaultValue={Number(item.price)} min={0} step="1"
                    onBlur={(e) => updatePrice(item, e.target.value)}
                    className="w-24 h-9" />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">{item.is_available ? "Available" : "Sold out"}</span>
                  <Switch checked={item.is_available} onCheckedChange={() => toggleAvailable(item)} />
                </div>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="history" className="mt-5 space-y-3">
            {past.length === 0 ? (
              <Card className="p-10 text-center text-sm text-muted-foreground">No past orders yet.</Card>
            ) : past.map((o) => (
              <Card key={o.id} className="flex items-center justify-between p-4">
                <div>
                  <p className="font-semibold text-navy">#{o.pickup_code}</p>
                  <p className="text-xs text-muted-foreground">{new Date(o.created_at).toLocaleString()} · {o.order_items.length} item{o.order_items.length !== 1 && "s"}</p>
                </div>
                <div className="text-right">
                  <Badge variant="outline" className="capitalize">{o.status}</Badge>
                  <p className="mt-1 text-sm font-bold text-forest">Rs {Number(o.total).toFixed(0)}</p>
                </div>
              </Card>
            ))}
          </TabsContent>
        </Tabs>
      </section>
    </div>
  );
};

export default VendorDashboard;
