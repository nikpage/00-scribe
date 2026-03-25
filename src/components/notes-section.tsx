"use client";

import { useState, useEffect, useCallback } from "react";
import { useLang } from "@/hooks/use-lang";

interface Note {
  id: string;
  content: string;
  created_at: string;
  author: { name: string };
}

interface NotesSectionProps {
  type: "recording" | "worker";
  targetId: string;
}

export function NotesSection({ type, targetId }: NotesSectionProps) {
  const { lang, t } = useLang();
  const [notes, setNotes] = useState<Note[]>([]);
  const [newNote, setNewNote] = useState("");
  const [saving, setSaving] = useState(false);

  const endpoint = type === "recording" ? "/api/notes/recording" : "/api/notes/worker";
  const paramName = type === "recording" ? "recordingId" : "workerId";

  const fetchNotes = useCallback(async () => {
    try {
      const res = await fetch(`${endpoint}?${paramName}=${targetId}`);
      if (res.ok) {
        const { notes: data } = await res.json();
        setNotes(data);
      }
    } catch {
      // silent
    }
  }, [endpoint, paramName, targetId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async fetch sets state via callback
    fetchNotes();
  }, [fetchNotes]);

  async function handleAdd() {
    if (!newNote.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [paramName]: targetId, content: newNote }),
      });
      if (res.ok) {
        setNewNote("");
        fetchNotes();
      }
    } catch {
      // silent
    }
    setSaving(false);
  }

  async function handleDelete(noteId: string) {
    try {
      await fetch(endpoint, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ noteId }),
      });
      fetchNotes();
    } catch {
      // silent
    }
  }

  const locale = lang === "cs" ? "cs-CZ" : "en-US";

  return (
    <div className="space-y-2">
      <h4 className="text-xs font-medium text-muted-foreground">
        {type === "recording" ? t("recordingNotes") : t("workerNotes")}
      </h4>

      {notes.map((note) => (
        <div key={note.id} className="rounded-md border border-border bg-muted/50 p-2 text-sm">
          <div className="flex items-start justify-between">
            <p>{note.content}</p>
            <button
              onClick={() => handleDelete(note.id)}
              className="ml-2 shrink-0 text-xs text-destructive hover:underline"
            >
              {t("deleteNote")}
            </button>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {note.author.name} — {new Date(note.created_at).toLocaleDateString(locale)}
          </p>
        </div>
      ))}

      <div className="flex gap-2">
        <input
          value={newNote}
          onChange={(e) => setNewNote(e.target.value)}
          placeholder={t("notePlaceholder")}
          className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1 text-sm outline-none focus:border-primary"
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
        />
        <button
          onClick={handleAdd}
          disabled={saving || !newNote.trim()}
          className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-white hover:bg-primary-light disabled:opacity-50"
        >
          {t("addNote")}
        </button>
      </div>
    </div>
  );
}
