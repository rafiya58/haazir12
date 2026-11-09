import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth, AppRole } from "@/context/AuthContext";
import { Loader2 } from "lucide-react";

interface Props {
  children: ReactNode;
  requireRole?: AppRole;
}

export const RequireAuth = ({ children, requireRole }: Props) => {
  const { user, loading, roles } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-forest" />
      </div>
    );
  }
  if (!user) return <Navigate to="/auth" replace />;
  if (requireRole && !roles.includes(requireRole)) {
    if (roles.includes("platform_admin")) return <Navigate to="/admin" replace />;
    if (roles.includes("campus_admin")) return <Navigate to="/campus" replace />;
    if (roles.includes("vendor") && !roles.includes("student")) return <Navigate to="/vendor" replace />;
    if (roles.includes("student")) return <Navigate to="/" replace />;
    return <Navigate to="/vendor-application" replace />;
  }
  return <>{children}</>;
};
