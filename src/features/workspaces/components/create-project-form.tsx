"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Button, Field, FormMessage, Input } from "@/components/form";
import { applyActionError } from "@/lib/apply-action-error";
import { createProject } from "../actions";
import { createProjectSchema } from "../schema";

export function CreateProjectForm({ workspaceId }: { workspaceId: string }) {
  const form = useForm({
    resolver: zodResolver(createProjectSchema),
    defaultValues: { workspaceId, name: "" },
  });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    const result = await createProject(values);
    if (result?.ok === false) applyActionError(form, result.error);
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-3 sm:flex-row sm:items-start">
      <div className="flex-1">
        <Field label="New project" htmlFor="project-name" error={errors.name?.message}>
          <Input
            id="project-name"
            placeholder="e.g. Spring campaign"
            aria-invalid={Boolean(errors.name)}
            {...form.register("name")}
          />
        </Field>
      </div>
      <Button type="submit" disabled={isSubmitting} className="sm:mt-6">
        {isSubmitting ? "Creating…" : "Create project"}
      </Button>
      {errors.root && <FormMessage tone="error">{errors.root.message}</FormMessage>}
    </form>
  );
}
