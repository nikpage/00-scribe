# eWay-CRM API notes

Reference notes from integrating with eWay's live API (Journal save, contact
search, workflow status). Not needed for everyday work — read this when
extending the eWay integration or debugging a live-API mismatch.

## Transport

- WCF-style JSON API. Every method is a POST to
  `${EWAY_SERVICE_URL}/API.svc/<MethodName>` with `{ sessionId, ...payload }`
  in the body and a `{ ReturnCode, Description, Data }` response. See
  `src/lib/eway/client.ts` (`ewayCall`, `ewayLogin`).
- Auth is "Legacy login": `userName` + MD5 hash of the password (`passwordHash`).
  No OAuth/API-key flow.
- `EWAY_SERVICE_URL` example: `https://hosting.eway-crm.com/liga_vozickaru`.

## Finding real method names / payload shapes

There's a full OpenAPI/Swagger spec for the API — far more reliable than
guessing method names:

- UI: https://swagger.eway-crm.io/
- Raw spec (what the UI actually loads, fetchable directly):
  `https://free.eway-crm.com/31994/API/swagger.json`
- Field/database-schema reference: https://dev.eway-crm.com/docs/database-schema.html
- Client libraries / examples: https://github.com/eway-crm/api
- Postman collection: https://eway.cr/postman

Pull the swagger.json and grep `paths` / `definitions` for the module you
need — this is how the Workflow endpoints (`GetWorkflowModels`,
`SaveWorkflowModel`, `GetWorkflowHistoryRecords`, etc.) and their exact
request/response schemas were found for the "Nahráno AI" workflow stage work.

## Live discovery pattern used in this app

`src/app/api/eway/diag/route.ts` is a standing (currently mostly-empty)
authenticated diagnostic route: it logs in as the current worker's saved
eWay credentials and lets you add a temporary `if (searchParams.get(...))`
branch to call any `ewayCall(session, "<Method>", {...})` and dump the raw
response. This is the fastest way to confirm real field names/enum GUIDs
against your actual eWay instance (constants like `af_41` in `journal.ts`,
or the workflow enum GUIDs below, were confirmed this way) — cheaper than
writing a standalone script, since it reuses the already-authenticated
session pattern and runs with real production secrets without exposing them
locally. Add a branch, deploy, hit the URL while logged in, remove the
branch once done.

## Workflow / status mechanism

eWay doesn't have a separate "attach to workflow" call. A workflow is just:

- A `WorkflowModel` (`GetWorkflowModels`) with `EnumTypeGuid` (the enum whose
  values are the workflow's stages) and `ParentEn` (the enum *value* GUID of
  the item type — e.g. Journal's "SOR" `TypeEn` value — that this workflow
  applies to).
- The actual item (e.g. a `Journal`) has a `StateEn` field (current stage)
  and `PrevStateEn`, set exactly like any other enum field (`TypeEn`,
  `af_NN`) via `resolveEnumValueByType` + `GetEnumValues`.
- `WorkflowHistoryRecord` is an auto-generated audit log of transitions
  (`PrecedentEn` → `SuccedentEn`); nothing writes to it directly.

So "move a record into a workflow stage" = resolve the stage's enum value
GUID and set `StateEn` on save. See `JOURNAL_WORKFLOW_ENUM` /
`WORKFLOW_STAGE_ON_SAVE` in `src/lib/eway/journal.ts`.

### Known GUIDs (this eWay instance — liga_vozickaru)

- SOR JournalType (`TypeEn` value): `a7287bc4-d81c-4fde-8a47-5e078f238a03`
- `JournalType_SOR` workflow's stage enum type:
  `b8793e21-2508-4470-8e64-81a9c6c90f6b`
  - "Nahráno AI": `0c1325c0-804b-11f1-9c99-61c0316f1f9b`
  - "Schváleno": `1a4889a0-804b-11f1-9c99-61c0316f1f9b`
  - "Hotovo": `098c05b0-804b-11f1-9c99-61c0316f1f9b`
  - "Zpracováno osobně": `05791580-804b-11f1-9c99-61c0316f1f9b`
- There's a parallel `JournalType_Poradna` workflow (Poradna journal type)
  with its own, differently-GUID'd copy of the same four stage names —
  don't reuse the SOR enum type GUID for Poradna records or vice versa.

## Env vars / secrets

- `EWAY_SERVICE_URL`, `EWAY_ENC_KEY` (AES-256 key for encrypting saved
  worker passwords, see `src/lib/eway/crypto.ts`) live only in Vercel, marked
  **Sensitive** — `vercel env pull` returns them as empty strings by design,
  it cannot read sensitive values back. If you need to inspect live eWay
  data locally, use the `diag` route pattern above (runs server-side on
  Vercel where the real values are available) rather than trying to pull
  the secrets down.
- Per-worker eWay username/password are stored encrypted in the
  `eway_credentials` Supabase table (`password_ciphertext`/`_iv`/`_tag`),
  decrypted on demand via `decryptSecret` — there is no shared/global eWay
  login for the whole app.
