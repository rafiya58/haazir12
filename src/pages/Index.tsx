import { Navigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Loader2 } from "lucide-react";
import StudentHome from "./StudentHome";
import VendorApplication from "./VendorApplication";
import SetCampusAdminPassword from "./SetCampusAdminPassword";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const Index = () => {
  const { user, loading, roles, activeMode, roleError, signOut } = useAuth();

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
  if (roles.includes("vendor") && (!roles.includes("student") || activeMode === "vendor")) {
    return <Navigate to="/vendor" replace />;
  }
  if (!roles.includes("student") && !roles.includes("vendor")) {
    if (user.user_metadata.account_type === "vendor") return <VendorApplication />;
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-4">
        <Card className="max-w-lg space-y-4 p-6 text-center">
          <h1 className="font-display text-xl font-bold text-navy">Workspace access is not configured</h1>
          <p className="text-sm text-muted-foreground">
            This account has signed in successfully, but no app role is assigned to it.
            Ask an existing platform admin to verify this account's access.
          </p>
          <Button variant="outline" onClick={() => void signOut()}>Sign out</Button>
        </Card>
      </main>
    );
  }

  return <StudentHome />;
};

export default Index;
