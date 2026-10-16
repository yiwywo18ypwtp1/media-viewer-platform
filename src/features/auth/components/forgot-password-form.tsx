"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Button, Field, FormMessage, Input } from "@/components/form";
import { useI18n } from "@/i18n/client";
import { applyActionError } from "@/lib/apply-action-error";
import { requestPasswordReset } from "../actions";
import { forgotPasswordSchema } from "../schema";

export function ForgotPasswordForm() {
  const { t } = useI18n();
  const form = useForm({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  });
  const { errors, isSubmitting, isSubmitSuccessful } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    const result = await requestPasswordReset(values);
    if (!result.ok) applyActionError(form, result.error);
  });

  // isSubmitSuccessful is false when the action reported an error via setError.
  if (isSubmitSuccessful) {
    return (
      <FormMessage tone="success">
        {t.auth.resetSent}
      </FormMessage>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <Field label={t.auth.email} htmlFor="email" error={errors.email?.message}>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          aria-invalid={Boolean(errors.email)}
          {...form.register("email")}
        />
      </Field>
      {errors.root && <FormMessage tone="error">{errors.root.message}</FormMessage>}
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? t.common.sending : t.auth.sendResetLink}
      </Button>
    </form>
  );
}
