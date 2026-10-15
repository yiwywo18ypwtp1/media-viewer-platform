import { z } from "zod";

// Shared by the forms (zodResolver) and the Server Actions.

export const emailField = z.string().trim().toLowerCase().pipe(z.email("Enter a valid email."));

const newPassword = z
  .string()
  .min(8, "Use at least 8 characters.")
  .max(128, "Use at most 128 characters.");

export const registerSchema = z.object({
  name: z.string().trim().min(1, "Enter your name.").max(100, "Use at most 100 characters."),
  email: emailField,
  password: newPassword,
});

export const loginSchema = z.object({
  email: emailField,
  // No length rules on login: they belong to choosing a password, not entering one.
  password: z.string().min(1, "Enter your password."),
});

export const forgotPasswordSchema = z.object({ email: emailField });

export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: newPassword,
});
