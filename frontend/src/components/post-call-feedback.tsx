'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import FeedbackToast from '@/components/ui/feedback-toast';

export function PostCallFeedback({
  taskId,
  initialStatus,
}: {
  taskId: string;
  initialStatus: string;
}) {
  const [visible, setVisible] = useState(false);
  const shown = useRef(false);
  const isMounted = useRef(true);
  const supabase = createClient();

  useEffect(() => {
    return () => { isMounted.current = false; };
  }, []);

  const maybeShow = useCallback(async () => {
    if (shown.current || !isMounted.current) return;
    const { data } = await supabase
      .from('call_feedback')
      .select('id')
      .eq('task_id', taskId)
      .maybeSingle();
    if (!data && isMounted.current) {
      shown.current = true;
      setVisible(true);
    }
  }, [taskId, supabase]);

  useEffect(() => {
    if (initialStatus === 'completed') {
      const t = setTimeout(maybeShow, 1500);
      return () => clearTimeout(t);
    }
    if (initialStatus === 'calling') {
      const interval = setInterval(async () => {
        const { data } = await supabase
          .from('tasks')
          .select('status')
          .eq('id', taskId)
          .single();
        if (data?.status === 'completed' && isMounted.current) {
          clearInterval(interval);
          setTimeout(maybeShow, 800);
        }
      }, 3000);
      return () => clearInterval(interval);
    }
  }, [initialStatus, taskId, maybeShow, supabase]);

  const handleFeedback = async (type: 'up' | 'down', reason?: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from('call_feedback').insert({
      task_id: taskId,
      user_id: user.id,
      rating: type,
      reason: reason ?? null,
    });
  };

  return (
    <FeedbackToast
      visible={visible}
      onClose={() => setVisible(false)}
      onFeedback={handleFeedback}
    />
  );
}
