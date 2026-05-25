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

  const data = (await res.json()) as {
    ReturnCode?: string;
    Description?: string;
    wcfSession?: string;
  };

  const returnCode = data.ReturnCode ?? "rcUnknown";
  return {
    ok: returnCode === "rcSuccess",
    returnCode,
    description: data.Description ?? null,
    sessionId: data.wcfSession ?? null,
  };
}
