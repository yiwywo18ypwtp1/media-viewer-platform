"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { Controller, useFieldArray, useForm, useWatch, type FieldPath } from "react-hook-form";
import { z } from "zod";
import { Button, Field, FormMessage, Input, Select } from "@/components/form";
import { applyActionError } from "@/lib/apply-action-error";
import { describeRule, type Rule } from "../rules";
import { createReviewRequestSchema, MAX_STEPS } from "../schema";

// Same rules as the API schema. Only the due date differs: the form holds
// the <input type="datetime-local"> text (the creator's local time), the API
// gets an instant. Converting in the browser is what makes "in the future"
// mean "in the creator's time zone".
const wizardSchema = createReviewRequestSchema.omit({ dueAt: true, message: true }).extend({
  dueLocal: z.string().refine((value) => value === "" || new Date(value).getTime() > Date.now(), "Pick a time in the future."),
  message: z.string().max(2000, "Keep it under 2000 characters."),
});
type WizardValues = z.infer<typeof wizardSchema>;

type Props = {
  assetId: string;
  versions: { id: string; number: number }[];
  defaultVersionId: string;
  reviewers: { id: string; name: string }[];
  // Restarting a stale review starts from its steps.
  initialSteps?: WizardValues["steps"];
  onClose: () => void;
};

const SCREENS = ["Details", "Approval", "Confirm"] as const;
// Fields checked before leaving each screen.
const SCREEN_FIELDS: FieldPath<WizardValues>[][] = [["versionId", "dueLocal", "message"], ["steps"], []];

