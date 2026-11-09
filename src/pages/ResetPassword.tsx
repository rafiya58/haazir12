import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Loader2, Utensils } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { z } from "zod";

const passwordSchema = z.string().min(8, "Password must be at least 8 characters").max(72);

const ResetPassword = () => {
  const navigate = useNavigate();
  const [checkingLink, setCheckingLink] = useState(true);
  const [recoveryReady, setRecoveryReady] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    const recoveryRedirect = new URLSearchParams(window.location.search).get("mode") === "recovery";
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" && session?.user) {
        setEmail(session.user.email ?? "");
        setRecoveryReady(true);
        setCheckingLink(false);
      }
    });

    void supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (error) {
        toast.error(`Unable to validate the reset link: ${error.message}`);
      } else if (recoveryRedirect && data.session?.user) {
        setEmail(data.session.user.email ?? "");
        setRecoveryReady(true);
      }
      setCheckingLink(false);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const updatePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsed = passwordSchema.safeParse(password);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    if (password !== confirmPassword) {
      toast.error("Passwords do not match.");
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: parsed.data });
      if (error) {
        toast.error(error.message);
        return;
      }
      const { error: signOutError } = await supabase.auth.signOut();
      if (signOutError) {
        toast.error(`Password was changed, but sign out failed: ${signOutError.message}`);
        return;
      }
      toast.success("Password updated. Sign in with your new password.");
      navigate("/auth", { replace: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to update your password.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <Card className="w-full max-w-md space-y-6 p-6 sm:p-8">
        <Link to="/auth" className="flex items-center gap-3 text-navy">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-forest text-primary-foreground">
            <Utensils className="h-5 w-5" />
          </span>
          <span className="font-display text-2xl font-bold">Haazir</span>
        </Link>

        {checkingLink ? (
          <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-forest" /></div>
        ) : recoveryReady ? (
          <>
            <div>
              <h1 className="font-display text-2xl font-bold text-navy">Choose a new password</h1>
              <p className="mt-1 text-sm text-muted-foreground">Resetting the password for {email || "your account"}.</p>
            </div>
            <form onSubmit={updatePassword} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="reset-password">New password</Label>
                <Input
                  id="reset-password"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="reset-confirm-password">Confirm new password</Label>
                <Input
                  id="reset-confirm-password"
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  required
                />
              </div>
              <Button type="submit" variant="cta" size="lg" className="w-full" disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Update password"}
              </Button>
            </form>
          </>
        ) : (
          <div className="space-y-3">
            <h1 className="font-display text-2xl font-bold text-navy">Reset link unavailable</h1>
            <p className="text-sm text-muted-foreground">
              This link is expired, already used, or did not return to the password reset page. Request a new reset email and open its link again.
            </p>
            <Button asChild variant="cta" size="lg" className="w-full">
              <Link to="/auth">Return to sign in</Link>
            </Button>
          </div>
        )}
      </Card>
    </main>
  );
};

export default ResetPassword;
