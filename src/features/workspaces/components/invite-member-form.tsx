"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Button, Field, FormMessage, Input, Select } from "@/components/form";
import { useI18n } from "@/i18n/client";
import { applyActionError } from "@/lib/apply-action-error";
import { inviteMember } from "../actions";
import { ROLES } from "../roles";
import { inviteMemberSchema } from "../schema";

export function InviteMemberForm({ workspaceId }: { workspaceId: string }) {
  const { t } = useI18n();
  const form = useForm({
    resolver: zodResolver(inviteMemberSchema),
    defaultValues: { workspaceId, email: "", role: "reviewer" as const },
  });
  const { errors, isSubmitting, isSubmitSuccessful } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    const result = await inviteMember(values);
    if (!result.ok) {
      applyActionError(form, result.error);
      return;
    }
    // Keep the chosen role for the next invite; clear only the email.
    form.reset({ ...values, email: "" }, { keepIsSubmitSuccessful: true });
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <div className="flex-1">
          <Field label={t.auth.email} htmlFor="invite-email" error={errors.email?.message}>
            <Input
              id="invite-email"
              type="email"
              placeholder="colleague@example.com"
              aria-invalid={Boolean(errors.email)}
              {...form.register("email")}
            />
          </Field>
        </div>
        <Field label={t.workspaces.role} htmlFor="invite-role" error={errors.role?.message}>
          <Select id="invite-role" {...form.register("role")}>
            {ROLES.map((role) => (
              <option key={role} value={role}>
                {t.roles[role]}
              </option>
            ))}
          </Select>
        </Field>
        <Button type="submit" disabled={isSubmitting} className="sm:mt-6">
          {isSubmitting ? t.common.sending : t.workspaces.sendInvite}
        </Button>
      </div>
      {errors.root && <FormMessage tone="error">{errors.root.message}</FormMessage>}
      {isSubmitSuccessful && !errors.root && <FormMessage tone="success">{t.workspaces.inviteSent}</FormMessage>}
    </form>
  );
}
