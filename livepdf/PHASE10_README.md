# LivePDF — Phase 10: Document Collaboration & Approval Workflows

## What Phase 10 Covers

Phase 10 transforms LivePDF from a one-way document distribution platform into a two-way collaborative workspace. It introduces inline PDF commenting anchored to PDF point coordinates, threaded discussions, @mentions, real-time Socket.IO synchronization, version-aware comment history, a formal 5-state approval workflow with governance gating, comment PDF export via the Python microservice, and dashboard status integration.

---

## 1. What Inline Comments Actually Mean

An inline comment in LivePDF is anchored to a specific geometric region on a specific page of a PDF document. When a commenter clicks on any point of the PDF canvas in the viewer, a popover input opens allowing them to post a comment. Once submitted, a circular colored marker (badge with sequential comment index) appears floating directly over that exact location. Any viewer with comment permissions who opens the document sees the floating markers. Clicking a marker opens the full thread panel on the right side of the screen.

---

## 2. How Comment Positions Are Stored

Comment positions are captured in screen pixels on click and converted into resolution-independent PDF point coordinates using the current zoom scale factor:

$$\text{PDF Point X} = \frac{\text{Click Screen Pixel X}}{\text{Current Zoom Scale}}$$
$$\text{PDF Point Y} = \frac{\text{Click Screen Pixel Y}}{\text{Current Zoom Scale}}$$

When rendering comments back onto the PDF canvas overlay, PDF point coordinates are multiplied back by the current viewer scale:

$$\text{Screen Pixel Position} = \text{PDF Point} \times \text{Current Zoom Scale}$$

This guarantees that comments remain anchored to the exact text or image region whether the viewer zooms to 75%, 100%, or 150% or views the PDF on different screen resolutions.

---

## 3. Comment Data Model (`server/migrations/phase10.sql`)

```sql
CREATE TABLE IF NOT EXISTS comments (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id       UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  version_id        UUID NOT NULL REFERENCES versions(id) ON DELETE CASCADE,
  user_id           UUID REFERENCES users(id) ON DELETE SET NULL,
  author_name       VARCHAR(255) NOT NULL,
  page_number       INTEGER NOT NULL DEFAULT 1,
  x                 NUMERIC NOT NULL DEFAULT 0,
  y                 NUMERIC NOT NULL DEFAULT 0,
  width             NUMERIC NOT NULL DEFAULT 0,
  height            NUMERIC NOT NULL DEFAULT 0,
  content           TEXT NOT NULL,
  parent_comment_id UUID REFERENCES comments(id) ON DELETE CASCADE,
  is_resolved       BOOLEAN DEFAULT FALSE,
  is_deleted        BOOLEAN DEFAULT FALSE,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_comments_doc ON comments(document_id);
CREATE INDEX IF NOT EXISTS idx_comments_version ON comments(version_id);
CREATE INDEX IF NOT EXISTS idx_comments_parent ON comments(parent_comment_id);
```

---

## 4. Comment Threads and Replies

Threads are modeled hierarchically using `parent_comment_id`:
- **Top-level comments**: `parent_comment_id` is `NULL`.
- **Replies**: `parent_comment_id` points to the top-level comment ID.

Clicking a comment marker or thread in the slide-over panel displays the root comment at the top with the author's avatar, name, timestamp, version badge, and replies listed in chronological order underneath. Submitting a reply saves the reply to the database and broadcasts a real-time `comment:added` Socket.IO event to all viewers in the document room `doc:{docId}`.

---

## 5. Comment Markers on the PDF Canvas (`CommentOverlay.jsx`)

Markers are rendered dynamically on top of the PDF canvas overlay:
- **Sequential Index**: Numbered `#1`, `#2`, `#3` sequentially per page.
- **Color Coding**:
  - **Blue (`#2563eb`)**: Open active comments.
  - **Green (`#16a34a`)**: Resolved comments.
  - **Amber (`#d97706`)**: Open comments containing an unread `@mention` for the current user.
- **Hover Preview**: Hovering over a marker shows a popover previewing author name, timestamp, and a snippet of the comment text.

---

## 6. Resolving Comments

Document owners and the original comment author can toggle a top-level comment's resolution status via the `Resolve` button:
- Resolving sets `is_resolved = TRUE` in the database and changes the marker color from blue to green.
- Resolved comments are hidden from the main canvas and thread panel by default.
- Viewers can toggle the **"Show resolved comments"** switch in the thread panel toolbar to view resolved discussions.
- Emits `comment:resolved` via Socket.IO.

---

## 7. Editing and Deleting Comments

- **15-Minute Edit Window**: Comment authors can edit their comment content within 15 minutes of posting (`NOW() - created_at <= 15 minutes`). Edited comments display an `(edited)` label next to their timestamp.
- **Soft Deletion**: Authors or document owners can delete comments. Deletion is a soft delete (`is_deleted = TRUE`), preserving audit log integrity while removing the thread from the UI.
- Emits `comment:updated` or `comment:deleted` via Socket.IO.

---

## 8. The @Mention System

- **Autocomplete**: Typing `@` in the comment input opens an inline dropdown listing users with document access (owner, private share link recipients, organisation members).
- **Token Format**: Selecting a user inserts a token format `@[Full Name](userId)`.
- **Notifications**: On save, the backend parses mention tokens, extracts user IDs, and inserts records into the `notifications` table:
  `"{Author} mentioned you in a comment on {Document Title}"`.
- **BullMQ Email**: Mentions also queue an email notification job via BullMQ.

---

## 9. Comment Notifications

