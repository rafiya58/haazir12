import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/context/AuthContext";
import { RequireAuth } from "@/components/RequireAuth";
import AdminDashboard from "./pages/AdminDashboard.tsx";
import Auth from "./pages/Auth.tsx";
import Cart from "./pages/Cart.tsx";
import Index from "./pages/Index.tsx";
import MyOrders from "./pages/MyOrders.tsx";
import NotFound from "./pages/NotFound.tsx";
import OrderConfirmation from "./pages/OrderConfirmation.tsx";
import RestaurantMenu from "./pages/RestaurantMenu.tsx";
import VendorApplication from "./pages/VendorApplication.tsx";
import VendorDashboard from "./pages/VendorDashboard.tsx";
import CampusAdminDashboard from "./pages/CampusAdminDashboard.tsx";
import ResetPassword from "./pages/ResetPassword.tsx";
import SetCampusAdminPassword from "./pages/SetCampusAdminPassword.tsx";
import JoinVendor from "./pages/JoinVendor.tsx";

const queryClient = new QueryClient();

const RootRoute = () => {
  const location = useLocation();
  const query = new URLSearchParams(location.search);

  if (query.has("token_hash") && query.get("type") === "invite") {
    return <Navigate to={{ pathname: "/set-password", search: location.search, hash: location.hash }} replace />;
  }

  return <Index />;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/auth" element={<Auth />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/set-password" element={<SetCampusAdminPassword />} />
            <Route path="/join-vendor" element={<JoinVendor />} />
            <Route path="/" element={<RootRoute />} />
            <Route path="/restaurant/:slug" element={<RequireAuth requireRole="student"><RestaurantMenu /></RequireAuth>} />
            <Route path="/cart" element={<RequireAuth requireRole="student"><Cart /></RequireAuth>} />
            <Route path="/order/:id" element={<RequireAuth requireRole="student"><OrderConfirmation /></RequireAuth>} />
            <Route path="/orders" element={<RequireAuth requireRole="student"><MyOrders /></RequireAuth>} />
            <Route path="/vendor-application" element={<RequireAuth><VendorApplication /></RequireAuth>} />
            <Route path="/vendor" element={<RequireAuth requireRole="vendor"><VendorDashboard /></RequireAuth>} />
            <Route path="/campus" element={<RequireAuth requireRole="campus_admin"><CampusAdminDashboard /></RequireAuth>} />
            <Route path="/admin" element={<RequireAuth requireRole="platform_admin"><AdminDashboard /></RequireAuth>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
