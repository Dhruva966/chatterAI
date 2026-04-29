'use client';

import { useState, useEffect, useRef } from 'react';
import { ThumbsUp, ThumbsDown, X, ArrowLeft } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

type FeedbackType = 'up' | 'down';

type Props = {
  visible: boolean;
  onClose: () => void;
  onFeedback?: (type: FeedbackType, reason?: string) => void;
};

const FEEDBACK_CLOSE_DELAY = 1500;
const AUTO_DISMISS_MS = 10_000;

export default function FeedbackToast({ visible, onClose, onFeedback }: Props) {
  const [selected, setSelected] = useState<FeedbackType | null>(null);
  const [showReasonInput, setShowReasonInput] = useState(false);
  const [reason, setReason] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-dismiss after 10 seconds if user hasn't interacted
  useEffect(() => {
    if (!visible || submitted) return;
    const timer = setTimeout(onClose, AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [visible, submitted, onClose]);

  // Reset state when toast is hidden
  useEffect(() => {
    if (!visible) {
      setSelected(null);
      setShowReasonInput(false);
      setReason('');
      setSubmitted(false);
    }
  }, [visible]);

  // Clear post-submit close timer on unmount to prevent state updates on dead component
  useEffect(() => {
    return () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    };
  }, []);

  const closeAfterDelay = () => {
    closeTimerRef.current = setTimeout(onClose, FEEDBACK_CLOSE_DELAY);
  };

  // Safely fire async onFeedback — swallow rejections so they don't go unhandled
  const fireFeedback = (type: FeedbackType, feedbackReason?: string) => {
    Promise.resolve(onFeedback?.(type, feedbackReason)).catch((err) =>
      console.error('FeedbackToast: onFeedback rejected:', err)
    );
  };

  const handleThumb = (type: FeedbackType) => {
    setSelected(type);
    if (type === 'up') {
      fireFeedback('up');
      setSubmitted(true);
      closeAfterDelay();
    } else {
      setShowReasonInput(true);
    }
  };

  const handleSubmit = () => {
    fireFeedback('down', reason);
    setSubmitted(true);
    closeAfterDelay();
  };

  const handleSkip = () => {
    fireFeedback('down');
    setSubmitted(true);
    closeAfterDelay();
  };

  const handleBack = () => {
    setSelected(null);
    setShowReasonInput(false);
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          transition={{ duration: 0.3, ease: 'easeInOut' }}
          className="fixed right-4 bottom-4 z-50 w-full max-w-sm"
        >
          <motion.div
            layout
            className="bg-background border-border overflow-hidden rounded-xl border p-4 shadow-xl"
          >
            {!submitted ? (
              <>
                {selected === null && (
                  <motion.div layout className="flex items-center justify-between">
                    <p className="text-foreground text-sm font-medium">Was this call helpful?</p>
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Thumbs up"
                        onClick={() => handleThumb('up')}
                        className="cursor-pointer"
                      >
                        <ThumbsUp className="h-4 w-4 text-green-600" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Thumbs down"
                        onClick={() => handleThumb('down')}
                        className="cursor-pointer"
                      >
                        <ThumbsDown className="h-4 w-4 text-red-600" />
                      </Button>
                    </div>
                  </motion.div>
                )}

                {selected === 'down' && showReasonInput && (
                  <motion.div layout className="mt-2 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-foreground text-sm font-medium">What could be better?</p>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label="Close"
                        onClick={onClose}
                        className="text-muted-foreground hover:text-foreground cursor-pointer"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>

                    <Textarea
                      placeholder="Share your reason (optional)"
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      className="w-full resize-none"
                      rows={3}
                    />

                    <div className="flex items-center justify-between">
                      <div className="flex gap-2">
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label="Back"
                          onClick={handleBack}
                          className="cursor-pointer"
                        >
                          <ArrowLeft className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="link"
                          onClick={handleSkip}
                          className="text-muted-foreground cursor-pointer px-0"
                        >
                          Skip
                        </Button>
                      </div>
                      <Button onClick={handleSubmit} className="cursor-pointer">
                        Submit
                      </Button>
                    </div>
                  </motion.div>
                )}
              </>
            ) : (
              <motion.p layout className="text-foreground text-sm">
                Thanks — we appreciate your feedback!
              </motion.p>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
