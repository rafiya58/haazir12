import { Link, useNavigate } from "react-router-dom";
import { Utensils, LogOut, ShoppingBag, ClipboardList, Shield, Store, University, ArrowLeftRight } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useCart } from "@/store/cart";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const TopBar = () => {
  const { user, roles, activeMode, switchMode, signOut } = useAuth();
  const navigate = useNavigate();
  const cartCount = useCart((s) => s.items.reduce((n, i) => n + i.quantity, 0));

  const isStudent = roles.includes("student") && (!roles.includes("vendor") || activeMode === "student");
  const isVendor = roles.includes("vendor") && (!roles.includes("student") || activeMode === "vendor");
  const isCampusAdmin = roles.includes("campus_admin");
  const isPlatformAdmin = roles.includes("platform_admin");

  const handleSignOut = async () => {
    await signOut();
    navigate("/auth");
  };

  return (
    <header className="sticky top-0 z-40 bg-navy text-primary-foreground shadow-card">
      <div className="container flex h-16 items-center justify-between">
        <Link to="/" className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-forest text-primary-foreground">
            <Utensils className="h-5 w-5" />
          </div>
          <div className="leading-tight">
            <div className="font-display text-lg font-bold">Haazir</div>
            <div className="text-[10px] uppercase tracking-widest text-primary-foreground/60">IBA Campus</div>
          </div>
        </Link>

        {user && (
          <nav className="flex items-center gap-1 sm:gap-2">
            {isStudent && (
              <>
                <Button asChild variant="ghost" size="sm" className="text-primary-foreground hover:bg-navy-light hover:text-primary-foreground">
                  <Link to="/orders" className="gap-1.5"><ClipboardList className="h-4 w-4" /><span className="hidden sm:inline">My Orders</span></Link>
                </Button>
                <Button asChild variant="ghost" size="sm" className="relative text-primary-foreground hover:bg-navy-light hover:text-primary-foreground">
                  <Link to="/cart" className="gap-1.5">
                    <ShoppingBag className="h-4 w-4" />
                    <span className="hidden sm:inline">Cart</span>
                    {cartCount > 0 && (
                      <Badge className="ml-1 bg-forest-light px-1.5 text-[10px] hover:bg-forest-light">{cartCount}</Badge>
                    )}
                  </Link>
                </Button>
              </>
            )}
            {isVendor && (
              <Button asChild variant="ghost" size="sm" className="text-primary-foreground hover:bg-navy-light hover:text-primary-foreground">
                <Link to="/vendor" className="gap-1.5"><Store className="h-4 w-4" /><span className="hidden sm:inline">Dashboard</span></Link>
              </Button>
            )}
            {roles.includes("student") && roles.includes("vendor") && (
              <Button
                onClick={() => {
                  const nextMode = switchMode();
                  navigate(nextMode === "vendor" ? "/vendor" : "/");
                }}
                variant="ghost"
                size="sm"
                className="text-primary-foreground hover:bg-navy-light hover:text-primary-foreground"
              >
                <ArrowLeftRight className="h-4 w-4" />
                <span className="ml-1.5">Switch to {activeMode === "student" ? "vendor" : "student"}</span>
              </Button>
            )}
            {isStudent && !isVendor && (
              <Button asChild variant="ghost" size="sm" className="text-primary-foreground hover:bg-navy-light hover:text-primary-foreground">
                <Link to="/vendor-application" className="gap-1.5"><Store className="h-4 w-4" /><span className="hidden sm:inline">Become a vendor</span></Link>
              </Button>
            )}
            {isCampusAdmin && (
              <Button asChild variant="ghost" size="sm" className="text-primary-foreground hover:bg-navy-light hover:text-primary-foreground">
                <Link to="/campus" className="gap-1.5"><University className="h-4 w-4" /><span className="hidden sm:inline">Campus admin</span></Link>
              </Button>
            )}
            {isPlatformAdmin && (
              <Button asChild variant="ghost" size="sm" className="text-primary-foreground hover:bg-navy-light hover:text-primary-foreground">
                <Link to="/admin" className="gap-1.5"><Shield className="h-4 w-4" /><span className="hidden sm:inline">Platform admin</span></Link>
              </Button>
            )}
            <Button onClick={handleSignOut} variant="ghost" size="sm" className="text-primary-foreground hover:bg-navy-light hover:text-primary-foreground">
              <LogOut className="h-4 w-4" />
            </Button>
          </nav>
        )}
      </div>
    </header>
  );
};
