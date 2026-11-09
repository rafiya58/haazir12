import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "student" | "vendor" | "campus_admin" | "platform_admin";

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  loading: boolean;
  roles: AppRole[];
  roleError: string | null;
  restaurantId: string | null;
  universityIds: string[];
  campusUniversityIds: string[];
  signOut: () => Promise<void>;
  refreshRoles: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [roleError, setRoleError] = useState<string | null>(null);
  const [restaurantId, setRestaurantId] = useState<string | null>(null);
  const [universityIds, setUniversityIds] = useState<string[]>([]);
  const [campusUniversityIds, setCampusUniversityIds] = useState<string[]>([]);

  const loadRoles = async (userId: string) => {
    const { data, error } = await supabase
      .from("user_roles")
      .select("role, restaurant_id, university_id")
      .eq("user_id", userId);
    if (error) {
      console.error("Unable to load account roles:", error.message);
      setRoleError("We couldn't load your account permissions. Please refresh the page.");
      setRoles([]);
      setRestaurantId(null);
      setUniversityIds([]);
      setCampusUniversityIds([]);
      return;
    }
    setRoleError(null);
    setRoles(data.map((r) => r.role as AppRole));
    const vendor = data.find((r) => r.role === "vendor");
    setRestaurantId(vendor?.restaurant_id ?? null);
    setUniversityIds(
      [...new Set(data.flatMap((role) => role.university_id ? [role.university_id] : []))],
    );
    setCampusUniversityIds(
      [...new Set(data.flatMap((role) =>
        role.role === "campus_admin" && role.university_id ? [role.university_id] : [],
      ))],
    );
  };

  useEffect(() => {
    // Set up listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, sess) => {
      setSession(sess);
      setUser(sess?.user ?? null);
      if (sess?.user) {
        if (event === "SIGNED_IN" || event === "INITIAL_SESSION" || event === "USER_UPDATED") {
          setLoading(true);
          setTimeout(() => {
            void loadRoles(sess.user.id).finally(() => setLoading(false));
          }, 0);
        }
      } else {
        setRoles([]);
        setRoleError(null);
        setRestaurantId(null);
        setUniversityIds([]);
        setCampusUniversityIds([]);
        setLoading(false);
      }
    });

    supabase.auth.getSession().then(({ data: { session: sess } }) => {
      setSession(sess);
      setUser(sess?.user ?? null);
      if (sess?.user) {
        loadRoles(sess.user.id).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const refreshRoles = async () => {
    if (user) await loadRoles(user.id);
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, roles, roleError, restaurantId, universityIds, campusUniversityIds, signOut, refreshRoles }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};
