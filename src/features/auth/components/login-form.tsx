"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Button, Field, FormMessage, Input } from "@/components/form";
import { applyActionError } from "@/lib/apply-action-error";
import { login } from "../actions";
import { loginSchema } from "../schema";

export function LoginForm({ next }: { next: string }) {
  const form = useForm({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });
  const { errors, isSubmitting } = form.formState;

  // On success the action redirects, so we only ever get a result back on failure.
  const onSubmit = form.handleSubmit(async (values) => {
    const result = await login(values, next);
    if (result?.ok === false) applyActionError(form, result.error);
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <Field label="Email" htmlFor="email" error={errors.email?.message}>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          aria-invalid={Boolean(errors.email)}
          {...form.register("email")}
        />
      </Field>
      <Field label="Password" htmlFor="password" error={errors.password?.message}>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          aria-invalid={Boolean(errors.password)}
          {...form.register("password")}
        />
      </Field>
      {errors.root && <FormMessage tone="error">{errors.root.message}</FormMessage>}
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
