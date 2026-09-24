export function BrandLoading({ label }: { label?: string }) {
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-5 px-4 text-center">
      <div className="float-slow text-6xl" aria-hidden>
        🎮
      </div>
      <p className="brand-mark text-4xl font-black leading-none">
        Hobden
        <br />
        Game Center
      </p>
      <div
        className="h-3 w-40 overflow-hidden rounded-full bg-[var(--ink)]/15"
        aria-hidden
      >
        <div className="h-full w-1/2 animate-pulse rounded-full bg-[var(--accent)]" />
      </div>
      <p className="text-base font-bold text-[var(--ink)]/70">
        {label ?? "Loading…"}
      </p>
    </div>
  );
}
