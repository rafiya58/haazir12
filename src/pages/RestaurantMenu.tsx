import { useEffect, useMemo, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { TopBar } from "@/components/TopBar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useCart } from "@/store/cart";
import { useAuth } from "@/context/AuthContext";
import { ArrowLeft, Loader2, Plus, ShoppingBag } from "lucide-react";
import { toast } from "sonner";
import gyroverseLogo from "@/assets/gyroverse-logo.jpeg";

interface Restaurant {
  id: string; name: string; slug: string; emoji: string | null; cuisine: string | null; is_open: boolean;
}
interface MenuItem {
  id: string; name: string; description: string | null; image_url: string | null; price: number; category: string; is_available: boolean; restaurant_id: string;
}

const RestaurantMenu = () => {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { studentUniversityIds } = useAuth();
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const cart = useCart();
  const cartItemsForVendor = cart.items.filter((i) => restaurant && i.restaurantId === restaurant.id);

  useEffect(() => {
    if (!slug) return;
    if (studentUniversityIds.length === 0) {
      setRestaurant(null);
      setItems([]);
      setLoading(false);
      return;
    }
    let restaurantId: string | null = null;
    let active = true;
    setLoading(true);

    (async () => {
      const { data: r } = await supabase
        .from("restaurants").select("*").eq("slug", slug).in("university_id", studentUniversityIds).maybeSingle();
      if (!active) return;
      if (!r) { setLoading(false); return; }
      setRestaurant(r as Restaurant);
      restaurantId = r.id;
      const { data: m } = await supabase
        .from("menu_items").select("*").eq("restaurant_id", r.id).order("category").order("name");
      if (!active) return;
      setItems((m as MenuItem[]) ?? []);
      setLoading(false);
    })();

    // Real-time subscription on menu changes
    const channel = supabase
      .channel(`menu-${slug}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "menu_items" }, (payload) => {
        const newItem = payload.new as MenuItem | undefined;
        const oldItem = payload.old as MenuItem | undefined;
        const targetRid = newItem?.restaurant_id ?? oldItem?.restaurant_id;
        if (!restaurantId || targetRid !== restaurantId) return;
        if (payload.eventType === "INSERT" && newItem) setItems((prev) => [...prev, newItem]);
        if (payload.eventType === "UPDATE" && newItem) setItems((prev) => prev.map((i) => (i.id === newItem.id ? newItem : i)));
        if (payload.eventType === "DELETE" && oldItem) setItems((prev) => prev.filter((i) => i.id !== oldItem.id));
      })
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [slug, studentUniversityIds]);

  const grouped = useMemo(() => {
    const map = new Map<string, MenuItem[]>();
    items.forEach((i) => {
      if (!map.has(i.category)) map.set(i.category, []);
      map.get(i.category)!.push(i);
    });
    const entries = Array.from(map.entries());
    // Push beverage-like categories to the end
    entries.sort(([a], [b]) => {
      const isBev = (c: string) => /bever|drink/i.test(c);
      return Number(isBev(a)) - Number(isBev(b));
    });
    return entries;
  }, [items]);

  const handleAdd = (item: MenuItem) => {
    if (!restaurant) return;
    if (!item.is_available) return;
    const differentVendor = cart.items.length > 0 && cart.items[0].restaurantId !== restaurant.id;
    if (differentVendor) {
      toast.warning(`Cart cleared — switching to ${restaurant.name}`);
    }
    cart.addItem({
      id: item.id, name: item.name, price: Number(item.price),
      restaurantId: restaurant.id, restaurantName: restaurant.name,
    });
    toast.success(`Added ${item.name}`);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <TopBar />
        <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-forest" /></div>
      </div>
    );
  }
  if (!restaurant) {
    return (
      <div className="min-h-screen bg-background">
        <TopBar />
        <div className="container py-20 text-center">
          <p className="text-muted-foreground">Restaurant not found.</p>
          <Button asChild variant="link"><Link to="/">Go back</Link></Button>
        </div>
      </div>
    );
  }

  const cartCount = cartItemsForVendor.reduce((n, i) => n + i.quantity, 0);
  const cartTotal = cartItemsForVendor.reduce((s, i) => s + i.quantity * i.price, 0);

  return (
    <div className="min-h-screen bg-background pb-28">
      <TopBar />

      <section className="bg-gradient-hero text-primary-foreground">
        <div className="container py-6">
          <Button asChild variant="ghost" size="sm" className="mb-3 text-primary-foreground/80 hover:bg-navy-light hover:text-primary-foreground">
            <Link to="/" className="gap-1.5"><ArrowLeft className="h-4 w-4" /> All restaurants</Link>
          </Button>
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl bg-navy-dark text-4xl shadow-elevated">
              {restaurant.slug === "gyroverse" ? (
                <img src={gyroverseLogo} alt={restaurant.name} className="h-full w-full object-cover" />
              ) : (
                restaurant.emoji
              )}
            </div>
            <div>
              <h1 className="font-display text-2xl font-bold sm:text-3xl">{restaurant.name}</h1>
              <p className="text-sm text-primary-foreground/70">{restaurant.cuisine}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="container space-y-8 py-8">
        {grouped.length === 0 && (
          <Card className="mx-auto max-w-md p-10 text-center shadow-card">
            <div className="text-5xl">🚧</div>
            <h2 className="mt-3 font-display text-xl font-bold text-navy">Coming Soon</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {restaurant.name} is finalising their menu. Check back shortly to start ordering.
            </p>
          </Card>
        )}
        {grouped.map(([cat, list]) => (
          <div key={cat}>
            <h2 className="mb-3 font-display text-lg font-bold text-navy">{cat}</h2>
            <div className="grid gap-3">
              {list.map((item) => {
                const unavailable = !item.is_available;
                return (
                  <Card
                    key={item.id}
                    className={`flex items-center gap-4 p-4 transition-all ${
                      unavailable ? "opacity-50 grayscale" : "hover:shadow-card"
                    }`}
                  >
                    {item.image_url && (
                      <img src={item.image_url} alt={item.name} className="h-16 w-16 shrink-0 rounded-lg object-cover" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="truncate font-semibold text-navy">{item.name}</h3>
                        {unavailable && <Badge variant="outline" className="border-destructive/40 text-destructive">Sold out</Badge>}
                      </div>
                      {item.description && (
                        <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{item.description}</p>
                      )}
                      <p className="mt-1 text-sm font-bold text-forest">Rs {Number(item.price).toFixed(0)}</p>
                    </div>
                    <Button
                      onClick={() => handleAdd(item)}
                      disabled={unavailable}
                      variant="cta" size="sm" className="shrink-0"
                    >
                      <Plus className="h-4 w-4" />
                      Add
                    </Button>
                  </Card>
                );
              })}
            </div>
          </div>
        ))}
      </section>

      {cartCount > 0 && (
        <div className="fixed bottom-4 left-1/2 z-30 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 animate-fade-in">
          <Button onClick={() => navigate("/cart")} variant="cta" size="lg" className="w-full justify-between">
            <span className="flex items-center gap-2">
              <ShoppingBag className="h-5 w-5" />
              {cartCount} item{cartCount > 1 ? "s" : ""} · Rs {cartTotal.toFixed(0)}
            </span>
            <span>Review →</span>
          </Button>
        </div>
      )}
    </div>
  );
};

export default RestaurantMenu;
