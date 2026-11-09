# Welcome to your Lovable project

TODO: Document your project here

## Authentication setup

There are four application roles: student, vendor, campus admin, and platform admin. Student accounts must select IBA (`@khi.iba.edu.pk`) or Habib University (`@st.habib.edu.pk`) when signing up. Signup collects the student's name, email, university, student ID, password, and confirmation password. The selected university and student ID are saved to the profile, and the signup trigger assigns student roles for those domains.

Student signup collects the student's name, email, university, student ID, password, and confirmation password. When Supabase email confirmation is enabled, students and vendors verify their email with the six-digit signup OTP. Vendor signup also collects the business university, contact number, business name, and a short description; after registration, the signed-in user submits those details as a separate university approval application. Approval creates a vendor role on the same account without removing an existing student role. If the email already belongs to a student account, sign in with that account and choose the vendor application flow. Campus admins are invited by platform admins and can review applications and manage vendors only for their university. Campus and platform admin accounts are not available through public signup.

Apply pending Supabase migrations before deploying so the server validates student university domains, saves student IDs, prevents duplicate IDs within a university, assigns student roles, and enforces university-scoped vendor approval. Configure Supabase email confirmations and the **Confirm signup** email template to include `{{ .Token }}`; link-only templates are not compatible with in-app OTP entry. If email confirmation is disabled, Supabase immediately signs up and signs in new accounts, so the app proceeds without an OTP. Enable email confirmation when OTP verification is required.

The role migration removes existing legacy `admin` and `restaurant` assignments rather than trusting them. Re-provision platform admins only after reviewing their identities; former vendors can sign in and submit an application for university approval.

Deploy the protected `invite-campus-admin` Edge Function with `supabase functions deploy invite-campus-admin`. Its service-role key must remain in Supabase's Edge Function environment and must never be added to client environment variables. Platform admin membership is provisioned by a trusted backend operator, for example:

```sql
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'platform_admin'
FROM auth.users
WHERE email = 'platform-admin@example.com'
ON CONFLICT DO NOTHING;
```

Campus admin invitations use Supabase's **Invite user** email template and require `{{ .ConfirmationURL }}`. Set the Supabase **Site URL** to the deployed app origin and include it in the allowed redirect URLs.

Supabase's default SMTP service is for testing: it only delivers to project team members and is limited to two messages per hour. To send signup codes to students, configure a custom SMTP provider in **Authentication → SMTP Settings**. Check **Authentication → Logs** for delivery errors and the recipient's spam folder when a code does not arrive.

Password recovery supports either a six-digit code or a reset link. In Supabase **Authentication → URL Configuration**, add the exact deployed callback URL `https://your-app.example/reset-password?mode=recovery` (replace the host with your deployed app origin) to the allowed redirect URLs. In **Authentication → Email Templates → Reset Password**, use `{{ .ConfirmationURL }}` as the reset link; optionally include `{{ .Token }}` to also provide a code. The link opens the dedicated password reset page, which does not route by user role. If Supabase does not allow the callback URL or the email template links to `{{ .SiteURL }}` instead of `{{ .ConfirmationURL }}`, it may fall back to the Site URL. Make sure email delivery is configured.
