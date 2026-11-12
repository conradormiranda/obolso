import { cn } from "@/lib/utils";

export function Panel({
  title,
  action,
  className,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={cn("rounded-2xl border border-border bg-card p-5 md:p-6", className)} aria-label={title}>
      <div className="mb-5 flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-primary">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}
