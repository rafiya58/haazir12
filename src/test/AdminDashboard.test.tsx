import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AdminDashboard from "@/pages/AdminDashboard";

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("@/components/TopBar", () => ({ TopBar: () => null }));
vi.mock("sonner", () => ({
  toast: { error: mocks.toastError, success: mocks.toastSuccess },
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => ({
      select() {
        return this;
      },
      order() {
        return this;
      },
      then<TResult1 = { data: unknown[]; error: null }, TResult2 = never>(
        onfulfilled?: ((value: { data: unknown[]; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
        onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
      ) {
        const data = table === "universities" ? [] : [];
        return Promise.resolve({ data, error: null }).then(onfulfilled, onrejected);
      },
    }),
    functions: { invoke: mocks.invoke },
    channel: () => ({
      on() {
        return this;
      },
      subscribe() {
        return this;
      },
    }),
    removeChannel: vi.fn(),
  },
}));

const fillCampusForm = (email: string) => {
  fireEvent.change(screen.getByLabelText("Campus name"), { target: { value: "Example University" } });
  fireEvent.change(screen.getByLabelText("Student email domain"), { target: { value: "students.example.edu" } });
  fireEvent.change(screen.getByLabelText(/Campus admin email/), { target: { value: email } });
};

describe("Platform Admin campus invitation", () => {
  beforeEach(() => {
    mocks.invoke.mockReset();
    mocks.toastError.mockReset();
    mocks.toastSuccess.mockReset();
  });

  it("rejects malformed administrator email addresses before invoking the Edge Function", async () => {
    render(<AdminDashboard />);
    await screen.findByLabelText("Campus name");
    fillCampusForm("admin@invalid_domain");
    fireEvent.click(screen.getByRole("button", { name: /Onboard campus & send invitation/ }));

    expect(mocks.invoke).not.toHaveBeenCalled();
    expect(mocks.toastError).toHaveBeenCalledWith("Please enter a valid email address.");
  });

  it("shows the specific duplicate-email message from the Edge Function", async () => {
    mocks.invoke.mockResolvedValue({
      data: null,
      error: {
        context: new Response(JSON.stringify({
          code: "EMAIL_ALREADY_REGISTERED",
          error: "This email is already registered. Please use a different email address.",
        }), { status: 409 }),
      },
    });
    render(<AdminDashboard />);
    await screen.findByLabelText("Campus name");
    fillCampusForm("admin@example.edu");
    fireEvent.click(screen.getByRole("button", { name: /Onboard campus & send invitation/ }));

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith(
      "This email is already registered. Please use a different email address.",
    ));
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
  });

  it("reports a successful campus invitation", async () => {
    mocks.invoke.mockResolvedValue({ data: { campus_id: "example-university-id" }, error: null });
    render(<AdminDashboard />);
    await screen.findByLabelText("Campus name");
    fillCampusForm(" ADMIN@EXAMPLE.EDU ");
    fireEvent.click(screen.getByRole("button", { name: /Onboard campus & send invitation/ }));

    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledWith("invite-campus-admin", {
      body: expect.objectContaining({ admin_email: "admin@example.edu" }),
    }));
    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalledWith(
      "Campus onboarded. Invitation email sent to admin@example.edu.",
    ));
  });
});
