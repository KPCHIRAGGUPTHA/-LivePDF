# Phase 10.6 — PDF Redlining

## Overview

Phase 10.6 adds **redlining** to LivePDF — the ability for a reviewer to propose specific text changes directly on a PDF, and for the document owner to accept or reject each proposal individually. Once accepted, the system generates a new version of the document with the changes applied, and Phase 6's diff engine automatically highlights what changed.

This is the PDF equivalent of Microsoft Word's "Track Changes." It does not attempt to make PDFs freely editable (that is a different, larger feature — see Phase 13.5, Real-Time Collaborative Editing). Instead, it treats proposed edits as structured, reviewable objects layered on top of the existing document.

This phase builds directly on:
- **Phase 4** — the text layer used for search (reused here for text selection)
- **Phase 5** — Socket.IO real-time infrastructure
- **Phase 6** — the diff engine and PyMuPDF integration
- **Phase 10** — the comment/annotation UI patterns

No new paid dependencies are required. PyMuPDF is already installed from Phase 6.

---

## What This Phase Delivers

- Reviewers can select any block of text on a PDF and propose either a **replacement** or a **deletion**.
- Proposals appear as coloured underlines on the PDF for the owner — red for deletions, blue for replacements — mirroring Word's Track Changes visual language.
- A side panel lists every proposal with the reviewer's name, the original text, and the proposed text.
- The owner accepts or rejects proposals individually.
- Accepted proposals are queued and applied in a single batch operation ("Apply accepted changes"), which generates a brand-new PDF version.
- The new version is automatically diffed against the previous one using the existing Phase 6 diff engine.
- All proposal activity (create, accept, reject, apply) is logged to `audit_logs` for compliance.

---

## User Flow

1. **Reviewer selects text.** Click-and-drag over the PDF's text layer highlights a text block in yellow.
2. **Reviewer proposes a change.** A popup offers "Suggest replacement" or "Suggest deletion." A replacement requires typed replacement text; a deletion just needs confirmation.
3. **Proposal is saved.** The bounding box, page number, original text, and proposed text are written to `edit_proposals` with status `pending`.
4. **Owner reviews proposals.** Opening the document as owner shows underlines on affected text and a proposals panel listing every pending item.
5. **Owner decides.** Each proposal gets an Accept or Reject action. Rejected proposals are marked `rejected` and dismissed from the active view but retained for audit purposes.
6. **Owner applies changes.** Clicking "Apply accepted changes" triggers the batch job described below.
7. **New version is generated.** The Python microservice rewrites the PDF, uploads it to S3, and creates a new `versions` row.
8. **Diff runs automatically.** Phase 6's diff engine compares the new version to the previous one and highlights every change for all viewers.

---

## Data Model

```sql
CREATE TABLE edit_proposals (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id     UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  version_id      UUID NOT NULL REFERENCES versions(id) ON DELETE CASCADE,
  proposed_by     UUID NOT NULL REFERENCES users(id),
  page_number     INTEGER NOT NULL,
  original_text   TEXT NOT NULL,
  proposed_text   TEXT,          -- NULL means deletion
  bbox_x0         FLOAT NOT NULL,
  bbox_y0         FLOAT NOT NULL,
  bbox_x1         FLOAT NOT NULL,
  bbox_y1         FLOAT NOT NULL,
  status          VARCHAR(20) DEFAULT 'pending',  -- pending | accepted | rejected | applied
  decided_at      TIMESTAMPTZ,
  applied_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_edit_proposals_document ON edit_proposals(document_id);
CREATE INDEX idx_edit_proposals_status ON edit_proposals(document_id, status);
```

Notes:
- `bbox_x0/y0/x1/y1` are stored in PDF point coordinates (same convention as Phase 6's diff engine and Phase 10's comment anchors), not screen pixels — this keeps proposals stable across zoom levels and screen sizes.
- `status` gains a fourth value, `applied`, once a batch has been processed, distinguishing "accepted but not yet applied" from "already baked into a version."

