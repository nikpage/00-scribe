import { NextResponse } from "next/server";
import { getEwaySessionForCurrentUser } from "@/lib/eway/session";
import { saveJournal } from "@/lib/eway/journal";
import { summarizeBrief } from "@/lib/analysis/gemini";
import { logAudit } from "@/lib/audit";

// Subject is "<contact last name>: <brief AI summary>". The picked contact name
// is "Surname, First", so the last name is the part before the comma.
function lastNameOf(contactName: string): string {
  const beforeComma = contactName.split(",")[0]?.trim();
  return beforeComma || contactName.trim();
}

// POST /api/eway/journal — save a contact visit into eWay as a Journal.
//
// Body: { contactGuid, note, eventStart, eventEnd?, subject? }
//   contactGuid  the eWay contact picked by the worker
//   note         the transcribed notes -> Poznámka
//   eventStart   ISO datetime of the visit (date = today, time from phone)
//   eventEnd     optional ISO end; defaults to eventStart
// The fixed dropdowns (Forma, Typ kontaktu, Cílová skupina, counts) come from
// JOURNAL_DEFAULTS on the server.
export async function POST(request: Request) {
  const sess = await getEwaySessionForCurrentUser();
  if (!sess.ok) return NextResponse.json({ error: sess.error }, { status: sess.status });

  const body = await request.json().catch(() => null);
  const contactGuid = typeof body?.contactGuid === "string" ? body.contactGuid : "";
  const note = typeof body?.note === "string" ? body.note : "";
  const eventStart = typeof body?.eventStart === "string" ? body.eventStart : "";
  const eventEnd = typeof body?.eventEnd === "string" ? body.eventEnd : eventStart;
  const contactName = typeof body?.contactName === "string" ? body.contactName : "";

  if (!contactGuid) return NextResponse.json({ error: "Missing contactGuid" }, { status: 400 });
  if (!note.trim()) return NextResponse.json({ error: "Missing note" }, { status: 400 });
  if (!eventStart) return NextResponse.json({ error: "Missing eventStart" }, { status: 400 });

  // Subject = "<last name>: <AI brief summary>". If the worker supplied an
  // explicit subject, honour it; otherwise build it from the note.
  let subject = typeof body?.subject === "string" && body.subject.trim() ? body.subject.trim() : "";
  if (!subject) {
    const last = lastNameOf(contactName);
    let summary = "";
    try {
      summary = await summarizeBrief(note);
    } catch {
      // Summary is best-effort; fall back to just the name if the AI call fails.
    }
    subject = summary ? `${last}: ${summary}` : last;
  }

  try {
    const result = await saveJournal(sess.session, {
      contactGuid,
      note,
      eventStart,
      eventEnd,
      subject,
    });

    await logAudit({
      actorId: sess.userId,
      action: "eway_journal_save",
      targetType: "system",
      metadata: { ok: result.ok, journalGuid: result.journalGuid, contactLinked: result.contactLinked },
    });

    if (!result.ok) {
      return NextResponse.json(
        { error: result.description ?? result.returnCode, ...result },
        { status: 502 }
      );
    }
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Journal save failed" },
      { status: 502 }
    );
  }
}
