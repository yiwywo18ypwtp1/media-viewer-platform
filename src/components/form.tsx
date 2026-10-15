import type { ComponentProps, ReactNode } from "react";

// Small presentational building blocks shared by all forms. No logic, no state.

export function Field(props: { label: string; htmlFor: string; error?: string; children: ReactNode }) {
  const errorId = `${props.htmlFor}-error`;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={props.htmlFor} className="text-sm font-medium">
        {props.label}
      </label>
      {props.children}
      {props.error && (
        <p id={errorId} className="text-sm text-red-600">
          {props.error}
        </p>
      )}
    </div>
  );
}

export function Input({ className = "", ...props }: ComponentProps<"input">) {
  return (
    <input
      className={`rounded-md border border-neutral-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-neutral-900 aria-invalid:border-red-600 dark:border-neutral-700 dark:focus:border-neutral-100 ${className}`}
      {...props}
    />
  );
}

export function Select({ className = "", ...props }: ComponentProps<"select">) {
  return (
    <select
      className={`rounded-md border border-neutral-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-neutral-900 dark:border-neutral-700 dark:focus:border-neutral-100 ${className}`}
      {...props}
    />
  );
}

export function Button({ className = "", ...props }: ComponentProps<"button">) {
  return (
    <button
      className={`rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300 ${className}`}
      {...props}
    />
  );
}

export function FormMessage(props: { tone: "error" | "success"; children: ReactNode }) {
  const color = props.tone === "error" ? "text-red-600" : "text-green-700 dark:text-green-500";
  return (
    <p role={props.tone === "error" ? "alert" : "status"} className={`text-sm ${color}`}>
      {props.children}
    </p>
  );
}
