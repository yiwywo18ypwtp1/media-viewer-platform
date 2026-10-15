"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { useForm, useWatch } from "react-hook-form";
import type { z } from "zod";
import { Button, FormMessage } from "@/components/form";
import { AnnotationField } from "@/features/annotations/components/annotation-field";
import { annotationSchema } from "@/features/annotations/schema";
import { currentFrameMs, useOptionalPlayer } from "@/features/player/player-context";
import { formatTimecode } from "@/features/player/timecode";
import { createCommentSchema, keepMentionsInBody, type Member } from "../schema";

// The form's own schema is a slice of the API schema: same rules on both sides.
// `annotation` is re-declared without the API's default: the form always holds it.
const formSchema = createCommentSchema
  .pick({ body: true, mentions: true, timecodeMs: true })
  .extend({ annotation: annotationSchema.nullable() });
type FormValues = z.infer<typeof formSchema>;

type Props = {
  members: Member[];
  submitLabel: string;
  initial?: { body: string; mentions: string[] };
  // Top-level comments on a video pin the current frame.
  withTimecode?: boolean;
  // Persist unsent text across reloads and version switches.
  draftKey?: string;
  autoFocus?: boolean;
  onSubmit: (values: FormValues) => Promise<string | null>;
  onCancel?: () => void;
};

const MAX_SUGGESTIONS = 6;

