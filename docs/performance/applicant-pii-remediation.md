# Applicant PII Remediation (backlog D12)

**Scope:** `hrms-acme-corp` job applications and their audit trail · **Production data changed:** none · **Code changed:** development only, not committed or deployed. No Aadhaar number, resume content, applicant name or raw ID appears in this document; all figures are counts from read-only aggregations (read-only MCP verified).

## 1. Verified exposure and overlap **[Measured]**

| Set                                                                   |              Count | Overlap / detail                                                                                                                                                                                                                                                          |
| --------------------------------------------------------------------- | -----------------: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Live `jobapplications`                                                |              **4** | **All 4** hold a non-empty `aadharNo`. **3** hold an inline resume (`data:` base64 PDF URL); **1** holds an S3 reference. No cover letters. Statuses: Applied, Round 1 Rescheduled, Round 3 Scheduled, Hired. All created July 2026; none linked to a `candidates` record |
| Audit rows (`entityType = JobApplication`) with clear-text `aadharNo` |             **57** | **47** belong to the 4 live applications. **10** belong to **2 applications that no longer exist** (no DELETE audit row, so they were removed by an unaudited path); their Aadhaar numbers survive _only_ in the audit log                                                |
| Audit rows with an inline resume (> 1 KB)                             |             **56** | **All 56 also contain Aadhaar** (same rows); 5 distinct applications; largest resume value 102,916 bytes                                                                                                                                                                  |
| Audit rows with a cover letter                                        |                  0 | —                                                                                                                                                                                                                                                                         |
| Audit rows with `ApplicationDraft.data` (applicant form)              |                  4 | 1 draft; contact fields present; no Aadhaar or resume in those rows                                                                                                                                                                                                       |
| `candidates` collection                                               | 0 sensitive fields | Only contact data (by design)                                                                                                                                                                                                                                             |

## 2. Data flow **[Code]**

| Stage                             | Where                                                                                                                         | Aadhaar                                                                                            | Resume                                                                                                                                             | Notes                                                                                                     |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Public application (current)      | `recruitment-service/handlers/applyForJob.ts`                                                                                 | **Not stored.** "aadharNo is still on the wire for old callers but is never stored"                | S3 upload, stored as a reference                                                                                                                   | The recruitment upgrade dropped Aadhaar collection                                                        |
| Legacy applications (≤ July 2026) | same model `JobApplication.aadharNo`, `resume`                                                                                | **Stored in clear**                                                                                | **Inline `data:` URL**                                                                                                                             | Source of all current exposure                                                                            |
| Employee KYC (separate)           | `employee-service/submitKyc.ts` → `User.aadhar_no`                                                                            | **Encrypted at rest** (`safeDecrypt` in user-service `getUser`)                                    | —                                                                                                                                                  | Redacted in audit snapshots by the old exact list (`aadhar_no`), which is why `User` audit rows are clean |
| Resume scoring                    | `recruitment-service/workers/resumeParser.ts`                                                                                 | —                                                                                                  | Decodes `data:` URLs or fetches from S3; text goes to self-hosted Ollama (`OLLAMA_URL`); **only `resumeScore`, `aiNotes` and `status` are stored** | Queue payload is `{ applicationId, requestId }`; DLQ copies only that                                     |
| Audit snapshots                   | `packages/database/src/auditMiddleware.ts`, applied **centrally** to every tenant Prisma client (no per-module snapshot code) | Copied in clear before this change (`aadharNo` not matched by the exact list `aadhar_no`)          | Copied in full                                                                                                                                     | 47 + 10 rows                                                                                              |
| Audit API                         | `api-gateway/handlers/general.ts getAuditLogs` (owners and admins via `requirePrivileged`)                                    | Re-redacted on read, but with the same incomplete list                                             | Returned in full in list responses                                                                                                                 | Fixed in development (§3)                                                                                 |
| Logs                              | `@hrms/logger` → CloudWatch `/hrms/*/dev` (7-day retention), local Loki                                                       | Prisma validation errors echo full query arguments into log text (seen in the local scheduler log) | Same                                                                                                                                               | Fixed in development (§3). Older entries expire by retention                                              |
| Caches                            | `cacheManager`                                                                                                                | No application, draft or candidate caching found                                                   | —                                                                                                                                                  | —                                                                                                         |

**Legitimate need for clear-text values:**

- **Aadhaar on applications:** none. New applications don't collect it; a hired applicant's Aadhaar belongs in KYC on `User`, where it's encrypted.
- **Resume content:** the resume viewer and the scorer need the _file_, which an S3 reference provides. Nothing needs the content inline in the database.

## 3. Development changes (done; tests pass)

