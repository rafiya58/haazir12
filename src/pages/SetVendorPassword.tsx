import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Loader2, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TopBar } from "@/components/TopBar";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/integrations/supabase/client";

type SetupStep = "checking" | "accept" | "password" | "retry" | "error";

const TOKEN_STORAGE_KEY = "haazir:direct-vendor-invite-token-hash";

type CompleteDirectVendorInvitationResponse = {
  data: { invitation_id: string; restaurant_id: string; university_id: string }[] | null;
  error: { message: string } | null;
};

const completeDirectVendorInvitationRpc = supabase.rpc.bind(supabase) as unknown as (
  functionName: "complete_direct_vendor_invitation",
  args?: Record<string, never>,
) => PromiseLike<CompleteDirectVendorInvitationResponse>;

const SetVendorPassword = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading, roles, refreshRoles, activateVendorMode } = useAuth();
  const [step, setStep] = useState<SetupStep>("checking");
  const [tokenHash, setTokenHash] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordSaved, setPasswordSaved] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const url = new URL(window.location.href);
    const query = url.searchParams;
    const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
    const authError = query.get("error") ?? hash.get("error");
    const errorCode = query.get("error_code") ?? hash.get("error_code");
    const errorDescription = query.get("error_description") ?? hash.get("error_description");
    const token = query.get("token_hash");

    if (authError || errorCode || errorDescription) {
      setMessage(errorCode === "otp_expired"
        ? "This invitation link has expired or was already used. Ask your Campus Admin to send a new invitation."
        : "This invitation could not be verified. Ask your Campus Admin to send a new invitation.");
      setStep("error");
      window.history.replaceState(window.history.state, "", url.pathname);
      return;
    }

    if (token && query.get("type") === "invite") {
      try {
        sessionStorage.setItem(TOKEN_STORAGE_KEY, token);
        setTokenHash(token);
        query.delete("token_hash");
        query.delete("type");
        window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
        setStep("accept");
      } catch {
        setTokenHash(token);
        setMessage("This browser could not preserve the invitation token. Keep this page open while accepting the invitation.");
        setStep("accept");
      }
      return;
    }

    try {
      const storedToken = sessionStorage.getItem(TOKEN_STORAGE_KEY);
      if (storedToken) {
        setTokenHash(storedToken);
        setStep("accept");
        return;
      }
    } catch {
      // Continue with the signed-in session check below.
    }

    setStep("checking");
  }, []);

  useEffect(() => {
    if (authLoading || step !== "checking") return;
    if (user?.user_metadata.account_type === "direct_vendor_invitation") {
      if (roles.includes("vendor")) {
        if (roles.includes("student")) activateVendorMode();
        navigate("/vendor", { replace: true });
      } else {
        setStep("password");
      }
      return;
    }
    setMessage("This vendor invitation is missing or belongs to a different account. Open the invitation email or ask your Campus Admin to resend it.");
    setStep("error");
  }, [activateVendorMode, authLoading, navigate, roles, step, user]);

  const acceptInvitation = async () => {
    if (!tokenHash) {
      setMessage("This invitation link is missing its verification token. Ask your Campus Admin to send a new invitation.");
      setStep("error");
      return;
    }

    setLoading(true);
    setMessage("");
    try {
      const { data, error } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: "invite",
      });
      if (error || !data.user || !data.session) {
        try {
          sessionStorage.removeItem(TOKEN_STORAGE_KEY);
        } catch {
          // Ignore storage errors after a terminal verification response.
        }
        setTokenHash(null);
        setMessage(error?.code === "otp_expired"
          ? "This invitation link has expired or was already used. Ask your Campus Admin to send a new invitation."
          : "This invitation is invalid or has already been used. Ask your Campus Admin to send a new invitation.");
        setStep("error");
        return;
      }
      if (data.user.user_metadata.account_type !== "direct_vendor_invitation") {
        setMessage("This invitation is not for a direct vendor account.");
        setStep("error");
        return;
      }

      try {
        sessionStorage.removeItem(TOKEN_STORAGE_KEY);
      } catch {
        // The invitation has been consumed; the database operation remains authoritative.
      }
      setTokenHash(null);
      setStep("password");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to verify this invitation. You can retry while the link is valid.");
    } finally {
      setLoading(false);
    }
  };

  const completeSetup = async () => {
    if (!passwordSaved && (password.length < 8 || password.length > 72)) {
      setMessage("Password must be between 8 and 72 characters.");
      return;
    }
    if (!passwordSaved && password !== confirmPassword) {
      setMessage("Passwords do not match.");
      return;
    }

    setLoading(true);
    setMessage("");
    try {
      if (!passwordSaved) {
        const { error: passwordError } = await supabase.auth.updateUser({ password });
        if (passwordError) {
          setMessage(passwordError.message);
          return;
        }
        setPasswordSaved(true);
        setPassword("");
        setConfirmPassword("");
      }

      const { data, error } = await completeDirectVendorInvitationRpc("complete_direct_vendor_invitation");
      if (error || !data?.length) {
        setMessage(error?.message ?? "Vendor setup is not complete yet. Retry finalizing your account.");
        setStep("retry");
        return;
      }

      const roleResult = await refreshRoles();
      if (!roleResult.success || !roleResult.roles.includes("vendor")) {
        setMessage("Your password is set, but vendor access could not be refreshed. Retry finalizing your account.");
        setStep("retry");
        return;
      }
      if (roleResult.roles.includes("student")) activateVendorMode();
      navigate("/vendor", { replace: true });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to complete vendor setup. Retry finalizing your account.");
      setStep("retry");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <TopBar />
      <main className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-4 py-10">
        <Card className="w-full max-w-md space-y-5 p-6 sm:p-8">
          <div className="flex items-start gap-3">
            <Store className="mt-1 h-6 w-6 text-forest" />
            <div>
              <h1 className="font-display text-2xl font-bold text-navy">
                {step === "error" ? "Invitation unavailable" : "Complete your vendor invitation"}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {step === "error"
                  ? message
                  : "Set a password for your new vendor account to finish setup."}
              </p>
            </div>
          </div>

          {step === "checking" ? (
            <div className="flex justify-center py-4"><Loader2 className="h-6 w-6 animate-spin text-forest" /></div>
          ) : step === "accept" ? (
            <div className="space-y-4">
              <Button type="button" variant="cta" size="lg" className="w-full" disabled={loading} onClick={() => void acceptInvitation()}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Accept invitation"}
              </Button>
              {message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}
            </div>
          ) : step === "password" ? (
            <form onSubmit={(event) => { event.preventDefault(); void completeSetup(); }} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="vendor-account-password">Password</Label>
                <Input
                  id="vendor-account-password"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="vendor-account-confirm-password">Confirm password</Label>
                <Input
                  id="vendor-account-confirm-password"
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  required
                />
              </div>
              {message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}
              <Button type="submit" variant="cta" size="lg" className="w-full" disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Set password and finish setup"}
              </Button>
            </form>
          ) : step === "retry" ? (
            <div className="space-y-4">
              <p role="status" className="text-sm text-muted-foreground">{message}</p>
              <Button type="button" variant="cta" size="lg" className="w-full" disabled={loading} onClick={() => void completeSetup()}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Retry vendor setup"}
              </Button>
            </div>
          ) : (
            <Button asChild variant="outline" className="w-full">
              <Link to="/auth">Return to sign in</Link>
            </Button>
          )}
        </Card>
      </main>
    </div>
  );
};

export default SetVendorPassword;