export function CommentForm(props: Props) {
  const player = useOptionalPlayer();
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      body: props.initial?.body ?? "",
      mentions: props.initial?.mentions ?? [],
      timecodeMs: null,
      annotation: null,
    },
  });
  const { errors, isSubmitting } = form.formState;
  const timecodeMs = useWatch({ control: form.control, name: "timecodeMs" });
  const annotation = useWatch({ control: form.control, name: "annotation" });
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const timecodeRemoved = useRef(false);
  const listId = useId();
  const [query, setQuery] = useState<{ text: string; start: number } | null>(null);
  const [active, setActive] = useState(0);

  // --- Draft: restore once, then save on every change. ---
  const { draftKey } = props;
  useEffect(() => {
    if (!draftKey) return;
    try {
      const saved = localStorage.getItem(draftKey);
      if (saved) form.reset({ ...form.getValues(), ...(JSON.parse(saved) as Pick<FormValues, "body" | "mentions">) });
    } catch {
      // Storage unavailable (private mode) or corrupt: start empty.
    }
    // subscribe() reports changes without re-rendering the form.
    return form.subscribe({
      formState: { values: true },
      callback: ({ values: { body, mentions } }) => {
        try {
          if (body) localStorage.setItem(draftKey, JSON.stringify({ body, mentions }));
          else localStorage.removeItem(draftKey);
        } catch {}
      },
    });
  }, [draftKey, form]);

  // --- Timecode ---
  function captureTimecode(): number | null {
    const video = player?.videoRef.current;
    if (!props.withTimecode || !player || !video) return null;
    const ms = currentFrameMs(video, player.rate);
    form.setValue("timecodeMs", ms);
    return ms;
  }

  // --- Mentions ---
  const suggestions = query
    ? props.members.filter((m) => m.name.toLowerCase().includes(query.text.toLowerCase())).slice(0, MAX_SUGGESTIONS)
    : [];

  function updateQuery() {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const beforeCaret = textarea.value.slice(0, textarea.selectionStart);
    const match = /(^|\s)@([^\s@]{0,30})$/.exec(beforeCaret);
    setQuery(match ? { text: match[2], start: beforeCaret.length - match[2].length - 1 } : null);
    setActive(0);
  }

  function pickMention(member: Member) {
    const textarea = textareaRef.current;
    if (!textarea || !query) return;
    const caret = textarea.selectionStart;
    const body = form.getValues("body");
    const inserted = `@${member.name} `;
    form.setValue("body", body.slice(0, query.start) + inserted + body.slice(caret), { shouldDirty: true });
    form.setValue("mentions", [...form.getValues("mentions"), member.id]);
    setQuery(null);
    // Synchronously: setValue has already updated the textarea, and waiting a
    // frame would let fast typing land before the caret moves.
    const position = query.start + inserted.length;
    textarea.setSelectionRange(position, position);
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (suggestions.length > 0) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const step = event.key === "ArrowDown" ? 1 : -1;
        setActive((index) => (index + step + suggestions.length) % suggestions.length);
        return;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        pickMention(suggestions[active]);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setQuery(null);
        return;
      }
    }
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      void submit();
    }
  }

  // --- Submit: clear right away (the comment shows optimistically), give the
  // text back if saving fails. ---
  const submit = (event?: FormEvent) =>
    form.handleSubmit(async (values) => {
      const cleaned = { ...values, mentions: keepMentionsInBody(values.body, values.mentions, props.members) };
      form.reset({ body: "", mentions: [], timecodeMs: null, annotation: null });
      timecodeRemoved.current = false;
      const error = await props.onSubmit(cleaned);
      if (error) {
        form.reset(values);
        form.setError("root", { message: error });
      } else if (draftKey) {
        try {
          localStorage.removeItem(draftKey);
        } catch {}
      }
    })(event);

  const { ref: registerRef, ...bodyField } = form.register("body");

  return (
    <form onSubmit={(event) => void submit(event)} noValidate className="flex flex-col gap-2">
      {props.withTimecode && player && (
        <div className="flex items-center gap-2 text-xs text-neutral-500">
          {timecodeMs !== null ? (
            <>
              <span className="font-mono text-neutral-900 dark:text-neutral-100">
                @ {formatTimecode(timecodeMs / 1000, player.rate)}
              </span>
              <button type="button" className="underline" onClick={captureTimecode}>
                Use current frame
              </button>
              <button
                type="button"
                className="underline"
                onClick={() => {
                  timecodeRemoved.current = true;
                  form.setValue("timecodeMs", null);
                  // A drawing belongs to a frame; no timecode, no drawing.
                  form.setValue("annotation", null);
                }}
              >
                No timecode
              </button>
            </>
          ) : (
            <button
              type="button"
              className="underline"
              onClick={() => {
                timecodeRemoved.current = false;
                captureTimecode();
              }}
            >
              Add timecode
            </button>
          )}
        </div>
      )}

      {props.withTimecode && player && (
        <AnnotationField
          value={annotation}
          onChange={(value) => form.setValue("annotation", value, { shouldDirty: true })}
          atMs={timecodeMs}
          pinCurrentFrame={() => {
            timecodeRemoved.current = false;
            return captureTimecode();
          }}
        />
      )}

      <div className="relative">
        <textarea
          {...bodyField}
          ref={(element) => {
            registerRef(element);
            textareaRef.current = element;
          }}
          rows={3}
          autoFocus={props.autoFocus}
          placeholder="Add a comment… (@ to mention, Ctrl+Enter to send)"
          aria-label="Comment"
          aria-invalid={Boolean(errors.body)}
          // Combobox: a text field that can pop up a list (the @mention suggestions).
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={suggestions.length > 0}
          aria-controls={listId}
          aria-activedescendant={suggestions.length > 0 ? `${listId}-${active}` : undefined}
          onFocus={() => {
            // Pin the frame the reviewer is looking at when they start typing.
            if (timecodeMs === null && !timecodeRemoved.current) captureTimecode();
          }}
          onKeyDown={onKeyDown}
          onInput={updateQuery}
          onClick={updateQuery}
          className="w-full resize-y rounded-md border border-neutral-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-neutral-900 aria-invalid:border-red-600 dark:border-neutral-700 dark:focus:border-neutral-100"
        />
        {suggestions.length > 0 && (
          <ul
            id={listId}
            role="listbox"
            aria-label="Mention someone"
            className="absolute left-0 z-10 mt-1 w-64 rounded-md border border-neutral-200 bg-white py-1 text-sm shadow-lg dark:border-neutral-700 dark:bg-neutral-900"
          >
            {suggestions.map((member, index) => (
              <li
                key={member.id}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={index === active}
                // mousedown, not click: keeps focus (and the caret) in the textarea.
                onMouseDown={(event) => {
                  event.preventDefault();
                  pickMention(member);
                }}
                className={`cursor-pointer px-3 py-1 ${index === active ? "bg-neutral-100 dark:bg-neutral-800" : ""}`}
              >
                {member.name}
              </li>
            ))}
          </ul>
        )}
      </div>

      {errors.body && <FormMessage tone="error">{errors.body.message}</FormMessage>}
      {errors.root && <FormMessage tone="error">{errors.root.message}</FormMessage>}
      <div className="flex gap-2">
        <Button type="submit" disabled={isSubmitting} className="px-3 py-1">
          {props.submitLabel}
        </Button>
        {props.onCancel && (
          <button type="button" onClick={props.onCancel} className="text-sm underline">
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
