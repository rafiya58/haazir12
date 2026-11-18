import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Auth from "@/pages/Auth";

const mocks = vi.hoisted(() => ({
  resetPasswordForEmail: vi.fn(),
  signUp: vi.fn(),
  verifyOtp: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { error: mocks.toastError, success: mocks.toastSuccess },
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        order: () => Promise.resolve({
          data: [{ id: "campus-id", name: "Example University", email_domain: "example.edu" }],
          error: null,
        }),
      }),
    }),
    auth: {
      resetPasswordForEmail: mocks.resetPasswordForEmail,
      signUp: mocks.signUp,
      verifyOtp: mocks.verifyOtp,
    },
  },
}));

describe("Auth OTP rate limiting", () => {
  beforeEach(() => {
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn(),
    });
    vi.stubGlobal("localStorage", {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    });
    mocks.resetPasswordForEmail.mockReset().mockResolvedValue({ error: null });
    mocks.signUp.mockReset().mockResolvedValue({ data: { session: null }, error: null });
    mocks.verifyOtp.mockReset().mockResolvedValue({ error: { message: "Invalid code" } });
    mocks.toastError.mockReset();
    mocks.toastSuccess.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
  });

  it("locks recovery-code verification after five incorrect attempts", async () => {
    render(
      <MemoryRouter>
        <Auth />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Forgot password?" }));
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "person@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Send reset instructions" }));

    const codeInput = await screen.findByLabelText("6-digit code");
    const verifyButton = screen.getByRole("button", { name: "Verify code" });
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      fireEvent.change(codeInput, { target: { value: "123456" } });
      fireEvent.click(verifyButton);
      await waitFor(() => expect(mocks.verifyOtp).toHaveBeenCalledTimes(attempt));
      if (attempt < 5) await waitFor(() => expect(verifyButton).toBeEnabled());
    }

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Too many incorrect recovery codes. Please wait 15 minutes before trying again.",
    );
    expect(verifyButton).toBeDisabled();
    fireEvent.click(verifyButton);
    expect(mocks.verifyOtp).toHaveBeenCalledTimes(5);
  });

  it("locks signup-code verification after five incorrect attempts", async () => {
    render(
      <MemoryRouter>
        <Auth />
      </MemoryRouter>,
    );

    fireEvent.mouseDown(screen.getByRole("tab", { name: "Create account" }), { button: 0, ctrlKey: false });
    await screen.findByRole("radio", { name: "Student" });
    fireEvent.click(screen.getByRole("radio", { name: "Student" }));
    fireEvent.click(screen.getByRole("combobox", { name: "University" }));
    fireEvent.click(await screen.findByRole("option", { name: "Example University" }));
    fireEvent.change(screen.getByLabelText("Full name"), { target: { value: "Example Student" } });
    fireEvent.change(screen.getByLabelText("Student email"), { target: { value: "student@example.edu" } });
    fireEvent.change(screen.getByLabelText("Student ID"), { target: { value: "12345" } });
    fireEvent.change(screen.getByLabelText("Password", { selector: "input" }), { target: { value: "password123" } });
    fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: "password123" } });
    fireEvent.click(screen.getByRole("button", { name: "Create student account" }));

    const codeInput = await screen.findByLabelText("Email verification code");
    const verifyButton = screen.getByRole("button", { name: "Verify email" });
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      fireEvent.change(codeInput, { target: { value: "123456" } });
      fireEvent.click(verifyButton);
      await waitFor(() => expect(mocks.verifyOtp).toHaveBeenCalledTimes(attempt));
      if (attempt < 5) await waitFor(() => expect(verifyButton).toBeEnabled());
    }

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Too many incorrect verification codes. Please wait 15 minutes before trying again.",
    );
    expect(verifyButton).toBeDisabled();
    fireEvent.click(verifyButton);
    expect(mocks.verifyOtp).toHaveBeenCalledTimes(5);
  });
});
