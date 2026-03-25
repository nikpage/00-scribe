"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";

export interface Recording {
  id: string;
  user_id: string;
  label: string;
  filename: string;
  recorded_at: string;
  duration_seconds: number | null;
  file_size_bytes: number | null;
  status: string;
  drive_audio_id: string | null;
  drive_text_id: string | null;
  transcription_id: string | null;
  transcript: { utterances: { speaker: string; text: string }[] } | null;
  speakers: Record<string, string>;
  analysis: {
    summary: string;
    keyTopics: string[];
    questionQuality: { openQuestions: number; closedQuestions: number; ratio: number };
    empathyScore: number;
    actionItems: string[];
    qualityScore: number;
    qualityNotes: string;
  } | null;
  metrics: {
    totalWords: number;
    totalTurns: number;
    durationMinutes: number;
    speakerMetrics: Record<string, { words: number; turns: number; avgWordsPerTurn: number; talkRatio: number }>;
    longestMonologue: { speaker: string; words: number };
    avgTurnLength: number;
  } | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}

export function useRecordings(userId?: string) {
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [loading, setLoading] = useState(true);
  const supabaseRef = useRef(createClient());

  // Fetch via server API (admin client — bypasses RLS)
  const fetchRecordings = useCallback(async () => {
    if (!userId) return;

    try {
      const res = await fetch("/api/recordings");
      if (res.ok) {
        const { recordings: data } = await res.json();
        setRecordings(data);
      }
    } catch {
      // Silently fail — will retry on next poll or Realtime event
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    if (!userId) return;

    // Initial fetch
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch sets state via callback, not synchronously
    void fetchRecordings();

    // Realtime subscription for instant status updates
    const supabase = supabaseRef.current;
    const channel = supabase
      .channel("recordings-changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "recordings",
        },
        () => {
          void fetchRecordings();
        }
      )
      .subscribe();

    // Poll every 10s as fallback (in case Realtime is blocked by RLS)
    const interval = setInterval(fetchRecordings, 10000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [userId, fetchRecordings]);

  return { recordings, loading, refetch: fetchRecordings };
}
