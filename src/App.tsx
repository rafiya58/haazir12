import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/context/AuthContext";
import { RequireAuth } from "@/components/RequireAuth";
import Index from "./pages/Index.tsx";
import Auth from "./pages/Auth.tsx";
import RestaurantMenu from "./pages/RestaurantMenu.tsx";
import Cart from "./pages/Cart.tsx";
import OrderConfirmation from "./pages/OrderConfirmation.tsx";
import MyOrders from "./pages/MyOrders.tsx";
import VendorDashboard from "./pages/VendorDashboard.tsx";
import AdminDashboard from "./pages/AdminDashboard.tsx";
import NotFound from "./pages/NotFound.tsx";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/auth" element={<Auth />} />
            <Route path="/" element={<Index />} />
            <Route path="/restaurant/:slug" element={<RequireAuth requireRole="student"><RestaurantMenu /></RequireAuth>} />
            <Route path="/cart" element={<RequireAuth requireRole="student"><Cart /></RequireAuth>} />
            <Route path="/order/:id" element={<RequireAuth requireRole="student"><OrderConfirmation /></RequireAuth>} />
            <Route path="/orders" element={<RequireAuth requireRole="student"><MyOrders /></RequireAuth>} />
            <Route path="/vendor" element={<RequireAuth requireRole="restaurant"><VendorDashboard /></RequireAuth>} />
            <Route path="/admin" element={<RequireAuth requireRole="admin"><AdminDashboard /></RequireAuth>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