---

## Backend API

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/documents/:id/proposals` | Create a new edit proposal |
| `GET` | `/api/documents/:id/proposals` | List proposals for a document (filterable by status) |
| `PATCH` | `/api/proposals/:id/accept` | Mark a proposal as accepted |
| `PATCH` | `/api/proposals/:id/reject` | Mark a proposal as rejected |
| `POST` | `/api/documents/:id/proposals/apply` | Batch-apply all accepted proposals, generate new version |

### Socket.IO events

| Event | Direction | Purpose |
|---|---|---|
| `proposal:created` | server → clients | New proposal added, broadcast to document room |
| `proposal:decided` | server → clients | A proposal was accepted or rejected |
| `proposal:applied` | server → clients | Accepted proposals were applied; new version is ready |

These reuse the document-room pattern from Phase 5 and the `doc:updated` convention from Phase 10.

---

## Applying Changes — Implementation Detail

The apply step runs in the Python microservice, alongside the existing PyMuPDF-based diff logic from Phase 6:

1. Fetch all `edit_proposals` with `status = 'accepted'` for the document's current version.
2. Open the current PDF with PyMuPDF.
3. For each accepted proposal, locate the original text block using its stored bounding box.
4. Use `page.add_redact_annot()` to remove the original text, then `page.apply_redactions()`.
5. If `proposed_text` is not null, use `page.insert_text()` to write the replacement at the same position, matching font size as closely as possible.
6. Save the modified PDF, upload to S3, and create a new `versions` row.
7. Mark all applied proposals as `status = 'applied'` with `applied_at` set.
8. Trigger the Phase 6 diff engine on the new version pair.
9. Emit `proposal:applied` and the existing `doc:updated` event to the document room.

**Known limitation:** because PDFs are fixed-layout, replacement text that is significantly longer or shorter than the original may not reflow cleanly — it can overlap neighbouring content or leave visible gaps. For v1, this is called out in the UI with a note: "Replacement text of a similar length works best." A more robust reflow solution is out of scope for this phase.

---

## Permissions

- Only reviewers with **comment permission** on a share link (the `allow_comments` flag from Phase 10) can create proposals — redlining is treated as an extension of commenting rights, not a separate permission tier.
- Only the **document owner** can accept, reject, or apply proposals.
- Applying changes is blocked while the document is in `Pending Review` state (Phase 10's approval workflow) to avoid conflicting with a formal review already in progress.

---

## Frontend Components

- `TextSelectionLayer` — reuses Phase 4's text layer to detect click-and-drag selections and compute bounding boxes.
- `ProposalPopup` — the "Suggest replacement / Suggest deletion" popup shown after a selection.
- `ProposalUnderlay` — renders red/blue underlines on the PDF canvas at each proposal's stored coordinates, scaling with zoom exactly like Phase 10's comment markers.
- `ProposalsPanel` — the right-hand panel listing all proposals with Accept/Reject buttons, filterable by status.
- `ApplyChangesButton` — triggers the batch apply endpoint and shows progress while the new version is generated.

---

## Audit & Compliance

Every state transition (`created`, `accepted`, `rejected`, `applied`) is written to the existing `audit_logs` table from Phase 1, with `edit_proposal` as the action's subject type. Combined with Phase 10's comment export, this gives compliance-minded teams a full paper trail of who proposed what, who approved it, and exactly which version incorporated it.

---

## What's Explicitly Out of Scope for 10.6

- Real-time simultaneous typing (that's Phase 13.5, which works at the source-document level using Yjs/Tiptap, not on the PDF directly).
- Automatic text reflow when replacement length differs substantially from the original.
- Proposing changes to images, tables, or vector graphics — this phase covers text blocks only.

---

## Cost

$0 in new dependencies. `PyMuPDF`'s `insert_text()` and `add_redact_annot()` are already installed and used by the Phase 6 diff engine. No new frontend libraries are required beyond what Phase 4 and Phase 10 already introduced.
