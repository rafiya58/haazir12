import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { isIBAEmail } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Utensils, GraduationCap, Store, Loader2 } from "lucide-react";
import { z } from "zod";

const signupSchema = z.object({
  email: z.string().trim().email("Enter a valid email").max(255).refine(isIBAEmail, {
    message: "Use your @khi.iba.edu.pk or @iba.edu.pk email",
  }),
  password: z.string().min(8, "Min 8 characters").max(72),
  fullName: z.string().trim().min(2, "Enter your name").max(80),
});

const loginSchema = z.object({
  email: z.string().trim().email("Enter a valid email").max(255),
  password: z.string().min(1, "Password required").max(72),
});

const Auth = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  // Login form
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  // Signup form
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = loginSchema.safeParse({ email: loginEmail, password: loginPassword });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: parsed.data.email,
      password: parsed.data.password,
    });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Welcome back!");
    navigate("/");
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = signupSchema.safeParse({ email, password, fullName: name });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: {
        emailRedirectTo: `${window.location.origin}/`,
        data: { full_name: parsed.data.fullName },
      },
    });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Account created — you're in!");
    navigate("/");
  };

  return (
    <div className="min-h-screen bg-gradient-hero">
      <div className="container flex min-h-screen flex-col items-center justify-center py-12">
        <Link to="/" className="mb-8 flex items-center gap-3 text-primary-foreground">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-forest shadow-cta">
            <Utensils className="h-6 w-6" />
          </div>
          <div>
            <div className="font-display text-3xl font-bold">Haazir</div>
            <div className="text-xs uppercase tracking-[0.2em] text-primary-foreground/70">IBA Campus Pre-order</div>
          </div>
        </Link>

        <div className="w-full max-w-md rounded-2xl bg-card p-6 shadow-elevated sm:p-8">
          <Tabs defaultValue="login" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="login">Sign in</TabsTrigger>
              <TabsTrigger value="signup">Create account</TabsTrigger>
            </TabsList>

            <TabsContent value="login" className="mt-6">
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="login-email">Email</Label>
                  <Input id="login-email" type="email" autoComplete="email" placeholder="you@khi.iba.edu.pk" value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="login-pw">Password</Label>
                  <Input id="login-pw" type="password" autoComplete="current-password" value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} />
                </div>
                <Button type="submit" variant="cta" size="lg" className="w-full" disabled={loading}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sign in"}
                </Button>
                <p className="text-center text-xs text-muted-foreground">
                  Vendor or admin? Sign in with the credentials provided to you.
                </p>
              </form>
            </TabsContent>

            <TabsContent value="signup" className="mt-6">
              <div className="mb-4 flex items-start gap-3 rounded-lg border border-forest/20 bg-accent p-3 text-xs text-accent-foreground">
                <GraduationCap className="mt-0.5 h-4 w-4 shrink-0 text-forest" />
                <p>Student sign-up is restricted to <span className="font-semibold">@khi.iba.edu.pk</span> or <span className="font-semibold">@iba.edu.pk</span> emails.</p>
              </div>
              <form onSubmit={handleSignup} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="su-name">Full name</Label>
                  <Input id="su-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ali Khan" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="su-email">IBA email</Label>
                  <Input id="su-email" type="email" autoComplete="email" placeholder="erp-id@khi.iba.edu.pk" value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="su-pw">Password</Label>
                  <Input id="su-pw" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
                </div>
                <Button type="submit" variant="cta" size="lg" className="w-full" disabled={loading}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create student account"}
                </Button>
              </form>
            </TabsContent>
          </Tabs>

          <div className="mt-6 flex items-center gap-2 text-[11px] text-muted-foreground">
            <Store className="h-3.5 w-3.5" />
            <span>Vendors are routed to their dashboard automatically on sign-in.</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Auth;
