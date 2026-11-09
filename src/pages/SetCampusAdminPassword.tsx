import { FormEvent, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

const SetCampusAdminPassword = () => {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const setInitialPassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (password.length < 8 || password.length > 72) {
      toast.error("Password must be between 8 and 72 characters.");
      return;
    }
    if (password !== confirmPassword) {
      toast.error("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        toast.error(userError?.message ?? "The invitation session has expired. Ask the platform admin to resend your invitation.");
        return;
      }

      const { error } = await supabase.auth.updateUser({
        password,
        data: { ...user.user_metadata, requires_password_setup: false },
      });
      if (error) {
        toast.error(error.message);
        return;
      }
      window.location.replace("/campus");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to set your password.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <Card className="w-full max-w-md space-y-5 p-6 sm:p-8">
        <div>
          <h1 className="font-display text-2xl font-bold text-navy">Complete your admin invitation</h1>
          <p className="mt-1 text-sm text-muted-foreground">Set a password for your university admin account.</p>
        </div>
        <form onSubmit={setInitialPassword} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="campus-password">Password</Label>
            <Input
              id="campus-password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="campus-confirm-password">Confirm password</Label>
            <Input
              id="campus-confirm-password"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              required
            />
          </div>
          <Button type="submit" variant="cta" size="lg" className="w-full" disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Set password"}
          </Button>
        </form>
      </Card>
    </main>
  );
};

export default SetCampusAdminPassword;
