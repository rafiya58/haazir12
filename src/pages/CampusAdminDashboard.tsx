import { useCallback, useEffect, useState } from "react";
import { DollarSign, Loader2, ShoppingBag, University, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { TopBar } from "@/components/TopBar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/integrations/supabase/client";

interface Campus {
  id: string;
  name: string;
}

interface CampusOrder {
  id: string;
  status: string;
  total: number;
  created_at: string;
  payment_status: string;
}

interface VendorApplication {
  id: string;
  user_id: string;
  university_id: string;
  restaurant_name: string;
  contact_number: string | null;
  description: string | null;
  cuisine: string | null;
  status: "pending" | "approved_pending_acceptance";
  created_at: string;
  applicant_name: string | null;
  applicant_email: string | null;
}

interface ApprovedVendor {
  id: string;
  name: string;
  cuisine: string | null;
  is_open: boolean;
}

const CampusAdminDashboard = () => {
  const { campusUniversityIds } = useAuth();
  const [universityId, setUniversityId] = useState("");
  const [applications, setApplications] = useState<VendorApplication[]>([]);
  const [vendors, setVendors] = useState<ApprovedVendor[]>([]);
  const [campuses, setCampuses] = useState<Campus[]>([]);
  const [orders, setOrders] = useState<CampusOrder[]>([]);
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [invitingId, setInvitingId] = useState<string | null>(null);

  useEffect(() => {
    if (!universityId && campusUniversityIds.length > 0) setUniversityId(campusUniversityIds[0]);
  }, [campusUniversityIds, universityId]);

  useEffect(() => {
    let active = true;
    const loadCampuses = async () => {
      if (campusUniversityIds.length === 0) return;
      const { data, error } = await supabase
        .from("universities")
        .select("id,name")
        .in("id", campusUniversityIds);
      if (!active) return;
      if (error) {
        toast.error(`Unable to load campus details: ${error.message}`);
        return;
      }
      setCampuses(data ?? []);
    };
    void loadCampuses();
    return () => { active = false; };
  }, [campusUniversityIds]);

  const loadDashboard = useCallback(async () => {
    if (!universityId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const [
      { data: applicationData, error: applicationError },
      { data: vendorData, error: vendorError },
      { data: orderData, error: orderError },
    ] = await Promise.all([
      supabase
        .from("vendor_applications")
        .select("id,user_id,university_id,restaurant_name,contact_number,description,cuisine,status,created_at")
        .eq("university_id", universityId)
        .in("status", ["pending", "approved_pending_acceptance"])
        .order("created_at", { ascending: true }),
      supabase
        .from("restaurants")
        .select("id,name,cuisine,is_open")
        .eq("university_id", universityId)
        .order("name"),
      supabase
        .from("orders")
        .select("id,status,total,created_at,payment_status,restaurants!inner(university_id)")
        .eq("restaurants.university_id", universityId)
        .order("created_at", { ascending: false }),
    ]);

    if (applicationError || vendorError || orderError) {
      toast.error(applicationError?.message ?? vendorError?.message ?? orderError?.message ?? "Unable to load campus administration data.");
      setApplications([]);
      setVendors([]);
      setOrders([]);
      setLoading(false);
      return;
    }

    const rows = applicationData ?? [];
    setOrders((orderData ?? []) as unknown as CampusOrder[]);
    if (rows.length === 0) {
      setApplications([]);
    } else {
      const { data: profiles, error: profileError } = await supabase
        .from("profiles")
        .select("id,email,full_name")
        .in("id", rows.map((row) => row.user_id));
      if (profileError) {
        toast.error(`Unable to load applicant details: ${profileError.message}`);
        setApplications([]);
        setVendors((vendorData ?? []) as ApprovedVendor[]);
        setLoading(false);
        return;
      }
      const byId = new Map((profiles ?? []).map((profile) => [profile.id, profile]));
      setApplications(rows.map((row) => {
        const profile = byId.get(row.user_id);
        return {
          ...row,
          applicant_name: profile?.full_name ?? null,
          applicant_email: profile?.email ?? null,
        };
      }));
    }
    setVendors((vendorData ?? []) as ApprovedVendor[]);
    setLoading(false);
  }, [universityId]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const sendVendorInvitation = async (applicationId: string, afterApproval = false) => {
    setInvitingId(applicationId);
    try {
      const { data, error } = await supabase.functions.invoke("invite-vendor", {
        body: { application_id: applicationId },
      });
      if (error || data?.invitation_sent !== true) {
        const detail = error?.message ?? "The invitation service returned an incomplete response.";
        toast.error(afterApproval
          ? `Approval succeeded, but invitation email failed. The application remains awaiting acceptance. ${detail}`
          : `Invitation email failed. The application remains awaiting acceptance. ${detail}`);
        return;
      }
      toast.success(afterApproval
        ? "Approval and email sent successfully."
        : "Invitation email sent successfully.");
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Unable to send the invitation email.";
      toast.error(afterApproval
        ? `Approval succeeded, but invitation email failed. The application remains awaiting acceptance. ${detail}`
        : `Invitation email failed. The application remains awaiting acceptance. ${detail}`);
    } finally {
      setInvitingId(null);
      await loadDashboard();
    }
  };

  const review = async (applicationId: string, decision: "approve" | "reject") => {
    setReviewingId(applicationId);
    try {
      const { error } = await supabase.rpc("review_vendor_application", {
        _application_id: applicationId,
        _decision: decision,
        _review_note: reviewNotes[applicationId]?.trim() ?? "",
      });
      if (error) {
        toast.error(error.message);
        return;
      }
      if (decision === "approve") {
        await sendVendorInvitation(applicationId, true);
      } else {
        toast.success("Application rejected.");
        await loadDashboard();
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to review this application.");
    } finally {
      setReviewingId(null);
    }
  };

  const toggleVendor = async (vendor: ApprovedVendor) => {
    const { error } = await supabase
      .from("restaurants")
      .update({ is_open: !vendor.is_open })
      .eq("id", vendor.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`${vendor.name} is now ${vendor.is_open ? "closed" : "open"}.`);
    await loadDashboard();
  };

  const universityName = campuses.find((campus) => campus.id === universityId)?.name ?? "Campus";
  const revenue = orders
    .filter((order) => order.status !== "cancelled")
    .reduce((sum, order) => sum + Number(order.total), 0);
  const pendingPayments = orders.filter((order) => order.payment_status === "pending").length;

  return (
    <div className="min-h-screen bg-background">
      <TopBar />
      <main className="container space-y-6 py-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <Badge className="border-0 bg-forest text-primary-foreground">Campus admin</Badge>
            <h1 className="mt-2 font-display text-2xl font-bold text-navy">{universityName} overview</h1>
            <p className="text-sm text-muted-foreground">Campus order analytics and vendor approvals.</p>
          </div>
          {campusUniversityIds.length > 1 && (
            <div className="w-full space-y-2 sm:w-64">
              <Label htmlFor="admin-university">University</Label>
              <Select value={universityId} onValueChange={setUniversityId}>
                <SelectTrigger id="admin-university"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {campusUniversityIds.map((id) => (
                    <SelectItem key={id} value={id}>
                      {campuses.find((campus) => campus.id === id)?.name ?? id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-forest" /></div>
        ) : (
          <>
            <section className="grid gap-3 sm:grid-cols-3">
              <StatCard icon={ShoppingBag} label="Orders" value={orders.length.toString()} />
              <StatCard icon={DollarSign} label="Revenue" value={`Rs ${revenue.toFixed(0)}`} />
              <StatCard icon={University} label="Pending payments" value={pendingPayments.toString()} />
            </section>

            <section className="space-y-3">
              <h2 className="font-display text-lg font-bold text-navy">Approval required</h2>
              {applications.length === 0 ? (
                <Card className="p-6 text-center text-sm text-muted-foreground">No vendor applications need review.</Card>
              ) : applications.map((application) => (
                <Card key={application.id} className="space-y-4 p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="font-semibold text-navy">{application.restaurant_name}</h3>
                      <p className="text-sm text-muted-foreground">
                        {application.applicant_name ?? "Applicant"}
                        {application.applicant_email && ` · ${application.applicant_email}`}
                      </p>
                      {application.contact_number && (
                        <p className="text-sm text-muted-foreground">Contact: {application.contact_number}</p>
                      )}
                      <p className="mt-1 text-xs text-muted-foreground">
                        Submitted {new Date(application.created_at).toLocaleDateString()}
                        {application.cuisine && ` · ${application.cuisine}`}
                      </p>
                    </div>
                    <Badge variant="outline">
                      {application.status === "pending" ? "Pending" : "Approved · awaiting acceptance"}
                    </Badge>
                  </div>
                  {application.description && <p className="text-sm">{application.description}</p>}
                  {application.status === "pending" ? (
                    <>
                      <div className="space-y-2">
                        <Label htmlFor={`review-${application.id}`}>Decision note (optional)</Label>
                        <Textarea
                          id={`review-${application.id}`}
                          value={reviewNotes[application.id] ?? ""}
                          onChange={(event) => setReviewNotes((current) => ({ ...current, [application.id]: event.target.value }))}
                          maxLength={500}
                        />
                      </div>
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          disabled={reviewingId === application.id || invitingId !== null}
                          onClick={() => void review(application.id, "reject")}
                        >
                          Reject
                        </Button>
                        <Button
                          variant="cta"
                          disabled={reviewingId === application.id || invitingId !== null}
                          onClick={() => void review(application.id, "approve")}
                        >
                          {(reviewingId === application.id || invitingId === application.id) && <Loader2 className="h-4 w-4 animate-spin" />}
                          Approve vendor
                        </Button>
                      </div>
                    </>
                  ) : (
                    <div className="flex justify-end">
                      <Button
                        variant="cta"
                        disabled={reviewingId === application.id || invitingId !== null}
                        onClick={() => void sendVendorInvitation(application.id)}
                      >
                        {invitingId === application.id && <Loader2 className="h-4 w-4 animate-spin" />}
                        Resend invitation
                      </Button>
                    </div>
                  )}
                </Card>
              ))}
            </section>

            <section className="space-y-3">
              <h2 className="flex items-center gap-2 font-display text-lg font-bold text-navy">
                <University className="h-5 w-5 text-forest" /> Approved vendors
              </h2>
              {vendors.length === 0 ? (
                <Card className="p-6 text-center text-sm text-muted-foreground">No vendors are approved yet.</Card>
              ) : (
                <Card className="divide-y p-4">
                  {vendors.map((vendor) => (
                    <div key={vendor.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                      <div>
                        <p className="font-medium text-navy">{vendor.name}</p>
                        <p className="text-xs text-muted-foreground">{vendor.cuisine ?? "Campus vendor"}</p>
                      </div>
                      <Button
                        size="sm"
                        variant={vendor.is_open ? "outline" : "cta"}
                        onClick={() => void toggleVendor(vendor)}
                      >
                        {vendor.is_open ? "Close" : "Open"}
                      </Button>
                    </div>
                  ))}
                </Card>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
};

const StatCard = ({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) => (
  <Card className="p-5">
    <div className="flex items-center justify-between">
      <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
      <Icon className="h-4 w-4 text-forest" />
    </div>
    <p className="mt-2 font-display text-3xl font-bold text-navy">{value}</p>
  </Card>
);

export default CampusAdminDashboard;
