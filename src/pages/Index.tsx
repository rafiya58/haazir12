import { Navigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Loader2 } from "lucide-react";
import StudentHome from "./StudentHome";
import VendorApplication from "./VendorApplication";
import SetCampusAdminPassword from "./SetCampusAdminPassword";

const Index = () => {
  const { user, loading, roles, roleError } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-forest" />
      </div>
    );
  }
  if (!user) return <Navigate to="/auth" replace />;
  if (
    user.user_metadata.account_type === "campus_admin"
    && user.user_metadata.requires_password_setup === true
  ) {
    return <SetCampusAdminPassword />;
  }
  if (roleError) {
    return (
      <div className="container py-20 text-center text-sm text-destructive">
        {roleError}
      </div>
    );
  }

  if (roles.includes("platform_admin")) return <Navigate to="/admin" replace />;
  if (roles.includes("campus_admin")) return <Navigate to="/campus" replace />;
  if (roles.includes("vendor") && !roles.includes("student")) return <Navigate to="/vendor" replace />;
  if (!roles.includes("student") && !roles.includes("vendor")) {
    return <VendorApplication />;
  }

  return <StudentHome />;
};

export default Index;