export function RequestReviewWizard(props: Props) {
  const router = useRouter();
  const [screen, setScreen] = useState(0);
  const form = useForm<WizardValues>({
    resolver: zodResolver(wizardSchema),
    defaultValues: {
      assetId: props.assetId,
      versionId: props.defaultVersionId,
      dueLocal: "",
      message: "",
      steps: props.initialSteps ?? [{ reviewers: [], rule: "all" }],
    },
  });
  // Stable field ids from useFieldArray as keys, never array indexes.
  const steps = useFieldArray({ control: form.control, name: "steps" });
  const { errors, isSubmitting } = form.formState;
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  async function next() {
    if (await form.trigger(SCREEN_FIELDS[screen])) setScreen((s) => s + 1);
  }

  const submit = form.handleSubmit(async ({ dueLocal, message, ...values }) => {
    const response = await fetch("/api/review-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...values,
        dueAt: dueLocal ? new Date(dueLocal).toISOString() : null,
        message: message.trim() || null,
      }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      const error = body?.error ?? { code: "error", message: "Couldn't create the review. Try again." };
      applyActionError(form, error);
      // Field errors may belong to an earlier screen: go back to show them.
      if (error.fieldErrors) setScreen(Object.keys(error.fieldErrors).some((k) => k.startsWith("steps")) ? 1 : 0);
      return;
    }
    props.onClose();
    router.refresh();
  });

  const values = useWatch({ control: form.control });
  const nameOf = (id: string) => props.reviewers.find((r) => r.id === id)?.name ?? id;

  return (
    <form onSubmit={(event) => void submit(event)} noValidate className="flex flex-col gap-4 rounded-md border border-neutral-200 p-4 dark:border-neutral-800">
      <ol className="flex gap-4 text-xs" aria-label="Steps">
        {SCREENS.map((name, index) => (
          <li key={name} aria-current={index === screen ? "step" : undefined} className={index === screen ? "font-semibold" : "text-neutral-500"}>
            {index + 1}. {name}
          </li>
        ))}
      </ol>

      {screen === 0 && (
        <div className="flex flex-col gap-3">
          <Field label="Version" htmlFor="review-version" error={errors.versionId?.message}>
            <Select id="review-version" {...form.register("versionId")}>
              {props.versions.map((v) => (
                <option key={v.id} value={v.id}>
                  v{v.number}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={`Due (optional, your time: ${timeZone})`} htmlFor="review-due" error={errors.dueLocal?.message}>
            <Input id="review-due" type="datetime-local" aria-invalid={Boolean(errors.dueLocal)} {...form.register("dueLocal")} />
          </Field>
          <Field label="Message (optional)" htmlFor="review-message" error={errors.message?.message}>
            <textarea
              id="review-message"
              rows={3}
              className="rounded-md border border-neutral-300 bg-transparent px-3 py-2 text-sm dark:border-neutral-700"
              {...form.register("message")}
            />
          </Field>
        </div>
      )}

      {screen === 1 && (
        <div className="flex flex-col gap-4">
          {steps.fields.map((field, index) => (
            <fieldset key={field.id} className="flex flex-col gap-3 rounded-md border border-neutral-200 p-3 dark:border-neutral-800">
              <legend className="px-1 text-sm font-medium">
                {steps.fields.length > 1 ? `Step ${index + 1}` : "Approval"}
              </legend>
              <Controller
                control={form.control}
                name={`steps.${index}.reviewers`}
                render={({ field: reviewers, fieldState }) => (
                  <fieldset className="flex flex-col gap-1">
                    <legend className="text-sm">Reviewers</legend>
                    {props.reviewers.map((reviewer) => (
                      <label key={reviewer.id} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={reviewers.value.includes(reviewer.id)}
                          onChange={(event) =>
                            reviewers.onChange(
                              event.target.checked
                                ? [...reviewers.value, reviewer.id]
                                : reviewers.value.filter((id) => id !== reviewer.id),
                            )
                          }
                        />
                        {reviewer.name}
                      </label>
                    ))}
                    {fieldState.error && <FormMessage tone="error">{fieldState.error.message}</FormMessage>}
                  </fieldset>
                )}
              />
              <Controller
                control={form.control}
                name={`steps.${index}.rule`}
                render={({ field: rule, fieldState }) => (
                  <RuleField value={rule.value} onChange={rule.onChange} error={fieldState.error?.message} />
                )}
              />
              {steps.fields.length > 1 && (
                <button type="button" className="self-start text-xs underline" onClick={() => steps.remove(index)}>
                  Remove step
                </button>
              )}
            </fieldset>
          ))}
          {steps.fields.length < MAX_STEPS && (
            <button type="button" className="self-start text-sm underline" onClick={() => steps.append({ reviewers: [], rule: "all" })}>
              Add step
            </button>
          )}
        </div>
      )}

      {screen === 2 && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-neutral-500">Version</dt>
          <dd>v{props.versions.find((v) => v.id === values.versionId)?.number}</dd>
          <dt className="text-neutral-500">Due</dt>
          <dd>{values.dueLocal ? `${values.dueLocal.replace("T", " ")} (${timeZone})` : "No due date"}</dd>
          {(values.steps ?? []).map((step, index) => (
            <div key={steps.fields[index]?.id ?? index} className="contents">
              <dt className="text-neutral-500">{steps.fields.length > 1 ? `Step ${index + 1}` : "Reviewers"}</dt>
              <dd>
                {(step.reviewers ?? []).map(nameOf).join(", ")} · {step.rule ? describeRule(step.rule as Rule) : ""}
              </dd>
            </div>
          ))}
        </dl>
      )}

      {errors.root && <FormMessage tone="error">{errors.root.message}</FormMessage>}

      <div className="flex gap-3">
        {screen > 0 && (
          <button type="button" className="text-sm underline" onClick={() => setScreen((s) => s - 1)}>
            Back
          </button>
        )}
        {/* Different keys: React must not turn the clicked "Next" element into
            the submit button. Validation resolves within the click, so the
            browser's default action would then submit the form on its own. */}
        {screen < SCREENS.length - 1 ? (
          <Button key="next" type="button" onClick={() => void next()} className="px-3 py-1">
            Next
          </Button>
        ) : (
          <Button key="submit" type="submit" disabled={isSubmitting} className="px-3 py-1">
            {isSubmitting ? "Sending…" : "Request review"}
          </Button>
        )}
        <button type="button" className="text-sm underline" onClick={props.onClose}>
          Cancel
        </button>
      </div>
    </form>
  );
}

// all / any / at least N, edited in the API's own shape.
function RuleField(props: { value: Rule; onChange: (rule: Rule) => void; error?: string }) {
  // One name per step: the radios form a group (arrow keys move within it).
  const name = useId();
  const kind = typeof props.value === "object" ? "atLeast" : props.value;
  const atLeast = typeof props.value === "object" ? props.value.atLeast : 1;
  return (
    <fieldset className="flex flex-col gap-1 text-sm">
      <legend>Rule</legend>
      <label className="flex items-center gap-2">
        <input type="radio" name={name} checked={kind === "all"} onChange={() => props.onChange("all")} />
        All reviewers must approve
      </label>
      <label className="flex items-center gap-2">
        <input type="radio" name={name} checked={kind === "any"} onChange={() => props.onChange("any")} />
        Any one reviewer decides
      </label>
      <label className="flex items-center gap-2">
        <input type="radio" name={name} checked={kind === "atLeast"} onChange={() => props.onChange({ atLeast })} />
        At least
        <input
          type="number"
          min={1}
          aria-label="Required approvals"
          value={atLeast}
          disabled={kind !== "atLeast"}
          onChange={(event) => props.onChange({ atLeast: Number(event.target.value) })}
          className="w-14 rounded border border-neutral-300 bg-transparent px-1 dark:border-neutral-700"
        />
        must approve
      </label>
      {props.error && <FormMessage tone="error">{props.error}</FormMessage>}
    </fieldset>
  );
}
