import { useCallback, useEffect, useState } from "react";
import { Loader2, University } from "lucide-react";
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
import { universities } from "@/lib/universities";

interface VendorApplication {
  id: string;
  user_id: string;
  university_id: string;
  restaurant_name: string;
  contact_number: string | null;
  description: string | null;
  cuisine: string | null;
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
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [reviewingId, setReviewingId] = useState<string | null>(null);

  useEffect(() => {
    if (!universityId && campusUniversityIds.length > 0) setUniversityId(campusUniversityIds[0]);
  }, [campusUniversityIds, universityId]);

  const loadDashboard = useCallback(async () => {
    if (!universityId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const [{ data: applicationData, error: applicationError }, { data: vendorData, error: vendorError }] = await Promise.all([
      supabase
        .from("vendor_applications")
        .select("id,user_id,university_id,restaurant_name,contact_number,description,cuisine,created_at")
        .eq("university_id", universityId)
        .eq("status", "pending")
        .order("created_at", { ascending: true }),
      supabase
        .from("restaurants")
        .select("id,name,cuisine,is_open")
        .eq("university_id", universityId)
        .order("name"),
    ]);

    if (applicationError || vendorError) {
      toast.error(applicationError?.message ?? vendorError?.message ?? "Unable to load campus administration data.");
      setApplications([]);
      setVendors([]);
      setLoading(false);
      return;
    }

    const rows = applicationData ?? [];
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
      toast.success(decision === "approve" ? "Vendor approved for this university." : "Application rejected.");
      await loadDashboard();
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

  const universityName = universities[universityId as keyof typeof universities]?.name ?? "Campus";

  return (
    <div className="min-h-screen bg-background">
      <TopBar />
      <main className="container space-y-6 py-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <Badge className="border-0 bg-forest text-primary-foreground">Campus admin</Badge>
            <h1 className="mt-2 font-display text-2xl font-bold text-navy">{universityName} vendors</h1>
            <p className="text-sm text-muted-foreground">Review vendor applications and manage your university's approved vendors.</p>
          </div>
          {campusUniversityIds.length > 1 && (
            <div className="w-full space-y-2 sm:w-64">
              <Label htmlFor="admin-university">University</Label>
              <Select value={universityId} onValueChange={setUniversityId}>
                <SelectTrigger id="admin-university"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {campusUniversityIds.map((id) => (
                    <SelectItem key={id} value={id}>
                      {universities[id as keyof typeof universities]?.name ?? id}
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
            <section className="space-y-3">
              <h2 className="font-display text-lg font-bold text-navy">Pending applications</h2>
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
                    <Badge variant="outline">Pending</Badge>
                  </div>
                  {application.description && <p className="text-sm">{application.description}</p>}
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
                      disabled={reviewingId === application.id}
                      onClick={() => void review(application.id, "reject")}
                    >
                      Reject
                    </Button>
                    <Button
                      variant="cta"
                      disabled={reviewingId === application.id}
                      onClick={() => void review(application.id, "approve")}
                    >
                      {reviewingId === application.id && <Loader2 className="h-4 w-4 animate-spin" />}
                      Approve vendor
                    </Button>
                  </div>
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

export default CampusAdminDashboard;
