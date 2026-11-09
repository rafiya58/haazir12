import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { studentSignupSchema } from "@/lib/studentSignup";
import { matchesUniversityEmail, universities, type UniversityId } from "@/lib/universities";
import { toast } from "sonner";
import { Utensils, GraduationCap, Store, Loader2, ShieldCheck } from "lucide-react";
import { z } from "zod";

type AccountType = "student" | "vendor";
type LoginType = AccountType | "campus_admin" | "platform_admin";
type RecoveryStep = "request" | "verify" | "password";
type AuthTab = "login" | "signup";

const vendorSignupSchema = z.object({
  email: z.string().trim().email("Enter a valid email").max(255),
  password: z.string().min(8, "Min 8 characters").max(72),
  fullName: z.string().trim().min(2, "Enter your name").max(80),
  contactNumber: z.string().trim().regex(/^\+?[0-9][0-9 ()-]{6,23}$/, "Enter a valid contact number"),
  university: z.enum(["iba", "habib"]),
  businessName: z.string().trim().min(2, "Enter your business name").max(100),
  businessDescription: z.string().trim().min(10, "Add a short business description").max(500),
  confirmPassword: z.string().min(1, "Confirm your password"),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

const loginSchema = z.object({
  email: z.string().trim().email("Enter a valid email").max(255),
  password: z.string().min(1, "Password required").max(72),
});

const recoveryEmailSchema = z.object({
  email: z.string().trim().email("Enter a valid email").max(255),
});

const recoveryOtpSchema = z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code");
const signupOtpSchema = recoveryOtpSchema;
const newPasswordSchema = z.string().min(8, "Min 8 characters").max(72);

const Auth = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  // Login form
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginAccountType, setLoginAccountType] = useState<LoginType>("student");
  const [loginUniversity, setLoginUniversity] = useState<UniversityId | "">("");

  // Signup form
  const [accountType, setAccountType] = useState<AccountType>("student");
  const [authTab, setAuthTab] = useState<AuthTab>("login");
  const [signupUniversity, setSignupUniversity] = useState<UniversityId | "">("");
  const [vendorUniversity, setVendorUniversity] = useState<UniversityId | "">("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [studentId, setStudentId] = useState("");
  const [contactNumber, setContactNumber] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [businessDescription, setBusinessDescription] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [signupOtpPending, setSignupOtpPending] = useState(false);
  const [signupEmailToVerify, setSignupEmailToVerify] = useState("");
  const [signupOtp, setSignupOtp] = useState("");
  const [showPasswordRecovery, setShowPasswordRecovery] = useState(false);
  const [recoveryStep, setRecoveryStep] = useState<RecoveryStep>("request");
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [recoveryOtp, setRecoveryOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = loginSchema.safeParse({ email: loginEmail, password: loginPassword });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    if (loginAccountType === "student") {
      if (!loginUniversity) {
        toast.error("Select your university");
        return;
      }
      if (!matchesUniversityEmail(parsed.data.email, loginUniversity)) {
        toast.error(`Use your @${universities[loginUniversity].domain} student email`);
        return;
      }
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: parsed.data.email,
        password: parsed.data.password,
      });
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success("Welcome back!");
      navigate(loginAccountType === "vendor" ? "/vendor-application" : "/");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to sign in.");
    } finally {
      setLoading(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();

    let parsedEmail: string;
    let parsedPassword: string;
    let parsedName: string;
    let parsedStudentId: string | undefined;
    let parsedVendor: {
      contactNumber: string;
      university: UniversityId;
      businessName: string;
      businessDescription: string;
    } | undefined;
    if (accountType === "student") {
      const parsed = studentSignupSchema.safeParse({
        email,
        fullName: name,
        studentId,
        password,
        confirmPassword,
      });
      if (!parsed.success) {
        toast.error(parsed.error.issues[0].message);
        return;
      }
      if (!signupUniversity) {
        toast.error("Select your university");
        return;
      }
      if (!matchesUniversityEmail(parsed.data.email, signupUniversity)) {
        toast.error(`Use your @${universities[signupUniversity].domain} student email`);
        return;
      }
      parsedEmail = parsed.data.email;
      parsedPassword = parsed.data.password;
      parsedName = parsed.data.fullName;
      parsedStudentId = parsed.data.studentId;
    } else {
      const parsed = vendorSignupSchema.safeParse({
        email,
        password,
        fullName: name,
        contactNumber,
        university: vendorUniversity,
        businessName,
        businessDescription,
        confirmPassword,
      });
      if (!parsed.success) {
        toast.error(parsed.error.issues[0].message);
        return;
      }
      parsedEmail = parsed.data.email;
      parsedPassword = parsed.data.password;
      parsedName = parsed.data.fullName;
      parsedVendor = {
        contactNumber: parsed.data.contactNumber,
        university: parsed.data.university,
        businessName: parsed.data.businessName,
        businessDescription: parsed.data.businessDescription,
      };
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: parsedEmail,
        password: parsedPassword,
        options: {
          emailRedirectTo: `${window.location.origin}/`,
          data: {
            full_name: parsedName,
            account_type: accountType,
            ...(accountType === "student" && signupUniversity
              ? { university: signupUniversity, student_id: parsedStudentId }
              : {}),
            ...(parsedVendor ? {
              vendor_university: parsedVendor.university,
              vendor_contact_number: parsedVendor.contactNumber,
              vendor_business_name: parsedVendor.businessName,
              vendor_business_description: parsedVendor.businessDescription,
            } : {}),
          },
        },
      });
      if (error) {
        if (accountType === "vendor" && /already registered|already exists/i.test(error.message)) {
          setLoginEmail(parsedEmail);
          setLoginAccountType("vendor");
          setAuthTab("login");
          toast.error("This email already has an account. Sign in with it, then submit your vendor application; your student access will remain.");
          return;
        }
        toast.error(error.message);
        return;
      }
      if (data.session) {
        toast.success("Your account is registered and signed in. Email confirmation is disabled, so no verification code was required.");
        navigate(accountType === "vendor" ? "/vendor-application" : "/");
        return;
      }
      setSignupEmailToVerify(parsedEmail);
      setSignupOtp("");
      setSignupOtpPending(true);
      toast.success("Check your email for a verification code.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to create your account.");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifySignupOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = signupOtpSchema.safeParse(signupOtp);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.verifyOtp({
        email: signupEmailToVerify,
        token: parsed.data,
        type: "signup",
      });
      if (error) {
        toast.error(error.message);
        return;
      }
      setSignupOtpPending(false);
      setSignupOtp("");
      toast.success("Email verified successfully.");
      if (accountType === "vendor") {
        navigate("/vendor-application");
      } else {
        navigate("/");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to verify your email.");
    } finally {
      setLoading(false);
    }
  };

  const handleResendSignupOtp = async () => {
    setLoading(true);
    try {
      const { error } = await supabase.auth.resend({
        type: "signup",
        email: signupEmailToVerify,
        options: { emailRedirectTo: `${window.location.origin}/` },
      });
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success("A new verification code has been sent.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to resend the verification code.");
    } finally {
      setLoading(false);
    }
  };

  const handleRequestRecoveryOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = recoveryEmailSchema.safeParse({ email: recoveryEmail });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
        redirectTo: `${window.location.origin}/reset-password?mode=recovery`,
      });
      if (error) {
        toast.error(error.message);
        return;
      }
      setRecoveryEmail(parsed.data.email);
      setRecoveryStep("verify");
      toast.success("If an account exists for that email, check your inbox for a recovery code or reset link.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to request a recovery code.");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyRecoveryOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = recoveryOtpSchema.safeParse(recoveryOtp);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.verifyOtp({
        email: recoveryEmail,
        token: parsed.data,
        type: "recovery",
      });
      if (error) {
        toast.error(error.message);
        return;
      }
      setRecoveryStep("password");
      toast.success("Email verified. Choose a new password.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to verify the recovery code.");
    } finally {
      setLoading(false);
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = newPasswordSchema.safeParse(newPassword);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: parsed.data });
      if (error) {
        toast.error(error.message);
        return;
      }
      setLoginEmail(recoveryEmail);
      setLoginPassword("");
      setRecoveryOtp("");
      setNewPassword("");
      setRecoveryStep("request");
      setShowPasswordRecovery(false);
      toast.success("Password updated successfully.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to update your password.");
    } finally {
      setLoading(false);
    }
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
          {showPasswordRecovery ? (
            <div className="space-y-5">
              <div>
                <h2 className="font-display text-xl font-semibold">
                  {recoveryStep === "request"
                    ? "Reset your password"
                    : recoveryStep === "verify"
                      ? "Enter your recovery code"
                      : "Choose a new password"}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {recoveryStep === "request"
                    ? "We'll email you password reset instructions."
                    : recoveryStep === "verify"
                      ? `Enter the 6-digit code sent to ${recoveryEmail}, or open the reset link in that email.`
                      : "Your email is verified. Set a new password for your account."}
                </p>
              </div>

              {recoveryStep === "request" ? (
                <form onSubmit={handleRequestRecoveryOtp} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="recovery-email">Email</Label>
                    <Input
                      id="recovery-email"
                      type="email"
                      autoComplete="email"
                      value={recoveryEmail}
                      onChange={(e) => setRecoveryEmail(e.target.value)}
                    />
                  </div>
                  <Button type="submit" variant="cta" size="lg" className="w-full" disabled={loading}>
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send reset instructions"}
                  </Button>
                </form>
              ) : recoveryStep === "verify" ? (
                <form onSubmit={handleVerifyRecoveryOtp} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="recovery-otp">6-digit code</Label>
                    <Input
                      id="recovery-otp"
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={6}
                      value={recoveryOtp}
                      onChange={(e) => setRecoveryOtp(e.target.value)}
                    />
                  </div>
                  <Button type="submit" variant="cta" size="lg" className="w-full" disabled={loading}>
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verify code"}
                  </Button>
                  <Button
                    type="button"
                    variant="link"
                    className="w-full"
                    disabled={loading}
                    onClick={() => setRecoveryStep("request")}
                  >
                    Resend code or use another email
                  </Button>
                </form>
              ) : (
                <form onSubmit={handleUpdatePassword} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="new-password">New password</Label>
                    <Input
                      id="new-password"
                      type="password"
                      autoComplete="new-password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                    />
                  </div>
                  <Button type="submit" variant="cta" size="lg" className="w-full" disabled={loading}>
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Update password"}
                  </Button>
                </form>
              )}

              <Button
                type="button"
                variant="link"
                className="w-full"
                disabled={loading}
                onClick={() => {
                  setShowPasswordRecovery(false);
                  setRecoveryStep("request");
                  setRecoveryOtp("");
                  setNewPassword("");
                }}
              >
                Back to sign in
              </Button>
            </div>
          ) : (
            <Tabs value={authTab} onValueChange={(value) => setAuthTab(value as AuthTab)} className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="login">Sign in</TabsTrigger>
                <TabsTrigger value="signup">Create account</TabsTrigger>
              </TabsList>

              <TabsContent value="login" className="mt-6">
                <form onSubmit={handleLogin} className="space-y-4">
                  <RadioGroup
                    value={loginAccountType}
                    onValueChange={(value) => setLoginAccountType(value as LoginType)}
                    className="grid grid-cols-2 gap-2"
                  >
                    <Label
                      htmlFor="login-student"
                      className={`flex cursor-pointer items-center gap-2 rounded-lg border p-3 text-sm transition-colors ${
                        loginAccountType === "student" ? "border-forest bg-accent" : "border-border"
                      }`}
                    >
                      <RadioGroupItem id="login-student" value="student" className="sr-only" />
                      <GraduationCap className="h-4 w-4 text-forest" />
                      <span className="font-medium">Student</span>
                    </Label>
                    <Label
                      htmlFor="login-vendor"
                      className={`flex cursor-pointer items-center gap-2 rounded-lg border p-3 text-sm transition-colors ${
                        loginAccountType === "vendor" ? "border-forest bg-accent" : "border-border"
                      }`}
                    >
                      <RadioGroupItem id="login-vendor" value="vendor" className="sr-only" />
                      <ShieldCheck className="h-4 w-4 text-forest" />
                      <span className="font-medium">Vendor</span>
                    </Label>
                    <Label
                      htmlFor="login-campus-admin"
                      className={`flex cursor-pointer items-center gap-2 rounded-lg border p-3 text-sm transition-colors ${
                        loginAccountType === "campus_admin" ? "border-forest bg-accent" : "border-border"
                      }`}
                    >
                      <RadioGroupItem id="login-campus-admin" value="campus_admin" className="sr-only" />
                      <Store className="h-4 w-4 text-forest" />
                      <span className="font-medium">Campus admin</span>
                    </Label>
                    <Label
                      htmlFor="login-platform-admin"
                      className={`flex cursor-pointer items-center gap-2 rounded-lg border p-3 text-sm transition-colors ${
                        loginAccountType === "platform_admin" ? "border-forest bg-accent" : "border-border"
                      }`}
                    >
                      <RadioGroupItem id="login-platform-admin" value="platform_admin" className="sr-only" />
                      <ShieldCheck className="h-4 w-4 text-forest" />
                      <span className="font-medium">Platform admin</span>
                    </Label>
                  </RadioGroup>

                  {loginAccountType === "student" && (
                    <div className="space-y-2">
                      <Label htmlFor="login-university">University</Label>
                      <Select
                        value={loginUniversity}
                        onValueChange={(value) => setLoginUniversity(value as UniversityId)}
                      >
                        <SelectTrigger id="login-university">
                          <SelectValue placeholder="Select your university" />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(universities).map(([id, university]) => (
                            <SelectItem key={id} value={id}>
                              {university.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="login-email">Email</Label>
                    <Input
                      id="login-email"
                      type="email"
                      autoComplete="email"
                      placeholder={
                        loginAccountType === "student" && loginUniversity
                          ? `student@${universities[loginUniversity].domain}`
                          : "you@example.com"
                      }
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="login-pw">Password</Label>
                    <Input
                      id="login-pw"
                      type="password"
                      autoComplete="current-password"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                    />
                  </div>
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      variant="link"
                      className="h-auto p-0"
                      onClick={() => {
                        setRecoveryEmail(loginEmail);
                        setRecoveryStep("request");
                        setShowPasswordRecovery(true);
                      }}
                    >
                      Forgot password?
                    </Button>
                  </div>
                  <Button type="submit" variant="cta" size="lg" className="w-full" disabled={loading}>
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sign in"}
                  </Button>
                  <p className="text-center text-xs text-muted-foreground">
                    Vendor accounts use the Vendor option. University admins sign in using an invitation; platform admins are provisioned by backend operators.
                  </p>
                </form>
              </TabsContent>

              <TabsContent value="signup" className="mt-6 space-y-4">
                {signupOtpPending ? (
                  <div className="space-y-4">
                    <div>
                      <h2 className="font-display text-xl font-semibold">Verify your email</h2>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Enter the 6-digit code sent to {signupEmailToVerify}.
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Check your spam folder if it is missing. Supabase's default email service only
                        delivers to project team addresses; configure custom SMTP to send codes to students.
                      </p>
                    </div>
                    <form onSubmit={handleVerifySignupOtp} className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="signup-otp">Email verification code</Label>
                        <Input
                          id="signup-otp"
                          type="text"
                          inputMode="numeric"
                          autoComplete="one-time-code"
                          maxLength={6}
                          value={signupOtp}
                          onChange={(e) => setSignupOtp(e.target.value)}
                        />
                      </div>
                      <Button type="submit" variant="cta" size="lg" className="w-full" disabled={loading}>
                        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verify email"}
                      </Button>
                    </form>
                    <Button
                      type="button"
                      variant="link"
                      className="w-full"
                      disabled={loading}
                      onClick={handleResendSignupOtp}
                    >
                      Resend verification code
                    </Button>
                    <Button
                      type="button"
                      variant="link"
                      className="w-full"
                      disabled={loading}
                      onClick={() => {
                        setSignupOtpPending(false);
                        setSignupOtp("");
                      }}
                    >
                      Back to signup
                    </Button>
                  </div>
                ) : (
                  <>
                <RadioGroup
                  value={accountType}
                  onValueChange={(value) => setAccountType(value as AccountType)}
                  className="grid grid-cols-2 gap-2"
                >
                  <Label
                    htmlFor="acc-student"
                    className={`flex cursor-pointer items-center gap-2 rounded-lg border p-3 text-sm transition-colors ${
                      accountType === "student" ? "border-forest bg-accent" : "border-border"
                    }`}
                  >
                    <RadioGroupItem id="acc-student" value="student" className="sr-only" />
                    <GraduationCap className="h-4 w-4 text-forest" />
                    <span className="font-medium">Student</span>
                  </Label>
                  <Label
                    htmlFor="acc-vendor"
                    className={`flex cursor-pointer items-center gap-2 rounded-lg border p-3 text-sm transition-colors ${
                      accountType === "vendor" ? "border-forest bg-accent" : "border-border"
                    }`}
                  >
                    <RadioGroupItem id="acc-vendor" value="vendor" className="sr-only" />
                    <ShieldCheck className="h-4 w-4 text-forest" />
                    <span className="font-medium">Vendor</span>
                  </Label>
                </RadioGroup>

                {accountType === "student" ? (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="signup-university">University</Label>
                      <Select
                        value={signupUniversity}
                        onValueChange={(value) => setSignupUniversity(value as UniversityId)}
                      >
                        <SelectTrigger id="signup-university">
                          <SelectValue placeholder="Select your university" />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(universities).map(([id, university]) => (
                            <SelectItem key={id} value={id}>
                              {university.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-start gap-3 rounded-lg border border-forest/20 bg-accent p-3 text-xs text-accent-foreground">
                      <GraduationCap className="mt-0.5 h-4 w-4 shrink-0 text-forest" />
                      <p>
                        Use your selected university's student email:
                        {" "}<span className="font-semibold">
                          {signupUniversity
                            ? `@${universities[signupUniversity].domain}`
                            : "@khi.iba.edu.pk or @st.habib.edu.pk"}
                        </span>.
                      </p>
                    </div>
                  </>
                ) : (
                  <div className="flex items-start gap-3 rounded-lg border border-forest/20 bg-accent p-3 text-xs text-accent-foreground">
                    <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-forest" />
                    <p>Use any email and provide your business details. Your account is created first; the university reviews your application afterward. If you already have a student account, sign in with it and apply as a vendor to keep both roles on one account.</p>
                  </div>
                )}

                <form onSubmit={handleSignup} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="su-name">Full name</Label>
                    <Input id="su-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ali Khan" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="su-email">{accountType === "student" ? "Student email" : "Email"}</Label>
                    <Input
                      id="su-email"
                      type="email"
                      autoComplete="email"
                      placeholder={
                        accountType === "student" && signupUniversity
                          ? `student@${universities[signupUniversity].domain}`
                          : accountType === "student"
                            ? "Select your university first"
                            : "you@example.com"
                      }
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                  {accountType === "student" && (
                    <div className="space-y-2">
                      <Label htmlFor="su-student-id">Student ID</Label>
                      <Input
                        id="su-student-id"
                        autoComplete="off"
                        value={studentId}
                        onChange={(e) => setStudentId(e.target.value)}
                        placeholder="Your university student ID"
                      />
                    </div>
                  )}
                  {accountType === "vendor" && (
                    <>
                      <div className="space-y-2">
                        <Label htmlFor="vendor-university-signup">University</Label>
                        <Select
                          value={vendorUniversity}
                          onValueChange={(value) => setVendorUniversity(value as UniversityId)}
                        >
                          <SelectTrigger id="vendor-university-signup">
                            <SelectValue placeholder="Select the university" />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.entries(universities).map(([id, university]) => (
                              <SelectItem key={id} value={id}>{university.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="vendor-business-name-signup">Business name</Label>
                        <Input
                          id="vendor-business-name-signup"
                          value={businessName}
                          onChange={(event) => setBusinessName(event.target.value)}
                          maxLength={100}
                          placeholder="Your restaurant or business name"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="vendor-contact-signup">Contact number</Label>
                        <Input
                          id="vendor-contact-signup"
                          type="tel"
                          autoComplete="tel"
                          value={contactNumber}
                          onChange={(event) => setContactNumber(event.target.value)}
                          maxLength={25}
                          placeholder="+92 300 1234567"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="vendor-description-signup">Short business description</Label>
                        <Textarea
                          id="vendor-description-signup"
                          value={businessDescription}
                          onChange={(event) => setBusinessDescription(event.target.value)}
                          maxLength={500}
                          placeholder="Briefly describe your business"
                        />
                      </div>
                    </>
                  )}
                  <div className="space-y-2">
                    <Label htmlFor="su-pw">Password</Label>
                    <Input id="su-pw" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="su-confirm-pw">Confirm password</Label>
                    <Input
                      id="su-confirm-pw"
                      type="password"
                      autoComplete="new-password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                    />
                  </div>
                  <Button type="submit" variant="cta" size="lg" className="w-full" disabled={loading}>
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : accountType === "student" ? "Create student account" : "Create vendor account"}
                  </Button>
                </form>
                  </>
                )}
              </TabsContent>
            </Tabs>
          )}

          <div className="mt-6 flex items-center gap-2 text-[11px] text-muted-foreground">
            <Store className="h-3.5 w-3.5" />
            <span>University admins are invite-only; platform admins are provisioned by backend operators.</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Auth;
