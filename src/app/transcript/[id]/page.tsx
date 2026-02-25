"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { TranscriptViewer } from "@/components/transcript-viewer";
import { useParams } from "next/navigation";

interface Recording {
  id: string;
  label: string;
  filename: string;
  recorded_at: string;
  duration_seconds: number | null;
  transcript: { utterances: { speaker: string; text: string }[] } | null;
  speakers: Record<string, string>;
}

export default function TranscriptPage() {
  const params = useParams();
  const id = params.id as string;
  const [recording, setRecording] = useState<Recording | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("recordings")
        .select("id, label, filename, recorded_at, duration_seconds, transcript, speakers")
        .eq("id", id)
        .single();

      if (data) setRecording(data);
      setLoading(false);
    }
    load();
  }, [id, supabase]);

  async function handleSaveSpeakers(speakers: Record<string, string>) {
    if (!recording) return;

    await fetch("/api/drive", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recordingId: recording.id, speakers }),
    });

    setRecording({ ...recording, speakers });
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!recording || !recording.transcript) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-muted-foreground">Transcript not found.</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="flex">
        {/* Sidebar */}
        <aside className="hidden w-64 shrink-0 border-r border-border bg-muted/50 md:block">
          <div className="p-6">
            <h1 className="text-xl font-bold">Scribe</h1>
          </div>
          <nav className="space-y-1 px-3">
            <a
              href="/transcripts"
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-muted"
            >
              Transcripts
            </a>
            <a
              href="/queue"
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-muted"
            >
              Queue
            </a>
            <a
              href="/manager"
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-muted"
            >
              Manager
            </a>
          </nav>
        </aside>

        {/* Main content */}
        <main className="flex-1 p-6">
          <div className="mb-6">
            <a href="/transcripts" className="text-sm text-primary hover:underline">
              &larr; Back to transcripts
            </a>
          </div>

          <div className="mb-6">
            <h2 className="text-2xl font-bold">{recording.label}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {new Date(recording.recorded_at).toLocaleDateString("cs-CZ", {
                day: "numeric",
                month: "long",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
              {recording.duration_seconds &&
                ` · ${Math.floor(recording.duration_seconds / 60)}:${(recording.duration_seconds % 60).toString().padStart(2, "0")}`}
            </p>
          </div>

          <TranscriptViewer
            utterances={recording.transcript.utterances}
            speakers={recording.speakers}
            onSaveSpeakers={handleSaveSpeakers}
          />
        </main>
      </div>
    </div>
  );
}
