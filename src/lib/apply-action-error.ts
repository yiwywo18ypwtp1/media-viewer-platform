import type { FieldValues, Path, UseFormReturn } from "react-hook-form";
import type { ActionError } from "./action-result";

// Shows a Server Action error in a React Hook Form: per-field messages next to
// the fields, everything else as a form-level ("root") error.
export function applyActionError<T extends FieldValues>(form: UseFormReturn<T>, error: ActionError) {
  if (error.fieldErrors && Object.keys(error.fieldErrors).length > 0) {
    for (const [name, message] of Object.entries(error.fieldErrors)) {
      form.setError(name as Path<T>, { message });
    }
    return;
  }
  form.setError("root", { message: error.message });
}
