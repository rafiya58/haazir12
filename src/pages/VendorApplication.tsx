import { FormEvent, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { Loader2, Store } from "lucide-react";
import { toast } from "sonner";
import { TopBar } from "@/components/TopBar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { universities } from "@/lib/universities";

interface VendorApplicationRecord {
  id: string;
  university_id: string;
  restaurant_name: string;
  contact_number: string | null;
  description: string | null;
  cuisine: string | null;
  status: "pending" | "approved" | "rejected";
  review_note: string | null;
}

const VendorApplication = () => {
  const { user, roles, universityIds, refreshRoles } = useAuth();
  const [application, setApplication] = useState<VendorApplicationRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [universityId, setUniversityId] = useState("");
  const [restaurantName, setRestaurantName] = useState("");
  const [contactNumber, setContactNumber] = useState("");
  const [description, setDescription] = useState("");
  const [cuisine, setCuisine] = useState("");

  useEffect(() => {
    if (!user) return;
    let active = true;
    const loadApplication = async () => {
      const { data, error } = await supabase
        .from("vendor_applications")
        .select("id,university_id,restaurant_name,contact_number,description,cuisine,status,review_note")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!active) return;
      if (error) {
        toast.error(`Unable to load your vendor application: ${error.message}`);
      } else if (data) {
        setApplication(data as VendorApplicationRecord);
        setUniversityId(data.university_id);
        setRestaurantName(data.restaurant_name);
        setContactNumber(data.contact_number ?? "");
        setDescription(data.description ?? "");
        setCuisine(data.cuisine ?? "");
      } else {
        const metadata = user.user_metadata;
        const vendorUniversity = metadata.vendor_university;
        setUniversityId(
          typeof vendorUniversity === "string" && vendorUniversity in universities
            ? vendorUniversity
            : universityIds[0] ?? "",
        );
        setRestaurantName(typeof metadata.vendor_business_name === "string" ? metadata.vendor_business_name : "");
        setContactNumber(typeof metadata.vendor_contact_number === "string" ? metadata.vendor_contact_number : "");
        setDescription(typeof metadata.vendor_business_description === "string" ? metadata.vendor_business_description : "");
      }
      setLoading(false);
    };
    void loadApplication();
    return () => {
      active = false;
    };
  }, [user, universityIds]);

  if (roles.includes("vendor")) return <Navigate to="/vendor" replace />;
  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <TopBar />
        <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-forest" /></div>
      </div>
    );
  }

  const submitApplication = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!universityId || !(universityId in universities)) {
      toast.error("Select the university where your business operates.");
      return;
    }
    if (restaurantName.trim().length < 2) {
      toast.error("Enter a business name with at least 2 characters.");
      return;
    }
    if (!/^\+?[0-9][0-9 ()-]{6,23}$/.test(contactNumber.trim())) {
      toast.error("Enter a valid contact number.");
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await supabase.rpc("submit_vendor_application", {
        _university_id: universityId,
        _restaurant_name: restaurantName.trim(),
        _contact_number: contactNumber.trim(),
        _description: description.trim(),
        _cuisine: cuisine.trim(),
      });
      if (error) {
        toast.error(error.message);
        return;
      }
      const { data, error: loadError } = await supabase
        .from("vendor_applications")
        .select("id,university_id,restaurant_name,contact_number,description,cuisine,status,review_note")
        .eq("user_id", user?.id ?? "")
        .maybeSingle();
      if (loadError) {
        toast.error(`Application submitted, but status could not be refreshed: ${loadError.message}`);
        return;
      }
      if (data) setApplication(data as VendorApplicationRecord);
      toast.success("Vendor application submitted for university approval.");
      await refreshRoles();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to submit your application.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <TopBar />
      <main className="container max-w-2xl py-10">
        <Card className="space-y-6 p-6 sm:p-8">
          <div className="flex items-start gap-3">
            <Store className="mt-1 h-6 w-6 text-forest" />
            <div>
              <Badge variant={application?.status === "rejected" ? "destructive" : "secondary"}>
                {application ? application.status : "Vendor application"}
              </Badge>
              <h1 className="mt-2 font-display text-2xl font-bold text-navy">
                {application?.status === "pending" ? "Waiting for university approval" : "Apply to become a vendor"}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Your vendor role will be added to this account after approval. If you already order as a student,
                both roles remain on the same account.
              </p>
            </div>
          </div>

          {application?.status === "pending" ? (
            <div className="rounded-lg bg-muted/50 p-4 text-sm">
              <p className="font-semibold">{application.restaurant_name}</p>
              <p className="text-muted-foreground">Contact: {application.contact_number}</p>
              <p className="text-muted-foreground">
                {universities[application.university_id as keyof typeof universities]?.name ?? application.university_id}
                {" · "}Submitted for review
              </p>
              <Button className="mt-4" variant="outline" onClick={() => setApplication(null)}>
                Edit application
              </Button>
            </div>
          ) : (
            <>
              {application?.status === "rejected" && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm">
                  <p className="font-semibold">The university admin did not approve this application.</p>
                  {application.review_note && <p className="mt-1 text-muted-foreground">Note: {application.review_note}</p>}
                  <p className="mt-1 text-muted-foreground">Update the details below to submit it again.</p>
                </div>
              )}
              <form onSubmit={submitApplication} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="vendor-university">University</Label>
                  <Select value={universityId} onValueChange={setUniversityId}>
                    <SelectTrigger id="vendor-university"><SelectValue placeholder="Select a university" /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(universities).map(([id, university]) => (
                        <SelectItem key={id} value={id}>{university.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="vendor-name">Business name</Label>
                  <Input id="vendor-name" value={restaurantName} onChange={(event) => setRestaurantName(event.target.value)} maxLength={100} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="vendor-contact">Contact number</Label>
                  <Input
                    id="vendor-contact"
                    type="tel"
                    autoComplete="tel"
                    value={contactNumber}
                    onChange={(event) => setContactNumber(event.target.value)}
                    maxLength={25}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="vendor-cuisine">Cuisine or business type</Label>
                  <Input id="vendor-cuisine" value={cuisine} onChange={(event) => setCuisine(event.target.value)} maxLength={100} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="vendor-description">Business description</Label>
                  <Textarea id="vendor-description" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={1000} />
                </div>
                <Button type="submit" variant="cta" size="lg" className="w-full" disabled={submitting}>
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Submit for approval"}
                </Button>
              </form>
            </>
          )}
        </Card>
      </main>
    </div>
  );
};

export default VendorApplication;
