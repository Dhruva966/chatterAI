'use client';

import { useState, useEffect } from 'react';
import { MapPin, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const LS_ASKED = 'chatter_location_asked';
const LS_COORDS = 'chatter_location_hint';

export function LocationPermissionBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Don't show if already asked or if geolocation unavailable
    if (!navigator.geolocation) return;
    const alreadyAsked = localStorage.getItem(LS_ASKED);
    if (!alreadyAsked) {
      // Small delay so the page settles before prompting
      const t = setTimeout(() => setVisible(true), 1200);
      return () => clearTimeout(t);
    }
  }, []);

  const handleEnable = () => {
    setVisible(false);
    localStorage.setItem(LS_ASKED, 'true');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const hint = `${pos.coords.latitude.toFixed(4)},${pos.coords.longitude.toFixed(4)}`;
        localStorage.setItem(LS_COORDS, hint);
      },
      () => {
        // Denied — stored as empty so we don't ask again
        localStorage.setItem(LS_COORDS, '');
      }
    );
  };

  const handleDismiss = () => {
    setVisible(false);
    localStorage.setItem(LS_ASKED, 'true');
    localStorage.setItem(LS_COORDS, '');
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 40 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-full max-w-md px-4"
        >
          <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-background/95 px-4 py-3 shadow-xl backdrop-blur-md">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
              <MapPin className="h-4 w-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground">Enable location?</p>
              <p className="text-xs text-muted-foreground truncate">
                Helps find &ldquo;nearest X&rdquo; businesses automatically
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={handleEnable}
                className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90"
              >
                Enable
              </button>
              <button
                onClick={handleDismiss}
                className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:text-foreground"
                aria-label="Dismiss"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
