import { NextResponse } from "next/server";
import { getEwaySessionForCurrentUser } from "@/lib/eway/session";
import { saveJournal } from "@/lib/eway/journal";
import { logAudit } from "@/lib/audit";
import { notify } from "@/lib/notify";

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

  const subject = typeof body?.subject === "string" ? body.subject : undefined;

  try {
    // saveJournal builds the "<last name>: <AI summary>" subject from
    // contactName + note when no explicit subject is given.
    const result = await saveJournal(sess.session, {
      contactGuid,
      contactName,
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
      notify("fail", `eWay journal save failed for worker ${sess.userId}: ${result.description ?? result.returnCode}`);
      return NextResponse.json(
        { error: result.description ?? result.returnCode, ...result },
        { status: 502 }
      );
    }
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Journal save failed";
    notify("fail", `eWay journal save threw for worker ${sess.userId}: ${message}`);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
