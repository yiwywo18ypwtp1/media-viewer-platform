"use client";

import { useState, type ComponentProps } from "react";
import { RequestReviewWizard } from "./request-review-wizard";

type Props = Omit<ComponentProps<typeof RequestReviewWizard>, "onClose"> & { label: string };

// The wizard opens inline on click; it's only rendered (and only needs the
// browser's time zone) once the user asks for it.
export function RequestReviewButton({ label, ...wizardProps }: Props) {
  const [open, setOpen] = useState(false);
  if (open) return <RequestReviewWizard {...wizardProps} onClose={() => setOpen(false)} />;
  return (
    <button type="button" className="self-start text-sm underline" onClick={() => setOpen(true)}>
      {label}
    </button>
  );
}
