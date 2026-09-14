export function BrandLoading({ label }: { label?: string }) {
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="brand-mark text-3xl font-black">Hobden Game Center</p>
      <div
        className="h-2 w-36 overflow-hidden rounded-full bg-[var(--ink)]/15"
        aria-hidden
      >
        <div className="h-full w-1/2 animate-pulse rounded-full bg-[var(--accent)]" />
      </div>
      <p className="text-base font-semibold text-[var(--ink)]/70">
        {label ?? "Loading…"}
      </p>
    </div>
  );
}
