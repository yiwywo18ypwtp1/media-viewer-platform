"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { FormMessage, Input } from "@/components/form";
import { applyActionError } from "@/lib/apply-action-error";
import { createFolder } from "../actions";
import { createFolderSchema } from "../schema";

// "New folder" opens a one-field form in place.
export function CreateFolderForm({ projectId, parentId }: { projectId: string; parentId: string | null }) {
  const [open, setOpen] = useState(false);
  const form = useForm({
    resolver: zodResolver(createFolderSchema),
    defaultValues: { projectId, parentId, name: "" },
  });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    const result = await createFolder(values);
    if (!result.ok) return applyActionError(form, result.error);
    form.reset({ projectId, parentId, name: "" });
    setOpen(false);
  });

  if (!open) {
    return (
      <button type="button" className="text-sm underline" onClick={() => setOpen(true)}>
        New folder
      </button>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-wrap items-center gap-2 text-sm">
      <Input
        autoFocus
        aria-label="Folder name"
        placeholder="Folder name"
        aria-invalid={Boolean(errors.name)}
        className="py-1"
        {...form.register("name")}
      />
      <button type="submit" disabled={isSubmitting} className="underline disabled:opacity-50">
        Create
      </button>
      <button type="button" className="underline" onClick={() => setOpen(false)}>
        Cancel
      </button>
      {(errors.name ?? errors.root) && <FormMessage tone="error">{(errors.name ?? errors.root)?.message}</FormMessage>}
    </form>
  );
}
