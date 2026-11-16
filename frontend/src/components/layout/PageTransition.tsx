import React from 'react';
import { motion } from 'framer-motion';
import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion';

interface PageTransitionProps {
  children: React.ReactNode;
  /** Stable key per route/tab so AnimatePresence can swap pages. */
  motionKey: string;
  className?: string;
}

/**
 * Subtle enter/exit for page/tab content. Honors prefers-reduced-motion.
 * Phase 4 can nest Living Lattice scenes inside these pages without changing this shell.
 */
export const PageTransition: React.FC<PageTransitionProps> = ({
  children,
  motionKey,
  className,
}) => {
  const reduced = usePrefersReducedMotion();

  if (reduced) {
    return (
      <div key={motionKey} className={className}>
        {children}
      </div>
    );
  }

  return (
    <motion.div
      key={motionKey}
      className={className}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
};

export default PageTransition;