The system generates 3 notification types:
1. **Mention Notification**: Triggered when a user is `@mentioned`.
2. **Reply Notification**: Sent to thread participants when a reply is posted.
3. **Owner Notification**: Sent to the document owner when a new top-level comment is posted.

---

## 10. Comment Permissions by Link Type (`share_links`)

`share_links` includes an `allow_comments` boolean toggle:
```sql
ALTER TABLE share_links ADD COLUMN IF NOT EXISTS allow_comments BOOLEAN DEFAULT TRUE;
```
- **Share Modal**: Owners can toggle "Allow comments on this link" when generating public, password, or private share links.
- **Enforcement**: If `allowComments` is false, viewers opening the document via that link can read existing comments but cannot post new ones.

---

## 11. Comments Survive Version Updates

Comments are tied to a specific `version_id`. When a new document version is uploaded in Phase 2:
- The viewer displays comments belonging to the current active version under the **"Version X"** tab.
- Comments from earlier versions are accessible under the **"Previous Versions"** tab, providing a complete historical collaboration trail across the document's lifespan.

---

## 12. Approval Workflow — 5 Document States

Documents now support formal review workflows with 5 distinct states stored in `documents.approval_status`:
1. **`Draft`**: Document is being drafted or edited (default).
2. **`Pending Review`**: Submitted for review; designated reviewers must evaluate.
3. **`Approved`**: All required reviewers have approved.
4. **`Rejected`**: At least one reviewer rejected the document.
5. **`Changes Requested`**: Reviewers requested modifications before approval.

```sql
ALTER TABLE documents ADD COLUMN IF NOT EXISTS approval_status VARCHAR(50) DEFAULT 'Draft';
```

---

## 13. Submitting a Document for Approval

Document owners click **"Submit for Review"** in the dashboard or settings panel:
- Opens `SubmitForReviewModal.jsx` where the owner selects required reviewers (from team members and private recipients) and inputs optional review instructions.
- Changes `approval_status` to `Pending Review`.
- Creates reviewer records in `document_approvals` table.
- Sends in-app and email notifications to designated reviewers.
- Emits `approval:updated` via Socket.IO.

---

## 14. Reviewer Actions — Approve, Reject, Request Changes

Designated reviewers see a `ReviewBanner.jsx` header at the top of the viewer:
- **Approve**: Records approval decision (`status = 'approved'`).
- **Reject**: Requires inputting a mandatory rejection reason (`status = 'rejected'`).
- **Request Changes**: Requires inputting feedback detailing requested changes (`status = 'changes_requested'`).

```sql
CREATE TABLE IF NOT EXISTS document_approvals (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id     UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  version_id      UUID NOT NULL REFERENCES versions(id) ON DELETE CASCADE,
  reviewer_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status          VARCHAR(50) NOT NULL DEFAULT 'pending',
  feedback        TEXT,
  round           INTEGER NOT NULL DEFAULT 1,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(document_id, version_id, reviewer_id, round)
);
```

---

## 15. What Happens After Approval Decisions

- **All Approved**: Document `approval_status` automatically transitions to `Approved`. Owner is notified, green badge is displayed, and public sharing becomes eligible.
- **Any Rejected**: Document `approval_status` transitions to `Rejected`. Rejection reason is displayed, owner is notified immediately.
- **Changes Requested**: Document transitions to `Changes Requested`. Owner addresses feedback, uploads a new version, and resubmits to start a new review round (`round + 1`).

---

## 16. Real-Time Approval Status Updates

When any reviewer submits a decision, `approval:updated` Socket.IO events are emitted to the document room:
- Review banners update reviewer counters (e.g. `1 of 3 reviewers approved`) in real time.
- Dashboard document cards update status badges instantly without page refreshes.

---

## 17. Approval History and Audit Trail

Every approval submission, decision, rejection reason, and round transition is recorded in `document_approvals` and logged in `audit_logs`:
- Clicking the document status badge opens `ApprovalHistoryModal.jsx`, displaying the full round-by-round decision timeline.
- History records are permanent for compliance and governance auditing.

---

## 18. Document Status Badges & Dashboard Integration

- **Card Badges**: Document cards in `Dashboard.jsx` feature color-coded status badges:
  - **Grey**: Draft
  - **Blue**: Pending Review
  - **Green**: Approved
  - **Red**: Rejected
  - **Amber**: Changes Requested
- **Status Filter Dropdown**: Dashboard includes a filter dropdown allowing document owners to filter their view by approval status.

---

## 19. Restricting Public Sharing During Review

While a document is in `Pending Review` state:
- If a public share link is accessed, `shareController.js` blocks access with HTTP 403:
  `"This document is currently under review and is not publicly accessible."`
- Private share links for designated reviewers remain active for review access.
- Once Approved, public links resume normal access automatically.

---

## 20. Comment Export PDF Service (`python/comment_exporter.py`)

Document owners can export a comprehensive PDF report of all document comments and approval audit trails:
- **Backend Route**: `GET /api/documents/:docId/comments/export`
- **Python Service Endpoint**: `POST /export-comments`
- **PDF Report Contents**:
  - Header box with document title, export timestamp, and approval status badge.
  - Round-by-round approval workflow decision breakdown (reviewers, status, feedback, dates).
  - Page-by-page comments formatted as structured cards with page numbers, point coordinates, author, timestamp, resolved tag, and nested reply threads.
  - Built using PyMuPDF (`fitz`).

---

## Verification & Execution Steps

### 1. Database Migration
```bash
cd server/migrations
node run_phase10.js
```

### 2. Run Backend & Frontend
```bash
# Backend Server
cd server
npm start

# Python Service
cd python
python main.py

# Frontend App
cd client
npm run dev
```
# this is new Phase 10 for LivePDF 

