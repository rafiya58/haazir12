import { FormEvent, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { Link } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

type SetupStep = "checking" | "accept" | "password" | "error";

const invitationFailureMessage = (code: string | null, description: string | null) => {
  const reason = `${code ?? ""} ${description ?? ""}`.toLowerCase();
  if (code === "otp_expired" || /expired|invalid|already used/.test(reason)) {
    return "This invitation link has expired, is invalid, or has already been used. Ask a Platform Admin to send a fresh invitation email.";
  }
  return "We couldn't verify this invitation. Ask a Platform Admin to send a fresh invitation email.";
};

const SetCampusAdminPassword = () => {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<SetupStep>("checking");
  const [message, setMessage] = useState("");
  const [inviteTokenHash, setInviteTokenHash] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const url = new URL(window.location.href);
    const query = url.searchParams;
    const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
    const errorCode = query.get("error_code") ?? hash.get("error_code");
    const authError = query.get("error") ?? hash.get("error");
    const errorDescription = query.get("error_description") ?? hash.get("error_description");

    const showError = (reason: string | null, description: string | null) => {
      if (!active) return;
      setMessage(invitationFailureMessage(reason, description));
      setStep("error");
    };

    const showPasswordSetup = (user: User) => {
      if (!active) return;
      if (
        user.user_metadata.account_type !== "campus_admin"
        || user.user_metadata.requires_password_setup !== true
      ) {
        showError("already_used", null);
        return;
      }
      setStep("password");
    };

    if (authError || errorCode || errorDescription) {
      showError(errorCode, errorDescription);
      window.history.replaceState({}, document.title, url.pathname);
      return () => { active = false; };
    }

    const tokenHash = query.get("token_hash");
    if (tokenHash) {
      if (query.get("type") !== "invite") {
        showError("invalid_token", null);
      } else {
        setInviteTokenHash(tokenHash);
        setStep("accept");
      }
      return () => { active = false; };
    }

    const code = query.get("code");
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) showPasswordSetup(session.user);
    });

    void (async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (!active) return;
        if (error) {
          showError(error.code ?? null, error.message);
          return;
        }
        if (data.session?.user) {
          showPasswordSetup(data.session.user);
          return;
        }
        if (code) {
          const { data: exchanged, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
          if (!active) return;
          if (exchangeError || !exchanged.user) {
            showError(exchangeError?.code ?? "invalid_token", exchangeError?.message ?? null);
            return;
          }
          showPasswordSetup(exchanged.user);
          return;
        }
        showError(null, null);
      } catch (error) {
        showError(null, error instanceof Error ? error.message : null);
      }
    })();

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const acceptInvitation = async () => {
    if (!inviteTokenHash) {
      setMessage(invitationFailureMessage("invalid_token", null));
      setStep("error");
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.auth.verifyOtp({
        token_hash: inviteTokenHash,
        type: "invite",
      });
      window.history.replaceState({}, document.title, window.location.pathname);
      if (error || !data.user || !data.session) {
        setMessage(invitationFailureMessage(error?.code ?? "invalid_token", error?.message ?? null));
        setStep("error");
        return;
      }
      setInviteTokenHash(null);
      if (
        data.user.user_metadata.account_type !== "campus_admin"
        || data.user.user_metadata.requires_password_setup !== true
      ) {
        setMessage(invitationFailureMessage("already_used", null));
        setStep("error");
        return;
      }
      setStep("password");
    } catch (error) {
      window.history.replaceState({}, document.title, window.location.pathname);
      setMessage(invitationFailureMessage(null, error instanceof Error ? error.message : null));
      setStep("error");
    } finally {
      setLoading(false);
    }
  };

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
        setMessage(invitationFailureMessage(userError?.code ?? null, userError?.message ?? null));
        setStep("error");
        return;
      }
      if (user.user_metadata.account_type !== "campus_admin" || user.user_metadata.requires_password_setup !== true) {
        setMessage(invitationFailureMessage("already_used", null));
        setStep("error");
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
          <h1 className="font-display text-2xl font-bold text-navy">
            {step === "accept" ? "Accept campus admin invitation" : step === "error" ? "Invitation unavailable" : "Complete your admin invitation"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {step === "accept"
              ? "Continue to verify this invitation and set a password for your account."
              : step === "error"
                ? message
                : "Set a password for your university admin account."}
          </p>
        </div>
        {step === "checking" ? (
          <div className="flex justify-center py-4"><Loader2 className="h-6 w-6 animate-spin text-forest" /></div>
        ) : step === "accept" ? (
          <div className="space-y-4">
            <Button type="button" variant="cta" size="lg" className="w-full" disabled={loading} onClick={() => void acceptInvitation()}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Accept invitation"}
            </Button>
            <p className="text-xs text-muted-foreground">If this link has expired or was already used, ask a Platform Admin to send a fresh invitation.</p>
          </div>
        ) : step === "password" ? (
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
        ) : (
          <Button asChild variant="outline" className="w-full">
            <Link to="/auth">Return to sign in</Link>
          </Button>
        )}
      </Card>
    </main>
  );
};

export default SetCampusAdminPassword;
