type VendorInvitationEmailOptions = {
  businessName: string;
  invitationUrl: string;
  expiresAt: string;
};

const escapeHtml = (value: string) => value
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&#39;");

export const renderVendorInvitationEmail = ({
  businessName,
  invitationUrl,
  expiresAt,
}: VendorInvitationEmailOptions) => {
  const safeBusinessName = escapeHtml(businessName);
  const safeInvitationUrl = escapeHtml(invitationUrl);
  const expiryLabel = new Date(expiresAt).toUTCString();

  return {
    subject: "Join your campus as a Haazir vendor",
    html: `<h2>Your vendor application was approved</h2><p>Your application for ${safeBusinessName} was approved by your campus admin.</p><p><a href="${safeInvitationUrl}">Join as Vendor</a></p><p>This secure link expires on ${expiryLabel} and can only be used once. Sign in to your existing Haazir account to accept.</p><p>If you can't find this email in your inbox, please check your Spam or Junk folder.</p><p>If you were not expecting this email, you can ignore it.</p>`,
    text: `Your application for ${businessName} was approved. Join as Vendor using this one-time link: ${invitationUrl} This link expires on ${expiryLabel}. Sign in to your existing Haazir account to accept. If you can't find this email in your inbox, please check your Spam or Junk folder.`,
  };
};
