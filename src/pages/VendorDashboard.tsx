import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { TopBar } from "@/components/TopBar";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import imageCompression from "browser-image-compression";
import { Loader2, ChefHat, Bell, CheckCircle2, X, BadgeCheck, Clock, Receipt, Plus } from "lucide-react";
import { toast } from "sonner";

interface MenuItem { id: string; name: string; description: string | null; image_url: string | null; price: number; category: string; is_available: boolean; restaurant_id: string; }
interface OrderItem { id: string; item_name: string; quantity: number; unit_price: number; }
interface Order {
  id: string; status: string; total: number; pickup_code: string; notes: string | null; created_at: string;
  pickup_time: string | null;
  payment_proof_url: string | null;
  student_id: string;
  order_items: OrderItem[];
  profiles?: { full_name: string | null; email: string } | null;
}

const ACTIVE_STATUSES = ["pending", "preparing", "ready"];
const MENU_ITEM_IMAGES_BUCKET = "menu-item-images";

const VendorDashboard = () => {
  const { restaurantId, user } = useAuth();
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [restaurantName, setRestaurantName] = useState("");
  const [loading, setLoading] = useState(true);
  const [menuError, setMenuError] = useState<string | null>(null);
  const [verifyCode, setVerifyCode] = useState("");
  const [newItemName, setNewItemName] = useState("");
  const [newItemPrice, setNewItemPrice] = useState("");
  const [newItemCategory, setNewItemCategory] = useState("Mains");
  const [newItemDescription, setNewItemDescription] = useState("");
  const [newItemImage, setNewItemImage] = useState<File | null>(null);
  const [addingItem, setAddingItem] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  useEffect(() => {
    if (!newItemImage) {
      setImagePreview(null);
      return;
    }
    const previewUrl = URL.createObjectURL(newItemImage);
    setImagePreview(previewUrl);
    return () => URL.revokeObjectURL(previewUrl);
  }, [newItemImage]);

  useEffect(() => {
    if (!restaurantId) { setLoading(false); return; }
    const load = async () => {
      const [{ data: r }, { data: m, error: menuLoadError }, { data: o }] = await Promise.all([
        supabase.from("restaurants").select("name").eq("id", restaurantId).maybeSingle(),
        supabase.from("menu_items").select("*").eq("restaurant_id", restaurantId).order("category").order("name"),
        supabase.from("orders").select("*, order_items(*)").eq("restaurant_id", restaurantId).order("pickup_time", { ascending: true, nullsFirst: false }),
      ]);
      setRestaurantName(r?.name ?? "Vendor");
      if (menuLoadError) {
        console.error("Unable to load vendor menu:", menuLoadError.message);
        setMenuError("Menu items could not be loaded. Please refresh and try again.");
        setMenu([]);
      } else {
        setMenuError(null);
        setMenu((m as MenuItem[]) ?? []);
      }
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

  const selectMenuImage = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file");
      event.currentTarget.value = "";
      return;
    }
    setNewItemImage(file);
  };

  const addMenuItem = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    if (!restaurantId || !user) {
      toast.error("Your vendor account is not ready to add menu items");
      return;
    }

    const name = newItemName.trim();
    const price = Number(newItemPrice);
    if (!name) {
      toast.error("Enter an item name");
      return;
    }
    if (newItemPrice.trim() === "" || !Number.isFinite(price) || price < 0) {
      toast.error("Enter a valid price");
      return;
    }

    setAddingItem(true);
    let uploadedImagePath: string | null = null;
    try {
      let imageUrl: string | null = null;
      if (newItemImage) {
        const compressedImage = await imageCompression(newItemImage, {
          maxSizeMB: 0.3,
          maxWidthOrHeight: 640,
          useWebWorker: true,
          fileType: "image/jpeg",
        });
        const imagePath = `${restaurantId}/${user.id}/${crypto.randomUUID()}.jpg`;
        const { error: uploadError } = await supabase.storage
          .from(MENU_ITEM_IMAGES_BUCKET)
          .upload(imagePath, compressedImage, { upsert: false, contentType: "image/jpeg" });
        if (uploadError) throw uploadError;

        uploadedImagePath = imagePath;
        imageUrl = supabase.storage.from(MENU_ITEM_IMAGES_BUCKET).getPublicUrl(imagePath).data.publicUrl;
      }

      const { data: item, error } = await supabase
        .from("menu_items")
        .insert({
          restaurant_id: restaurantId,
          name,
          price,
          category: newItemCategory.trim() || "Mains",
          description: newItemDescription.trim() || null,
          image_url: imageUrl,
        })
        .select("*")
        .single();
      if (error) throw error;

      setMenu((current) => [...current, item].sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name)));
      setMenuError(null);
      setNewItemName("");
      setNewItemPrice("");
      setNewItemCategory("Mains");
      setNewItemDescription("");
      setNewItemImage(null);
      form.reset();
      toast.success(`${item.name} added to your menu`);
    } catch (error) {
      if (uploadedImagePath) {
        const { error: cleanupError } = await supabase.storage
          .from(MENU_ITEM_IMAGES_BUCKET)
          .remove([uploadedImagePath]);
        if (cleanupError) toast.error(`Could not clean up the uploaded image: ${cleanupError.message}`);
      }
      toast.error(error instanceof Error ? error.message : "Could not add menu item");
    } finally {
      setAddingItem(false);
    }
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

  const active = orders
    .filter((o) => ACTIVE_STATUSES.includes(o.status))
    .sort((a, b) => {
      const ta = a.pickup_time ? new Date(a.pickup_time).getTime() : new Date(a.created_at).getTime();
      const tb = b.pickup_time ? new Date(b.pickup_time).getTime() : new Date(b.created_at).getTime();
      return ta - tb;
    });
  const past = orders
    .filter((o) => !ACTIVE_STATUSES.includes(o.status))
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

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
                        <p className="text-xs text-muted-foreground">Ordered {new Date(o.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>
                        {o.pickup_time && (
                          <p className="mt-1 inline-flex items-center gap-1 rounded-md bg-forest/10 px-2 py-0.5 text-xs font-semibold text-forest">
                            <Clock className="h-3 w-3" /> Pickup at {new Date(o.pickup_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </p>
                        )}
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
                    {o.payment_proof_url && (
                      <a
                        href={o.payment_proof_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-3 flex items-center gap-3 rounded-lg border bg-muted/40 p-2 transition-colors hover:bg-muted"
                      >
                        <img src={o.payment_proof_url} alt="Payment proof" className="h-14 w-14 rounded-md object-cover" />
                        <div className="flex flex-1 items-center gap-1.5 text-xs font-semibold text-forest">
                          <Receipt className="h-3.5 w-3.5" /> View payment receipt
                        </div>
                      </a>
                    )}
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
            <Card className="p-4 sm:p-5">
              <h2 className="font-display text-lg font-bold text-navy">Add a menu item</h2>
              <p className="mb-4 text-sm text-muted-foreground">Add an item and its price. Description and photo are optional.</p>
              <form onSubmit={addMenuItem} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="menu-item-name">Item name</Label>
                    <Input id="menu-item-name" value={newItemName} onChange={(event) => setNewItemName(event.target.value)} placeholder="e.g. Chicken wrap" required maxLength={100} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="menu-item-price">Price (Rs)</Label>
                    <Input id="menu-item-price" type="number" value={newItemPrice} onChange={(event) => setNewItemPrice(event.target.value)} placeholder="e.g. 350" min={0} step="0.01" required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="menu-item-category">Category</Label>
                    <Input id="menu-item-category" value={newItemCategory} onChange={(event) => setNewItemCategory(event.target.value)} placeholder="Mains" maxLength={50} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="menu-item-image">Photo (optional)</Label>
                    <Input id="menu-item-image" type="file" accept="image/*" onChange={selectMenuImage} />
                    {imagePreview && <img src={imagePreview} alt="Menu item preview" className="h-16 w-16 rounded-lg object-cover" />}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="menu-item-description">Description (optional)</Label>
                  <Textarea id="menu-item-description" value={newItemDescription} onChange={(event) => setNewItemDescription(event.target.value)} placeholder="Tell customers what's in this item" rows={3} maxLength={500} />
                </div>
                <Button type="submit" variant="cta" disabled={addingItem}>
                  {addingItem ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  {addingItem ? "Adding item..." : "Add menu item"}
                </Button>
              </form>
            </Card>

            {menuError ? (
              <Card className="p-10 text-center text-sm text-muted-foreground">{menuError}</Card>
            ) : menu.length === 0 ? (
              <Card className="p-10 text-center text-sm text-muted-foreground">
                No menu items have been added to this restaurant yet. Add your first item above.
              </Card>
            ) : menu.map((item) => (
              <Card key={item.id} className="flex flex-wrap items-center gap-3 p-4">
                {item.image_url && <img src={item.image_url} alt={item.name} className="h-14 w-14 rounded-lg object-cover" />}
                <div className="min-w-0 flex-1">
                  <p className={`font-semibold ${item.is_available ? "text-navy" : "text-muted-foreground line-through"}`}>{item.name}</p>
                  <p className="text-xs text-muted-foreground">{item.category}</p>
                  {item.description && <p className="mt-1 text-xs text-muted-foreground">{item.description}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Rs</span>
                  <Input type="number" defaultValue={Number(item.price)} min={0} step="1"
                    onBlur={(e) => updatePrice(item, e.target.value)}
                    aria-label={`Price for ${item.name}`}
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
