"use client";

import { motion, type Variants } from "framer-motion";

// Items appear together with a quick fade: no sliding up, and no one-after-another
// (that read as choppy). The names stay, so every list using them changes at once.
export const fadeUp: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.15, ease: "easeOut" } },
};

export const stagger: Variants = {
  hidden: {},
  show: {},
};

export function PageTransition({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}

/**
 * A section of a page. It used to slide up on its own after the page faded in; now it
 * simply shows with the page (PageTransition's one fade), so nothing trickles in.
 * `delay` is accepted and ignored, for the callers that still pass one.
 */
export function Reveal({ children, className }: { children: React.ReactNode; className?: string; delay?: number }) {
  return <div className={className}>{children}</div>;
}