| File                                       | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/logger/src/redaction.ts` (new)   | **One shared classifier** for audit and logs. Keys are normalised (`aadharNo`, `aadhar_no`, `AADHAR-NO`, `aadhaarNumber`, `adhaarNo`, `uidaiNumber` → secret; `panNo`/`pan_no`/`panCard`, `bank_account_no`/`bankAccountNumber`, `ifsc_code`, `passport*`, credential-shaped names → secret). `resume`, `resumeText`, `parsedResume`, `coverLetter`/`cover_letter`, `answers` → omitted with a size marker; `ApplicationDraft.data` → omitted (model-scoped, since `data` is generic). **Recursive** over objects and arrays, cycle-safe. Any string over 2 KB or any `data:` URL is omitted even under an unknown key. `scrubText` masks 12-digit Aadhaar-shaped numbers and base64 data URLs inside free text |
| `packages/logger/src/index.ts`             | New `redactSensitiveFormat` in the logger's format chain **after** error serialisation, so it covers every transport (console, CloudWatch, Loki), error messages and stacks, including Prisma's echoed query arguments. No size cut-off in logs (stack traces kept)                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `packages/database/src/auditMiddleware.ts` | Snapshots use the shared classifier, scoped by model. On UPDATE, a hidden field that changed is shown as `"[REDACTED] (changed)"` or `"[OMITTED: N bytes] (changed)"`, so the trail still says _that_ it changed. Actor, tenant, action, entity, IP, timestamps and ordinary fields are unchanged. The "skip noise-only updates" rule (`fcmTokens`, `updatedAt`) is unchanged                                                                                                                                                                                                                                                                                                                                   |
| `apps/api-gateway/src/handlers/general.ts` | Read-time redaction now passes `entityType`, so **legacy rows are hidden from the Audit Log API as soon as this deploys**, before any historical remediation. Authorisation (`requirePrivileged`) unchanged                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |

**Tests** (all fixtures synthetic):

| File                                                        | Covers                                                                                                                                                                                                                                                                                                                                                                  |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/logger/src/__tests__/redaction.test.ts`           | Alias table (secret / omitted / ordinary, including false-positive guards such as `company`, `panel`, `bank_name`, `resumeScore`); deep nesting and arrays; draft `data` scoping; data-URL and oversized omission; cycles; free-text scrubbing of a Prisma-style error message; an end-to-end winston logger asserting **no planted value appears in the emitted line** |
| `packages/database/src/__tests__/auditApplicantPii.test.ts` | CREATE and UPDATE of a `JobApplication` and CREATE of an `ApplicationDraft` through the real middleware: the serialised audit payload contains none of the planted Aadhaar, resume or cover-letter values; metadata is kept; the changed marker works; legacy-row read redaction; unchanged behaviour for ordinary models                                               |
| `packages/database/src/__tests__/auditMiddleware.test.ts`   | Existing; one expectation updated for the intentional `(changed)` marker                                                                                                                                                                                                                                                                                                |

**Results:**

- `packages/logger` + `packages/database`: **118/118**
- gateway `generalHandlers`: **57/57**
- **Full backend suite (after all changes, including the scheduler lease): 3,039/3,039 tests, 229 suites**
- `tsc --noEmit`: clean for logger, database and gateway
- ESLint: clean on changed files

**Deploy note:** `@hrms/logger` and `@hrms/db` must be rebuilt (`dist`) and every service image rebuilt, since all of them use the logger.

## 4. Historical remediation procedure (proposed; not executed)

**Preconditions:**

- Deploy §3 first, so new rows are clean and the API hides legacy values.
- Get a staging copy (Atlas backup restore).

**Step 1: identify (inside the restricted environment only).** Select `_id`s with:

- `jobapplications`: `aadharNo` is a non-empty string, **or** `resume` starts with `data:`;
- `auditlogs`: `entityType = "JobApplication"` with a clear-text `aadharNo` or a resume over 1 KB in `oldValue` or `newValue`; plus the 4 `ApplicationDraft` rows with `data`.

The ID list stays in the restricted environment; reports carry counts only. **Expected: 4 applications; 57 + 4 audit rows.**

**Step 2: back up.** Export exactly those documents to an **encrypted archive** (KMS-encrypted S3 object in a dedicated bucket with no public access, an access list limited to you and the DPO, object lock off, **lifecycle expiry 30 days** after verification sign-off). Nothing is written to logs, tickets or chat.

**Step 3: live applications (staging, then production).**

- For each of the 3 inline resumes: decode the data URL, upload the PDF to the private resume bucket with the same key convention the current upload uses, and set `resume` to that key. Verify the resume viewer and `resumeParser` read it.
- Set `aadharNo` to `null` on all 4. Not needed (§2); the Hired applicant's Aadhaar, if required, belongs in KYC.
- Use `updateMany` by `_id` _without_ the audit middleware's before/after snapshot of the old values, i.e. a raw command. Otherwise the remediation itself writes new audit rows containing the values.

**Step 4: audit rows.**

- In place: `$set` `oldValue.aadharNo` / `newValue.aadharNo` = `"[REDACTED]"`, `oldValue.resume` / `newValue.resume` = `"[OMITTED: N bytes]"`, `oldValue.data` / `newValue.data` (drafts) = `"[OMITTED: N bytes]"`, plus `redactedAt` and `redactionReason = "PII remediation D12"`.
- Actor, action, entity type, timestamps and every other field are preserved, so the trail stays an accountability record.
- The 10 rows for the 2 deleted applications get the same treatment, unless your retention policy says to delete them (decision below).

**Step 5: verify by structure and counts only:**

- Count of clear-text `aadharNo` (non-empty, not `[REDACTED]`) in both collections → **0**.
- Count of `resume` values starting with `data:` → **0**.
- Count of audit rows with resume over 1 KB → **0**.
- Audit row count unchanged (4,530 at last check, plus new rows since).
- Application count unchanged (4).
- Resume viewer opens all 4 resumes; the scorer can fetch them.
- Run on staging first; repeat on production after approval.

**Step 6: rollback.** Restore documents from the archive by `_id` (replace whole document). The S3 resume objects stay until the archive expires.

**Step 7: expiry.** The archive auto-expires 30 days after sign-off. Record the deletion date. CloudWatch log entries expire on their own (7-day retention).

## 5. Approvals required

1. Deploy the §3 code (redaction in audit, API and logs). All services rebuild.
2. Run Steps 1–7 on staging, then production: data change to 4 applications and about 61 audit rows.
3. Retention decision for the **10 audit rows of the 2 deleted applications**: redact (default) or delete.
4. Archive location, access list and the 30-day expiry.
