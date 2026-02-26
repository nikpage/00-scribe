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
  error: string | null;
  created_at: string;
  updated_at: string;
}

export function useRecordings(userId?: string) {
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [loading, setLoading] = useState(true);
  const supabaseRef = useRef(createClient());

  const fetchRecordings = useCallback(async () => {
    if (!userId) return;
    const supabase = supabaseRef.current;

    const { data } = await supabase
      .from("recordings")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (data) setRecordings(data);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    if (!userId) return;

    fetchRecordings();

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
          fetchRecordings();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, fetchRecordings]);

  return { recordings, loading, refetch: fetchRecordings };
}
