"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Button, Field, FormMessage, Input } from "@/components/form";
import { useI18n } from "@/i18n/client";
import { applyActionError } from "@/lib/apply-action-error";
import { resetPassword } from "../actions";
import { resetPasswordSchema } from "../schema";

export function ResetPasswordForm({ token }: { token: string }) {
  const { t } = useI18n();
  const form = useForm({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { token, password: "" },
  });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    const result = await resetPassword(values);
    if (result?.ok === false) applyActionError(form, result.error);
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <Field label={t.auth.newPassword} htmlFor="password" error={errors.password?.message}>
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          aria-invalid={Boolean(errors.password)}
          {...form.register("password")}
        />
      </Field>
      {/* The token is part of the form value but has no visible field;
          a token error (e.g. expired) is shown as a form-level message. */}
      {(errors.root ?? errors.token) && (
        <FormMessage tone="error">{(errors.root ?? errors.token)?.message}</FormMessage>
      )}
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? t.common.saving : t.auth.setNewPassword}
      </Button>
    </form>
  );
}
