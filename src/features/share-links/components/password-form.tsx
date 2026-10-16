"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { Button, Field, FormMessage, Input } from "@/components/form";
import { useI18n } from "@/i18n/client";
import { applyActionError } from "@/lib/apply-action-error";
import { unlock } from "../actions";
import { unlockSchema } from "../schema";

export function PasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const { t } = useI18n();
  const form = useForm({ resolver: zodResolver(unlockSchema), defaultValues: { password: "" } });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    const result = await unlock(token, values);
    if (!result.ok) return applyActionError(form, result.error);
    // The cookie is set; the page now renders the asset.
    router.refresh();
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex w-full max-w-sm flex-col gap-3">
      <Field label={t.auth.password} htmlFor="share-password" error={errors.password?.message}>
        <Input id="share-password" type="password" autoFocus aria-invalid={Boolean(errors.password)} {...form.register("password")} />
      </Field>
      {errors.root && <FormMessage tone="error">{errors.root.message}</FormMessage>}
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? t.share.checking : t.share.open}
      </Button>
    </form>
  );
}
