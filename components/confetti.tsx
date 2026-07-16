"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useMemo, useState } from "react";

const COLORS = ["#6366F1", "#8B5CF6", "#06B6D4", "#F59E0B", "#10B981", "#EC4899"];

export function Confetti({ fire, onDone }: { fire: boolean; onDone?: () => void }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (fire) {
      setVisible(true);
      const t = setTimeout(() => {
        setVisible(false);
        onDone?.();
      }, 2600);
      return () => clearTimeout(t);
    }
  }, [fire, onDone]);

  const pieces = useMemo(
    () =>
      Array.from({ length: 90 }, (_, i) => ({
        id: i,
        x: Math.random() * 100,
        delay: Math.random() * 0.5,
        rotate: Math.random() * 720 - 360,
        color: COLORS[i % COLORS.length],
        size: 6 + Math.random() * 8,
        drift: Math.random() * 40 - 20,
      })),
    []
  );

  return (
    <AnimatePresence>
      {visible && (
        <div className="pointer-events-none fixed inset-0 z-[100] overflow-hidden" aria-hidden>
          {pieces.map((p) => (
            <motion.span
              key={p.id}
              className="absolute rounded-sm"
              style={{ left: `${p.x}%`, top: -20, width: p.size, height: p.size * 0.6, backgroundColor: p.color }}
              initial={{ y: -30, opacity: 1, rotate: 0 }}
              animate={{ y: "110vh", x: p.drift, opacity: [1, 1, 0.8, 0], rotate: p.rotate }}
              exit={{ opacity: 0 }}
              transition={{ duration: 2.2 + Math.random(), delay: p.delay, ease: "easeIn" }}
            />
          ))}
        </div>
      )}
    </AnimatePresence>
  );
}
