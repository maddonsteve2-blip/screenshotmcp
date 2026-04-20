export default function DashboardLoading() {
  return (
    <div className="p-8 space-y-6" role="status" aria-label="Loading">
      <div className="space-y-2">
        <div className="h-7 w-48 animate-pulse rounded-md bg-muted" />
        <div className="h-4 w-72 animate-pulse rounded-md bg-muted/70" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-24 animate-pulse rounded-xl border bg-card"
          />
        ))}
      </div>
      <div className="h-72 animate-pulse rounded-xl border bg-card" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="h-56 animate-pulse rounded-xl border bg-card" />
        <div className="h-56 animate-pulse rounded-xl border bg-card" />
      </div>
      <span className="sr-only">Loading dashboard…</span>
    </div>
  );
}
