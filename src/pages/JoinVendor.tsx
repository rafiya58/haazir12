import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, Store } from "lucide-react";
import { TopBar } from "@/components/TopBar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/integrations/supabase/client";

const INVITATION_TOKEN_STORAGE_KEY = "haazir:vendor-invitation-token";
const ACCEPTED_VENDOR_USER_STORAGE_KEY = "haazir:accepted-vendor-user";

type AcceptVendorInvitationResponse = {
  data: { application_id: string; restaurant_id: string; university_id: string }[] | null;
  error: { message: string } | null;
};

const acceptVendorInvitationRpc = supabase.rpc.bind(supabase) as unknown as (
  functionName: "accept_vendor_invitation",
  args: { _token_hash: string },
) => PromiseLike<AcceptVendorInvitationResponse>;

const hashToken = async (token: string) => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
};

const JoinVendor = () => {
  const { user, loading: authLoading, roles, refreshRoles, activateVendorMode, signOut } = useAuth();
  const [invitationToken, setInvitationToken] = useState<string | null>(null);
  const [tokenLoaded, setTokenLoaded] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [working, setWorking] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [acceptanceRecorded, setAcceptanceRecorded] = useState(false);
  const [terminalFailure, setTerminalFailure] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const url = new URL(window.location.href);
    const hasUrlToken = url.searchParams.has("token");
    let token = url.searchParams.get("token");
    let tokenPersisted = false;
    try {
      if (token) {
        sessionStorage.setItem(INVITATION_TOKEN_STORAGE_KEY, token);
        tokenPersisted = true;
      } else {
        token = sessionStorage.getItem(INVITATION_TOKEN_STORAGE_KEY);
        tokenPersisted = Boolean(token);
      }
      if (hasUrlToken) sessionStorage.removeItem(ACCEPTED_VENDOR_USER_STORAGE_KEY);
    } catch {
      // Keep using the in-memory token if session storage is unavailable.
    }
    if (hasUrlToken && (!token || tokenPersisted)) {
      url.searchParams.delete("token");
      window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    }
    setInvitationToken(token);
    setTokenLoaded(true);
  }, []);

  useEffect(() => {
    if (!user) return;
    try {
      if (sessionStorage.getItem(ACCEPTED_VENDOR_USER_STORAGE_KEY) !== user.id) return;
      if (roles.includes("vendor")) {
        setAccepted(true);
        setAcceptanceRecorded(false);
        setMessage("");
        sessionStorage.removeItem(ACCEPTED_VENDOR_USER_STORAGE_KEY);
      } else if (!authLoading) {
        setAcceptanceRecorded(true);
        setMessage("The invitation was accepted, but your vendor access could not be refreshed. Retry checking your access.");
      }
    } catch {
      // The current acceptance state remains available in component state.
    }
  }, [authLoading, roles, user]);

  const clearInvitationToken = () => {
    try {
      sessionStorage.removeItem(INVITATION_TOKEN_STORAGE_KEY);
    } catch {
      // Clear the in-memory copy and URL even if session storage is unavailable.
    }
    const url = new URL(window.location.href);
    if (url.searchParams.has("token")) {
      url.searchParams.delete("token");
      window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    }
    setInvitationToken(null);
  };

  const refreshVendorRole = async () => {
    const result = await refreshRoles();
    if (!result.success) {
      setMessage("The invitation was accepted, but your vendor access could not be refreshed. Retry checking your access.");
      return false;
    }
    if (!result.roles.includes("vendor")) {
      setMessage("The invitation was accepted, but vendor access is not visible yet. Retry checking your access.");
      return false;
    }
    if (result.roles.includes("student")) activateVendorMode();
    setAccepted(true);
    setAcceptanceRecorded(false);
    setMessage("");
    return true;
  };

  const retryVendorRoleRefresh = async () => {
    setWorking(true);
    try {
      await refreshVendorRole();
    } catch {
      setMessage("Your invitation was accepted, but vendor access could not be refreshed. Please retry.");
    } finally {
      setWorking(false);
    }
  };

  const signIn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setWorking(true);
    setMessage("");
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) {
        setMessage(error.message);
        return;
      }
      setPassword("");
      setMessage("Signed in. Accept the invitation to activate vendor access on this account.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to sign in to your existing account.");
    } finally {
      setWorking(false);
    }
  };

  const acceptInvitation = async () => {
    if (!user || !invitationToken) return;

    setWorking(true);
    setMessage("");
    try {
      const tokenHash = await hashToken(invitationToken);
      const { data, error } = await acceptVendorInvitationRpc("accept_vendor_invitation", {
        _token_hash: tokenHash,
      });
      if (error || !data?.length) {
        const detail = error?.message.toLowerCase() ?? "";
        if (error && detail.includes("already used")) {
          const roleResult = await refreshRoles();
          if (roleResult.success && roleResult.roles.includes("vendor")) {
            if (roleResult.roles.includes("student")) activateVendorMode();
            clearInvitationToken();
            setAccepted(true);
            setAcceptanceRecorded(false);
            setMessage("");
            return;
          }
        }
        if (
          detail.includes("invalid or expired vendor invitation")
          || detail.includes("invalid, expired, or already used vendor invitation")
          || detail.includes("invalid vendor invitation")
          || detail.includes("invalid, expired, or revoked vendor invitation")
        ) {
          clearInvitationToken();
          setTerminalFailure(true);
        }
        if (detail.includes("another account")) {
          setMessage("This invitation belongs to a different account. Sign out and use the existing account it was sent to.");
        } else if (detail.includes("expired") || detail.includes("already used") || detail.includes("invalid") || detail.includes("revoked")) {
          setMessage("This invitation link is expired, revoked, invalid, or already used. Ask your Campus Admin to send a new invitation.");
        } else {
          setMessage("We couldn't accept this invitation. Confirm you are signed in to the invited account, or ask your Campus Admin for a new link.");
        }
        return;
      }

      setAcceptanceRecorded(true);
      clearInvitationToken();
      try {
        sessionStorage.setItem(ACCEPTED_VENDOR_USER_STORAGE_KEY, user.id);
      } catch {
        // Continue; the current component can still retry the role refresh.
      }
      await refreshVendorRole();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to accept this vendor invitation.");
    } finally {
      setWorking(false);
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
                {accepted ? "Vendor access activated" : "Join as a vendor"}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {accepted
                  ? "Your existing account now has vendor access. Your other account roles and password are unchanged."
                  : "Accept this invitation using the existing Haazir account it was sent to. No new account or password reset is needed."}
              </p>
            </div>
          </div>

          {!tokenLoaded || authLoading ? (
            <div className="flex justify-center py-4"><Loader2 className="h-6 w-6 animate-spin text-forest" /></div>
          ) : accepted ? (
            <Button asChild variant="cta" size="lg" className="w-full">
              <Link to="/vendor">Open vendor dashboard</Link>
            </Button>
          ) : acceptanceRecorded ? (
            <div className="space-y-4">
              <Button type="button" variant="cta" size="lg" className="w-full" disabled={working} onClick={() => void retryVendorRoleRefresh()}>
                {working ? <Loader2 className="h-4 w-4 animate-spin" /> : "Retry checking vendor access"}
              </Button>
              {user && (
                <Button type="button" variant="link" className="w-full" disabled={working} onClick={() => void signOut()}>
                  Sign out
                </Button>
              )}
            </div>
          ) : terminalFailure ? (
            <p role="alert" className="text-sm text-destructive">
              {message || "This invitation link is invalid, expired, revoked, or already used. Ask your Campus Admin to send a new invitation."}
            </p>
          ) : !invitationToken ? (
            <p role="alert" className="text-sm text-destructive">
              This invitation link is missing its token. Ask your Campus Admin to send a new invitation.
            </p>
          ) : user ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">Signed in as {user.email ?? "your Haazir account"}.</p>
              <Button type="button" variant="cta" size="lg" className="w-full" disabled={working} onClick={() => void acceptInvitation()}>
                {working ? <Loader2 className="h-4 w-4 animate-spin" /> : "Accept invitation"}
              </Button>
              <Button type="button" variant="link" className="w-full" disabled={working} onClick={() => void signOut()}>
                Sign out and use a different account
              </Button>
            </div>
          ) : (
            <form onSubmit={signIn} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="vendor-invite-email">Email for your existing account</Label>
                <Input
                  id="vendor-invite-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="vendor-invite-password">Existing password</Label>
                <Input
                  id="vendor-invite-password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
              </div>
              <Button type="submit" variant="cta" size="lg" className="w-full" disabled={working}>
                {working ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sign in"}
              </Button>
            </form>
          )}

          {message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}
        </Card>
      </main>
    </div>
  );
};

export default JoinVendor;
