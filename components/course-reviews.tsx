"use client";

import { useState } from "react";
import { Pencil, Star, Trash2 } from "lucide-react";
import { useStore, useCourseReviews } from "@/lib/store";
import { Card, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { cn } from "@/lib/utils";

function StarRow({ rating, size = "h-4 w-4" }: { rating: number; size?: string }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} className={cn(size, i <= Math.round(rating) ? "fill-amber-400 text-amber-400" : "text-zinc-300")} />
      ))}
    </div>
  );
}

function StarPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [hover, setHover] = useState(0);
  return (
    <div className="flex items-center gap-1" onMouseLeave={() => setHover(0)}>
      {[1, 2, 3, 4, 5].map((i) => (
        <button
          key={i}
          type="button"
          onClick={() => onChange(i)}
          onMouseEnter={() => setHover(i)}
          aria-label={`${i} star${i > 1 ? "s" : ""}`}
          className="focus-ring rounded p-0.5"
        >
          <Star className={cn("h-6 w-6 transition", i <= (hover || value) ? "fill-amber-400 text-amber-400" : "text-zinc-300")} />
        </button>
      ))}
    </div>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function CourseReviews({ courseSlug }: { courseSlug: string }) {
  const { upsertReview, deleteReview } = useStore();
  const { reviews, average, count, myReview } = useCourseReviews(courseSlug);
  const [editing, setEditing] = useState(false);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");

  const startEditing = () => {
    setRating(myReview?.rating ?? 0);
    setComment(myReview?.comment ?? "");
    setEditing(true);
  };

  const submit = () => {
    if (rating < 1) return;
    upsertReview(courseSlug, rating, comment);
    setEditing(false);
  };

  const others = reviews.filter((r) => r.id !== myReview?.id);

  return (
    <Card className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <CardTitle>Reviews</CardTitle>
          <div className="mt-1.5 flex items-center gap-2">
            <StarRow rating={average} />
            <span className="text-sm font-semibold text-zinc-800">{average ? average.toFixed(1) : "—"}</span>
            <span className="text-xs text-zinc-500">
              ({count} review{count === 1 ? "" : "s"})
            </span>
          </div>
        </div>
        {!myReview && !editing && (
          <Button size="sm" variant="outline" onClick={startEditing}>
            Write a review
          </Button>
        )}
      </div>

      {/* My review */}
      {myReview && !editing && (
        <div className="rounded-2xl border border-primary/20 bg-primary/[0.04] p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-zinc-900">Your review</span>
                <StarRow rating={myReview.rating} size="h-3.5 w-3.5" />
              </div>
              <p className="mt-1 text-xs text-zinc-500">{formatDate(myReview.at)}</p>
            </div>
            <div className="flex gap-1.5">
              <button
                onClick={startEditing}
                aria-label="Edit your review"
                className="focus-ring rounded-lg p-1.5 text-zinc-500 transition hover:bg-white hover:text-zinc-800"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => deleteReview(myReview.id)}
                aria-label="Delete your review"
                className="focus-ring rounded-lg p-1.5 text-zinc-500 transition hover:bg-white hover:text-red-600"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
          {myReview.comment && <p className="mt-2 text-sm leading-relaxed text-zinc-700">{myReview.comment}</p>}
        </div>
      )}

      {/* Review form */}
      {editing && (
        <div className="space-y-3 rounded-2xl border border-border bg-white p-4">
          <div>
            <p className="mb-1.5 text-xs font-medium text-zinc-600">Your rating</p>
            <StarPicker value={rating} onChange={setRating} />
          </div>
          <Textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Share what you thought of this course… (optional)"
            className="min-h-[90px]"
            aria-label="Review comment"
          />
          <div className="flex gap-2">
            <Button size="sm" disabled={rating < 1} onClick={submit}>
              {myReview ? "Update review" : "Post review"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Other reviews */}
      <div className="space-y-4">
        {others.length === 0 && !myReview && (
          <p className="py-4 text-center text-sm text-zinc-500">No reviews yet — be the first to share your thoughts.</p>
        )}
        {others.map((r) => (
          <div key={r.id} className="border-t border-zinc-100 pt-4 first:border-0 first:pt-0">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-secondary text-xs font-bold text-white">
                {r.userName[0]}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium text-zinc-900">{r.userName}</span>
                  <StarRow rating={r.rating} size="h-3 w-3" />
                </div>
                <p className="text-xs text-zinc-500">{formatDate(r.at)}</p>
              </div>
            </div>
            {r.comment && <p className="mt-2 text-sm leading-relaxed text-zinc-700">{r.comment}</p>}
          </div>
        ))}
      </div>
    </Card>
  );
}
