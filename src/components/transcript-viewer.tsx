"use client";

import { useState } from "react";
import { useLang } from "@/hooks/use-lang";

interface Utterance {
  speaker: string;
  text: string;
}

interface TranscriptViewerProps {
  utterances: Utterance[];
  speakers: Record<string, string>;
  onSaveSpeakers: (speakers: Record<string, string>) => void;
}

export function TranscriptViewer({
  utterances,
  speakers: initialSpeakers,
  onSaveSpeakers,
}: TranscriptViewerProps) {
  const { t } = useLang();
  const [speakers, setSpeakers] = useState<Record<string, string>>(initialSpeakers);
  const [editing, setEditing] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [saving, setSaving] = useState(false);

  // Get unique speaker IDs
  const speakerIds = [...new Set(utterances.map((u) => u.speaker))];

  function startEdit(speakerId: string) {
    setEditing(speakerId);
    setEditValue(speakers[speakerId] || `Speaker ${speakerId}`);
  }

  async function saveEdit() {
    if (!editing) return;
    setSaving(true);
    const updated = { ...speakers, [editing]: editValue };
    setSpeakers(updated);
    setEditing(null);
    await onSaveSpeakers(updated);
    setSaving(false);
  }

  function getSpeakerName(id: string): string {
    return speakers[id] || `Speaker ${id}`;
  }

  // Assign colors to speakers
  const speakerColors: Record<string, string> = {};
  const colors = [
    "text-blue-600 dark:text-blue-400",
    "text-emerald-600 dark:text-emerald-400",
    "text-purple-600 dark:text-purple-400",
    "text-orange-600 dark:text-orange-400",
    "text-pink-600 dark:text-pink-400",
  ];
  speakerIds.forEach((id, i) => {
    speakerColors[id] = colors[i % colors.length];
  });

  return (
    <div>
      {/* Speaker legend */}
      <div className="mb-6 flex flex-wrap gap-3">
        {speakerIds.map((id) => (
          <div key={id} className="flex items-center gap-2">
            {editing === id ? (
              <div className="flex items-center gap-1">
                <input
                  type="text"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && saveEdit()}
                  className="w-40 rounded border border-border bg-background px-2 py-1 text-sm outline-none focus:border-primary"
                  autoFocus
                />
                <button
                  onClick={saveEdit}
                  disabled={saving}
                  className="rounded bg-primary px-2 py-1 text-xs text-white"
                >
                  {t("save")}
                </button>
                <button
                  onClick={() => setEditing(null)}
                  className="rounded bg-muted px-2 py-1 text-xs"
                >
                  {t("cancel")}
                </button>
              </div>
            ) : (
              <button
                onClick={() => startEdit(id)}
                className={`rounded-full bg-muted px-3 py-1 text-sm font-medium hover:bg-border ${speakerColors[id]}`}
              >
                {getSpeakerName(id)}
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Utterances */}
      <div className="space-y-4">
        {utterances.map((utterance, i) => (
          <div key={i} className="flex gap-3">
            <button
              onClick={() => startEdit(utterance.speaker)}
              className={`shrink-0 text-sm font-semibold ${speakerColors[utterance.speaker]}`}
            >
              {getSpeakerName(utterance.speaker)}:
            </button>
            <p className="text-sm leading-relaxed">{utterance.text}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
