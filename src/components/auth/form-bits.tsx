"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import type { FormState } from "@/lib/actions/form-state";

export function SubmitButton({ children, pendingText }: { children: React.ReactNode; pendingText: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="h-11 w-full text-base font-semibold" disabled={pending} aria-disabled={pending}>
      {pending ? pendingText : children}
    </Button>
  );
}

export function FormMessage({ state }: { state: FormState | { status: string; message?: string } }) {
  if (state.status !== "error" && state.status !== "success") return null;
  const message = "message" in state ? state.message : undefined;
  if (!message) return null;
  const isError = state.status === "error";
  return (
    <p
      role={isError ? "alert" : "status"}
      aria-live="polite"
      className={
        isError
          ? "rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          : "rounded-lg border border-success/40 bg-success/10 px-3 py-2 text-sm text-success"
      }
    >
      {message}
    </p>
  );
}

export function Field({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {children}
    </div>
  );
}

export const inputClass = "h-11 text-base";
