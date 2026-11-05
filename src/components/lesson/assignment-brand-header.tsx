import { ExternalLink } from "lucide-react";
import type { AssignmentBrand } from "@/lib/courses/assignment-brand";

/** The sponsor at the top of a branded assignment: banner, logo, "Sponsored by", links. Used by the editor's preview and the lesson page. */
export function BrandHeader({ brand }: { brand: AssignmentBrand }) {
  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white" style={brand.accent ? { borderTopColor: brand.accent, borderTopWidth: 3 } : undefined}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {brand.bannerUrl && <img src={brand.bannerUrl} alt="" className="aspect-[4/1] w-full object-cover" />}
      <div className="flex flex-wrap items-center gap-3 px-3 py-2.5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {brand.logoUrl && <img src={brand.logoUrl} alt={`${brand.name} logo`} className="h-9 max-w-[7rem] object-contain" />}
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Sponsored by</p>
          <p className="truncate text-sm font-semibold text-zinc-900">{brand.name || "Brand name"}</p>
        </div>
        {brand.links.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {brand.links.map((l, i) => (
              <a key={i} href={l.url} target="_blank" rel="noopener noreferrer nofollow"
                className="inline-flex items-center gap-1 rounded-full border border-zinc-200 px-2.5 py-1 text-xs font-medium text-zinc-700 hover:border-zinc-300"
                style={brand.accent ? { color: brand.accent, borderColor: `${brand.accent}55` } : undefined}>
                {l.label}<ExternalLink className="h-3 w-3" aria-hidden="true" />
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
