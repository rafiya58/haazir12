import { Navigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Loader2 } from "lucide-react";
import StudentHome from "./StudentHome";

const Index = () => {
  const { user, loading, roles } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-forest" />
      </div>
    );
  }
  if (!user) return <Navigate to="/auth" replace />;

  // Conditional routing based on role
  if (roles.includes("restaurant")) return <Navigate to="/vendor" replace />;
  if (roles.includes("admin") && !roles.includes("student")) return <Navigate to="/admin" replace />;

  return <StudentHome />;
};

export default Index;
