"use client";

import { useEffect, useState, useCallback } from "react";
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
  const supabase = createClient();

  const fetchRecordings = useCallback(async () => {
    let query = supabase
      .from("recordings")
      .select("*")
      .order("created_at", { ascending: false });

    if (userId) {
      query = query.eq("user_id", userId);
    }

    const { data } = await query;
    if (data) setRecordings(data);
    setLoading(false);
  }, [supabase, userId]);

  useEffect(() => {
    fetchRecordings();

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
  }, [supabase, fetchRecordings]);

  return { recordings, loading, refetch: fetchRecordings };
}
