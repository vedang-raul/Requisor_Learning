// Shown instantly by Next.js App Router while the page segment is loading.
// Matches the app shell layout so there's no jarring layout shift.
export default function AppLoading() {
  return (
    <div className="space-y-8 animate-pulse">
      {/* Page title */}
      <div className="space-y-2">
        <div className="h-8 w-48 rounded-xl bg-zinc-200" />
        <div className="h-4 w-72 rounded-lg bg-zinc-100" />
      </div>
      {/* Stat cards row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 rounded-2xl bg-zinc-100" />
        ))}
      </div>
      {/* Content block */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="col-span-1 h-48 rounded-2xl bg-zinc-100" />
        <div className="col-span-2 h-48 rounded-2xl bg-zinc-100" />
      </div>
      {/* List */}
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-20 rounded-2xl bg-zinc-100" />
        ))}
      </div>
    </div>
  );
}
