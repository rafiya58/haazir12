import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { TopBar } from "@/components/TopBar";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, TrendingUp, ShoppingBag, DollarSign, Building2, UserPlus, type LucideIcon } from "lucide-react";
import { toast } from "sonner";

interface OrderRow {
  id: string; status: string; total: number; created_at: string; restaurant_id: string;
  payment_proof_url: string | null; payment_status: "pending" | "paid" | "failed";
  restaurants: { name: string; emoji: string | null; university_id: string } | null;
}

interface Campus {
  id: string;
  name: string;
  email_domain: string;
  location: string | null;
  contact_email: string | null;
}

const AdminDashboard = () => {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [campuses, setCampuses] = useState<Campus[]>([]);
  const [loading, setLoading] = useState(true);
  const [campusName, setCampusName] = useState("");
  const [campusDomain, setCampusDomain] = useState("");
  const [campusLocation, setCampusLocation] = useState("");
  const [campusContactEmail, setCampusContactEmail] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [inviting, setInviting] = useState(false);

  const inviteCampusAdmin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setInviting(true);
    try {
      const { data, error } = await supabase.functions.invoke("invite-campus-admin", {
        body: {
          campus_name: campusName.trim(),
          email_domain: campusDomain.trim().toLowerCase(),
          location: campusLocation.trim(),
          contact_email: campusContactEmail.trim().toLowerCase(),
          admin_email: adminEmail.trim().toLowerCase(),
        },
      });
      if (error) {
        toast.error(error.message);
        return;
      }
      if (typeof data?.campus_id !== "string") {
        toast.error("The campus was created, but the invitation response was incomplete.");
        return;
      }
      const invitedEmail = adminEmail.trim().toLowerCase();
      setCampusName("");
      setCampusDomain("");
      setCampusLocation("");
      setCampusContactEmail("");
      setAdminEmail("");
      toast.success(`Campus onboarded. Invitation email sent to ${invitedEmail}.`);
      await loadDashboard();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to onboard the campus or generate its admin invitation.");
    } finally {
      setInviting(false);
    }
  };

  const loadDashboard = useCallback(async () => {
      const [{ data: orderData, error: orderError }, { data: campusData, error: campusError }] = await Promise.all([
        supabase
        .from("orders")
        .select("id,status,total,created_at,restaurant_id,payment_proof_url,payment_status,restaurants(name,emoji,university_id)")
        .order("created_at", { ascending: false }),
        supabase.from("universities").select("id,name,email_domain,location,contact_email").order("name"),
      ]);
      if (orderError || campusError) {
        toast.error(orderError?.message ?? campusError?.message ?? "Unable to load platform analytics.");
        setOrders([]);
        setCampuses([]);
        setLoading(false);
        return;
      }
      setOrders((orderData as unknown as OrderRow[]) ?? []);
      setCampuses(campusData ?? []);
      setLoading(false);
  }, []);

  useEffect(() => {
    void loadDashboard();
    const channel = supabase
      .channel("admin-orders")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => void loadDashboard())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [loadDashboard]);

  const stats = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const todayOrders = orders.filter((o) => new Date(o.created_at) >= today);
    const revenue = todayOrders.filter((o) => o.status !== "cancelled").reduce((s, o) => s + Number(o.total), 0);
    const byCampus = new Map(campuses.map((campus) => [campus.id, {
      id: campus.id, name: campus.name, orders: 0, revenue: 0,
    }]));
    orders.forEach((o) => {
      const campusId = o.restaurants?.university_id;
      if (!campusId) return;
      const existing = byCampus.get(campusId);
      if (!existing) return;
      existing.orders += 1;
      if (o.status !== "cancelled") existing.revenue += Number(o.total);
    });
    return {
      todayCount: todayOrders.length,
      revenue,
      activeNow: orders.filter((o) => ["pending", "preparing", "ready"].includes(o.status)).length,
      byCampus: Array.from(byCampus.values()).sort((a, b) => b.revenue - a.revenue),
    };
  }, [orders, campuses]);

  const needsAttention = orders.filter((order) => ["pending", "failed"].includes(order.payment_status));
  const updatePaymentStatus = async (orderId: string, status: "paid" | "failed") => {
    const { error } = await supabase.rpc("set_order_payment_status", {
      _order_id: orderId,
      _payment_status: status,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`Payment marked ${status}.`);
    await loadDashboard();
  };

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
          <Badge className="border-0 bg-forest text-primary-foreground hover:bg-forest">Platform admin</Badge>
          <h1 className="mt-2 font-display text-2xl font-bold sm:text-3xl">Platform overview</h1>
          <p className="text-sm text-primary-foreground/70">Campus performance, onboarding, and payment attention</p>
        </div>
      </section>

      <section className="container space-y-6 py-6">
        <Card className="p-5">
          <h2 className="mb-1 flex items-center gap-2 font-display text-lg font-bold text-navy">
            <UserPlus className="h-5 w-5 text-forest" /> Onboard a campus
          </h2>
          <p className="mb-4 text-sm text-muted-foreground">
            Add the campus details and send an email invitation to its administrator.
          </p>
          <form onSubmit={inviteCampusAdmin} className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="campus-name">Campus name</Label>
              <Input
                id="campus-name"
                required
                maxLength={100}
                value={campusName}
                onChange={(event) => setCampusName(event.target.value)}
                placeholder="Example University"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="campus-domain">Student email domain</Label>
              <Input
                id="campus-domain"
                required
                maxLength={255}
                value={campusDomain}
                onChange={(event) => setCampusDomain(event.target.value)}
                placeholder="students.example.edu"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="campus-location">Location</Label>
              <Input
                id="campus-location"
                maxLength={200}
                value={campusLocation}
                onChange={(event) => setCampusLocation(event.target.value)}
                placeholder="City, country"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="campus-contact-email">Campus contact email</Label>
              <Input
                id="campus-contact-email"
                type="email"
                maxLength={255}
                value={campusContactEmail}
                onChange={(event) => setCampusContactEmail(event.target.value)}
                placeholder="contact@example.edu"
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="campus-admin-email">Campus admin email (invitation is restricted to this email)</Label>
              <Input
                id="campus-admin-email"
                type="email"
                autoComplete="email"
                required
                maxLength={255}
                value={adminEmail}
                onChange={(event) => setAdminEmail(event.target.value)}
                placeholder="admin@example.edu"
              />
            </div>
            <Button type="submit" variant="cta" disabled={inviting} className="sm:col-span-2 sm:justify-self-start">
              {inviting ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
              Onboard campus & send invitation
            </Button>
          </form>
        </Card>

        <div className="grid gap-3 sm:grid-cols-3">
          <StatCard icon={ShoppingBag} label="Orders today" value={stats.todayCount.toString()} />
          <StatCard icon={DollarSign} label="Revenue today" value={`Rs ${stats.revenue.toFixed(0)}`} />
          <StatCard icon={TrendingUp} label="Active right now" value={stats.activeNow.toString()} highlight />
        </div>

        <Card className="p-5">
          <h2 className="mb-4 flex items-center gap-2 font-display text-lg font-bold text-navy">
            <Building2 className="h-5 w-5 text-forest" /> Campus performance (all time)
          </h2>
          {stats.byCampus.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No campuses have been onboarded yet.</p>
          ) : (
            <ul className="space-y-2">
              {stats.byCampus.map((campus) => (
                <li key={campus.id} className="flex items-center justify-between rounded-lg bg-muted/40 p-3">
                  <div className="flex items-center gap-3">
                    <div>
                      <p className="font-semibold text-navy">{campus.name}</p>
                      <p className="text-xs text-muted-foreground">{campus.orders} order{campus.orders !== 1 && "s"}</p>
                    </div>
                  </div>
                  <p className="font-bold text-forest">Rs {campus.revenue.toFixed(0)}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-5">
          <h2 className="mb-1 font-display text-lg font-bold text-navy">Needs attention</h2>
          <p className="mb-4 text-sm text-muted-foreground">Payments from all campuses that are pending or have failed.</p>
          {needsAttention.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No payments need attention.</p>
          ) : (
            <ul className="divide-y">
              {needsAttention.map((order) => (
                <li key={order.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div>
                    <p className="font-medium text-navy">{order.restaurants?.name ?? "Unknown vendor"}</p>
                    <p className="text-xs text-muted-foreground">
                      {campuses.find((campus) => campus.id === order.restaurants?.university_id)?.name ?? "Unknown campus"}
                      {" · "}{new Date(order.created_at).toLocaleString()}
                    </p>
                    <p className="text-sm font-semibold text-forest">Rs {Number(order.total).toFixed(0)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={order.payment_status === "failed" ? "destructive" : "outline"} className="capitalize">
                      {order.payment_status}
                    </Badge>
                    {order.payment_proof_url && (
                      <Button asChild size="sm" variant="outline">
                        <a href={order.payment_proof_url} target="_blank" rel="noopener noreferrer">Receipt</a>
                      </Button>
                    )}
                    <Button size="sm" variant="outline" onClick={() => void updatePaymentStatus(order.id, "failed")}>
                      Mark failed
                    </Button>
                    <Button size="sm" variant="cta" onClick={() => void updatePaymentStatus(order.id, "paid")}>
                      Mark paid
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-5">
          <h2 className="mb-4 font-display text-lg font-bold text-navy">Recent activity</h2>
          <ul className="divide-y">
            {orders.slice(0, 15).map((o) => (
              <li key={o.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                <div className="flex items-center gap-2">
                  <span>{o.restaurants?.emoji}</span>
                  <span className="font-medium text-navy">{o.restaurants?.name}</span>
                  <Badge variant="outline" className="capitalize text-[10px]">{o.status}</Badge>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  {o.payment_proof_url && (
                    <a href={o.payment_proof_url} target="_blank" rel="noopener noreferrer" title="View payment receipt">
                      <img src={o.payment_proof_url} alt="receipt" className="h-8 w-8 rounded object-cover ring-1 ring-border hover:ring-forest" />
                    </a>
                  )}
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

const StatCard = ({ icon: Icon, label, value, highlight = false }: { icon: LucideIcon; label: string; value: string; highlight?: boolean }) => (
  <Card className={`p-5 ${highlight ? "bg-gradient-cta text-primary-foreground" : ""}`}>
    <div className="flex items-center justify-between">
      <p className={`text-xs uppercase tracking-wider ${highlight ? "text-primary-foreground/80" : "text-muted-foreground"}`}>{label}</p>
      <Icon className={`h-4 w-4 ${highlight ? "text-primary-foreground/80" : "text-forest"}`} />
    </div>
    <p className={`mt-2 font-display text-3xl font-bold ${highlight ? "text-primary-foreground" : "text-navy"}`}>{value}</p>
  </Card>
);

export default AdminDashboard;
