"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Button, Field, FormMessage, Input } from "@/components/form";
import { applyActionError } from "@/lib/apply-action-error";
import { createWorkspace } from "../actions";
import { createWorkspaceSchema } from "../schema";

export function CreateWorkspaceForm() {
  const form = useForm({
    resolver: zodResolver(createWorkspaceSchema),
    defaultValues: { name: "" },
  });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    const result = await createWorkspace(values);
    if (result?.ok === false) applyActionError(form, result.error);
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-3 sm:flex-row sm:items-start">
      <div className="flex-1">
        <Field label="New workspace" htmlFor="workspace-name" error={errors.name?.message}>
          <Input
            id="workspace-name"
            placeholder="e.g. Acme Studio"
            aria-invalid={Boolean(errors.name)}
            {...form.register("name")}
          />
        </Field>
      </div>
      <Button type="submit" disabled={isSubmitting} className="sm:mt-6">
        {isSubmitting ? "Creating…" : "Create workspace"}
      </Button>
      {errors.root && <FormMessage tone="error">{errors.root.message}</FormMessage>}
    </form>
  );
}
