import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { TopBar } from "@/components/TopBar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useCart } from "@/store/cart";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Minus, Plus, Trash2, Loader2, ShoppingBag } from "lucide-react";
import { toast } from "sonner";

const Cart = () => {
  const navigate = useNavigate();
  const cart = useCart();
  const { user } = useAuth();
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const total = cart.total();
  const vendorId = cart.items[0]?.restaurantId;
  const vendorName = cart.items[0]?.restaurantName;

  const placeOrder = async () => {
    if (!user || !vendorId || cart.items.length === 0) return;
    setSubmitting(true);

    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .insert({
        student_id: user.id,
        restaurant_id: vendorId,
        total,
        notes: notes.trim() || null,
      })
      .select()
      .single();

    if (orderErr || !order) {
      setSubmitting(false);
      toast.error(orderErr?.message ?? "Could not place order");
      return;
    }

    const itemRows = cart.items.map((i) => ({
      order_id: order.id,
      menu_item_id: i.id,
      item_name: i.name,
      unit_price: i.price,
      quantity: i.quantity,
    }));
    const { error: itemsErr } = await supabase.from("order_items").insert(itemRows);

    setSubmitting(false);
    if (itemsErr) {
      toast.error(itemsErr.message);
      return;
    }
    cart.clear();
    toast.success("Order placed!");
    navigate(`/order/${order.id}`);
  };

  if (cart.items.length === 0) {
    return (
      <div className="min-h-screen bg-background">
        <TopBar />
        <div className="container flex flex-col items-center py-24 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
            <ShoppingBag className="h-7 w-7 text-muted-foreground" />
          </div>
          <h2 className="mt-4 font-display text-xl font-bold text-navy">Your cart is empty</h2>
          <p className="mt-1 text-sm text-muted-foreground">Browse a restaurant to start ordering.</p>
          <Button onClick={() => navigate("/")} variant="cta" size="lg" className="mt-6">
            Explore restaurants
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <TopBar />
      <section className="container max-w-2xl py-8">
        <h1 className="font-display text-2xl font-bold text-navy">Review your order</h1>
        <p className="mt-1 text-sm text-muted-foreground">From <span className="font-medium text-forest">{vendorName}</span></p>

        <Card className="mt-6 divide-y">
          {cart.items.map((item) => (
            <div key={item.id} className="flex items-center gap-3 p-4">
              <div className="flex-1 min-w-0">
                <p className="truncate font-medium text-navy">{item.name}</p>
                <p className="text-xs text-muted-foreground">Rs {item.price.toFixed(0)} each</p>
              </div>
              <div className="flex items-center gap-1 rounded-full border bg-background px-1 py-0.5">
                <Button onClick={() => cart.updateQty(item.id, item.quantity - 1)} size="icon" variant="ghost" className="h-7 w-7 rounded-full">
                  <Minus className="h-3.5 w-3.5" />
                </Button>
                <span className="w-5 text-center text-sm font-semibold">{item.quantity}</span>
                <Button onClick={() => cart.updateQty(item.id, item.quantity + 1)} size="icon" variant="ghost" className="h-7 w-7 rounded-full">
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>
              <p className="w-20 text-right font-bold text-forest">Rs {(item.price * item.quantity).toFixed(0)}</p>
              <Button onClick={() => cart.removeItem(item.id)} size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-destructive">
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </Card>

        <div className="mt-4">
          <Textarea
            value={notes} onChange={(e) => setNotes(e.target.value.slice(0, 200))}
            placeholder="Special instructions (optional)"
            rows={2}
          />
        </div>

        <div className="mt-6 flex items-center justify-between rounded-xl bg-accent p-4">
          <span className="text-sm font-medium text-accent-foreground">Total</span>
          <span className="font-display text-2xl font-bold text-forest-dark">Rs {total.toFixed(0)}</span>
        </div>

        <Button onClick={placeOrder} disabled={submitting} variant="cta" size="lg" className="mt-4 w-full">
          {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : "Confirm pre-order"}
        </Button>
      </section>
    </div>
  );
};

export default Cart;
