"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { TranscriptViewer } from "@/components/transcript-viewer";
import { EwayJournalCard } from "@/components/eway-journal-card";
import { useParams } from "next/navigation";
import { useLang } from "@/hooks/use-lang";
import { useAppUser } from "@/components/app-shell";

interface Recording {
  id: string;
  label: string;
  filename: string;
  recorded_at: string;
  duration_seconds: number | null;
  transcript: { utterances: { speaker: string; text: string }[] } | null;
  speakers: Record<string, string>;
  eway_contact_guid: string | null;
  eway_contact_name: string | null;
}

export default function TranscriptPage() {
  const { lang, t } = useLang();
  const params = useParams();
  const id = params.id as string;
  const user = useAppUser();
  const [recording, setRecording] = useState<Recording | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("recordings")
        .select("id, label, filename, recorded_at, duration_seconds, transcript, speakers, eway_contact_guid, eway_contact_name")
        .eq("id", id)
        .single();

      if (data) setRecording(data);
      setLoading(false);
    }
    load();
  }, [id, supabase]);

  async function handleSaveSpeakers(speakers: Record<string, string>) {
    if (!recording) return;

    await fetch("/api/speakers", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recordingId: recording.id, speakers }),
    });

    setRecording({ ...recording, speakers });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-muted-foreground">{t("loading")}</div>
      </div>
    );
  }

  if (!recording || !recording.transcript) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-muted-foreground">{t("transcriptNotFound")}</div>
      </div>
    );
  }

  return (
    <main className="p-4 md:p-6">
      <div className="mb-6">
        <a href="/transcripts" className="text-sm text-primary hover:underline">
          {t("backToTranscripts")}
        </a>
      </div>

      <div className="mb-6">
        <h2 className="text-2xl font-bold">{recording.label}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {new Date(recording.recorded_at).toLocaleDateString(lang === "cs" ? "cs-CZ" : "en-US", {
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

      <EwayJournalCard
        clientName={recording.label}
        recordedAt={recording.recorded_at}
        initialNote={recording.transcript.utterances.map((u) => u.text).join("\n")}
        initialContactGuid={recording.eway_contact_guid}
        initialContactName={recording.eway_contact_name}
      />

      <TranscriptViewer
        utterances={recording.transcript.utterances}
        speakers={{
          ...(user.name && { "0": user.name }),
          ...(recording.label && { "1": recording.label }),
          ...recording.speakers,
        }}
        suggestions={[user.name, recording.label].filter(Boolean)}
        onSaveSpeakers={handleSaveSpeakers}
      />
    </main>
  );
}
