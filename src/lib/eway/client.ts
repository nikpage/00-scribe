import { createHash } from "node:crypto";

// eWay-CRM Web Service API — the LogIn endpoint exchanges username + an
// MD5 of the password for a session ID (wcfSession) that authenticates
// subsequent calls. ReturnCode === "rcSuccess" means the credentials were
// accepted. Anything else (rcBadLogin, rcLicenseRestriction, etc.) we
// surface verbatim so the worker sees the real reason.
//
// Service URL comes from EWAY_SERVICE_URL (e.g.
// "https://hosting.eway-crm.com/liga_vozickaru"). We append /API.svc/<Method>.

const APP_VERSION = "Scribe1.0";
const CLIENT_MACHINE_IDENTIFIER = "scribe-server";

export interface EwayLoginResult {
  ok: boolean;
  returnCode: string;
  description: string | null;
  sessionId: string | null;
}

function getServiceUrl(): string {
  const url = process.env.EWAY_SERVICE_URL;
  if (!url) throw new Error("EWAY_SERVICE_URL is not set");
  return url.replace(/\/+$/, "");
}

export interface EwayCallResult {
  ok: boolean;
  returnCode: string;
  description: string | null;
  data: unknown;
  raw: unknown;
}

// Generic authenticated call. All eWay API methods take a sessionId (from
// LogIn) in the body alongside any method-specific fields, and answer with a
// ReturnCode plus a Data payload. We return the parsed result verbatim so the
// caller can inspect both success and failure.
export async function ewayCall(
  sessionId: string,
  method: string,
  payload: Record<string, unknown> = {}
): Promise<EwayCallResult> {
  const res = await fetch(`${getServiceUrl()}/API.svc/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId, ...payload }),
  });

  if (!res.ok) {
    return {
      ok: false,
      returnCode: `http_${res.status}`,
      description: `eWay returned HTTP ${res.status} for ${method}`,
      data: null,
      raw: null,
    };
  }

  const json = (await res.json()) as {
    ReturnCode?: string;
    Description?: string;
    Data?: unknown;
  };
  const returnCode = json.ReturnCode ?? "rcUnknown";
  return {
    ok: returnCode === "rcSuccess",
    returnCode,
    description: json.Description ?? null,
    data: json.Data ?? null,
    raw: json,
  };
}

function md5Hex(input: string): string {
  return createHash("md5").update(input, "utf8").digest("hex");
}

export async function ewayLogin(
  username: string,
  password: string
): Promise<EwayLoginResult> {
  const body = {
    userName: username,
    passwordHash: md5Hex(password),
    appVersion: APP_VERSION,
    clientMachineIdentifier: CLIENT_MACHINE_IDENTIFIER,
  };

  const res = await fetch(`${getServiceUrl()}/API.svc/LogIn`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    return {
      ok: false,
      returnCode: `http_${res.status}`,
      description: `eWay returned HTTP ${res.status}`,
      sessionId: null,
    };
  }

  const data = (await res.json()) as Record<string, unknown> & {
    ReturnCode?: string;
    Description?: string;
  };

  const returnCode = (typeof data.ReturnCode === "string" ? data.ReturnCode : null) ?? "rcUnknown";

  // eWay returns the session id under a key whose exact name/casing varies by
  // version (wcfSession, WcfSession, SessionId…). Prefer the documented
  // wcfSession, but fall back to any string key that looks like a session so a
  // successful login never comes back without its id.
  let sessionId: string | null =
    typeof data.wcfSession === "string" && data.wcfSession.length > 0 ? data.wcfSession : null;
  if (!sessionId) {
    const entry = Object.entries(data).find(
      ([k, v]) => typeof v === "string" && /session/i.test(k) && v.length > 0
    );
    sessionId = entry ? (entry[1] as string) : null;
  }

  return {
    ok: returnCode === "rcSuccess",
    returnCode,
    description: typeof data.Description === "string" ? data.Description : null,
    sessionId,
  };
}
