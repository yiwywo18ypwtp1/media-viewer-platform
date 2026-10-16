"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button, Field, FormMessage, Input, Select } from "@/components/form";
import { useI18n } from "@/i18n/client";
import { applyActionError } from "@/lib/apply-action-error";
import { createShareLinkSchema } from "../schema";

// Same rules as the API. Like the review wizard, the form holds the
// datetime-local text (the creator's local time) and the password as typed
// ("" = none); both are converted when sending.
const formSchema = createShareLinkSchema.omit({ expiresAt: true, password: true }).extend({
  expiresLocal: z.string().refine((value) => value === "" || new Date(value).getTime() > Date.now(), "Pick a time in the future."),
  password: z.string().refine((value) => value === "" || value.length >= 6, "Use at least 6 characters, or leave empty."),
});
type FormValues = z.infer<typeof formSchema>;

type Props = { assetId: string; versions: { id: string; number: number }[] };

export function CreateShareLinkForm({ assetId, versions }: Props) {
  const router = useRouter();
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [created, setCreated] = useState<string | null>(null);
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { assetId, versionId: null, expiresLocal: "", password: "", allowComments: true, allowDownload: false },
  });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async ({ expiresLocal, password, ...values }) => {
    const response = await fetch("/api/share-links", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...values,
        expiresAt: expiresLocal ? new Date(expiresLocal).toISOString() : null,
        password: password || null,
      }),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      return applyActionError(form, data?.error ?? { code: "error", message: t.share.createFailed });
    }
    setCreated(data.url);
    setOpen(false);
    form.reset();
    router.refresh();
  });

  return (
    <div className="flex flex-col gap-3">
      {created && (
        <div role="status" className="flex flex-col gap-1 rounded-md bg-green-50 px-3 py-2 text-sm dark:bg-green-950">
          <p>{t.share.created}</p>
          <div className="flex gap-2">
            <Input readOnly value={created} aria-label={t.share.newLinkLabel} className="flex-1 py-1 font-mono text-xs" onFocus={(e) => e.target.select()} />
            <button type="button" className="underline" onClick={() => void navigator.clipboard?.writeText(created)}>
              {t.share.copy}
            </button>
          </div>
        </div>
      )}

      {!open ? (
        <button type="button" className="self-start text-sm underline" onClick={() => setOpen(true)}>
          {t.share.newLink}
        </button>
      ) : (
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-3 rounded-md border border-neutral-200 p-3 dark:border-neutral-800">
          <Field label={t.share.version} htmlFor="share-version" error={errors.versionId?.message}>
            <Select id="share-version" {...form.register("versionId", { setValueAs: (value) => value || null })}>
              <option value="">{t.share.latest}</option>
              {versions.map((v) => (
                <option key={v.id} value={v.id}>
                  {t.share.versionOnly(v.number)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t.share.expires} htmlFor="share-expires" error={errors.expiresLocal?.message}>
            <Input id="share-expires" type="datetime-local" aria-invalid={Boolean(errors.expiresLocal)} {...form.register("expiresLocal")} />
          </Field>
          <Field label={t.share.password} htmlFor="share-password-new" error={errors.password?.message}>
            <Input id="share-password-new" type="password" autoComplete="new-password" aria-invalid={Boolean(errors.password)} {...form.register("password")} />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" {...form.register("allowComments")} /> {t.share.allowComments}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" {...form.register("allowDownload")} /> {t.share.allowDownload}
          </label>
          {errors.root && <FormMessage tone="error">{errors.root.message}</FormMessage>}
          <div className="flex gap-3">
            <Button type="submit" disabled={isSubmitting} className="px-3 py-1">
              {isSubmitting ? t.common.creating : t.share.create}
            </Button>
            <button type="button" className="text-sm underline" onClick={() => setOpen(false)}>
              {t.common.cancel}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
