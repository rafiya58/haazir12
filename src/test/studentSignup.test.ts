import { describe, expect, it } from "vitest";
import { studentSignupSchema } from "@/lib/studentSignup";

describe("studentSignupSchema", () => {
  const validSignup = {
    email: "student@khi.iba.edu.pk",
    fullName: "Student Name",
    studentId: "123456",
    password: "password123",
    confirmPassword: "password123",
  };

  it("accepts required student signup details", () => {
    expect(studentSignupSchema.safeParse(validSignup).success).toBe(true);
  });

  it("requires a student ID", () => {
    expect(studentSignupSchema.safeParse({ ...validSignup, studentId: " " }).success).toBe(false);
  });

  it("rejects mismatched passwords", () => {
    const result = studentSignupSchema.safeParse({ ...validSignup, confirmPassword: "different" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toEqual(["confirmPassword"]);
    }
  });

  it("trims student IDs before saving", () => {
    const result = studentSignupSchema.safeParse({ ...validSignup, studentId: " 123456 " });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.studentId).toBe("123456");
    }
  });
});
