"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Button, Field, FormMessage, Input } from "@/components/form";
import { applyActionError } from "@/lib/apply-action-error";
import { register } from "../actions";
import { registerSchema } from "../schema";

export function RegisterForm({ next }: { next: string }) {
  const form = useForm({
    resolver: zodResolver(registerSchema),
    defaultValues: { name: "", email: "", password: "" },
  });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    const result = await register(values, next);
    if (result?.ok === false) applyActionError(form, result.error);
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <Field label="Name" htmlFor="name" error={errors.name?.message}>
        <Input id="name" autoComplete="name" aria-invalid={Boolean(errors.name)} {...form.register("name")} />
      </Field>
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
          autoComplete="new-password"
          aria-invalid={Boolean(errors.password)}
          {...form.register("password")}
        />
      </Field>
      {errors.root && <FormMessage tone="error">{errors.root.message}</FormMessage>}
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Creating account…" : "Create account"}
      </Button>
    </form>
  );
}
