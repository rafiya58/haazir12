import { z } from "zod";

export const studentSignupSchema = z
  .object({
    email: z.string().trim().email("Enter a valid email").max(255),
    fullName: z.string().trim().min(2, "Enter your name").max(80),
    studentId: z.string().trim().min(1, "Enter your student ID").max(64, "Student ID is too long"),
    password: z.string().min(8, "Min 8 characters").max(72),
    confirmPassword: z.string().min(1, "Confirm your password"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });
