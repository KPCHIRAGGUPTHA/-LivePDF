# LivePDF Project History — Phase-by-Phase Evolution

This document captures the entire history of the LivePDF project. It documents every feature, backend module, frontend component, database schema migration, and structural improvement introduced from Phase 1 through Phase 9.

---

## Technical Stack Overview

* **Frontend**: Vite + React, Vanilla CSS, `react-pdf` (PDF.js) for canvas rendering, Socket.io-client.
* **Backend API**: Node.js + Express, PostgreSQL (`pg` database client), Redis (`ioredis` + `BullMQ` for queues).
* **Python Microservice**: FastAPI, PyMuPDF (`fitz`), Python `difflib` for text diff coordinate parsing.
* **AI & Embeddings**: Google GenAI (Gemini), HuggingFace Inference (`all-MiniLM-L6-v2`), PostgreSQL `pgvector`.
* **DevOps**: Docker, Docker Compose, Nginx, Let's Encrypt (Certbot), AWS EC2, Sentry, CloudWatch, GitHub Actions.

---

## Phase-by-Phase Roadmap

```mermaid
gantt
    title LivePDF Development Phases
    dateFormat  YYYY-MM-DD
    section Core Infrastructure
    Phase 1: Setup & User Auth               :active, p1, 2026-07-01, 3d
    Phase 2: PDF Upload & Versioning        :p2, after p1, 3d
    Phase 3: Share Link Engine              :p3, after p2, 3d
    section Viewer & Collaboration
    Phase 4: Custom Canvas PDF Viewer        :p4, after p3, 2d
    Phase 5: Socket.IO Real-Time Sync        :p5, after p4, 2d
    section Diff & AI Engine
    Phase 6: FastAPI Visual Diff Engine     :p6, after p5, 4d
    Phase 7: AI Summaries & Vector Q&A (RAG) :p7, after p6, 4d
    section Enterprise & Scale
    Phase 8: Notifications, Auditing, Security:p8, after p7, 3d
    Phase 9: Production, Stripe, Public API  :p9, after p8, 5d
```

---

### **Phase 1: Project Setup & User Auth**
The foundation phase. Established directory boundaries between server and client, configured databases, and built secure authentication.

* **Key Features**:
  * User signup, login, and validation using JWT tokens stored securely.
  * OTP (One-Time Password) email generation using Gmail SMTP.
* **Modules & Controllers**:
  * `server/src/controllers/authController.js`: Handles signup, login, OTP dispatch, and confirmation.
  * `server/src/middleware/auth.js`: Restricts routes using standard Bearer JWT checks.
  * `server/src/utils/mailer.js`: NodeMailer configuration template for SMTP dispatch.
* **Database Schema (`phase1.sql`)**:
  * `users`: `id` (UUID), `email`, `password_hash`, `is_verified`, `created_at`.
  * `otps`: `email`, `otp_code`, `expires_at`.
* **Key Improvements**:
  * Shifted from session cookies to stateless, scalable JWT tokens.
  * Required mandatory email OTP verification before allowing document access.

---

### **Phase 2: PDF Upload & Storage**
Allows users to upload PDFs and replacement versions, backed by AWS S3 cloud storage.

* **Key Features**:
  * PDF drag-and-drop zone.
  * In-memory multer storage (files never write to Express local disk for security).
  * AWS S3 bucket file storage under unique directories.
  * Historical version listings.
* **Modules & Controllers**:
  * `server/src/controllers/documentController.js`: Handles S3 uploads, downloads, and version replacement.
  * `server/src/config/s3.js`: AWS S3 client configuration.
  * `server/src/utils/s3Uploader.js`: Helper function to put object and sign temporary URLs.
* **Database Schema (`phase2.sql`)**:
  * `documents`: `id` (UUID), `title`, `owner_id`, `created_at`.
  * `versions`: `id` (UUID), `document_id`, `version_number` (Integer), `s3_key`, `file_size`, `created_at`.
* **Key Improvements**:
  * Prevented direct S3 resource exposure by generating temporary signed URLs (e.g. 15-minute expiration) whenever a user accesses a PDF.

---

### **Phase 3: Share Link Engine**
Solves the "WhatsApp sharing problem" — generating static links that dynamically serve the latest version of a document.

* **Key Features**:
  * Share modal with Public, Private, and Password-Protected access links.
  * Dynamic version resolution (recipients always see the latest version automatically).
  * Audit trails.
* **Modules & Controllers**:
  * `server/src/controllers/shareController.js`: Generates, resolves, and revokes secure sharing links.
* **Database Schema (`phase3.sql`)**:
  * `share_links`: `id`, `document_id`, `token` (64-character random string), `link_type` (`public`, `private`, `protected`), `password_hash`, `allowed_emails`, `allow_download` (Boolean), `expires_at`.
  * `audit_logs`: `id`, `document_id`, `action` (`view`, `download`, `upload`), `user_id`, `ip_address`, `user_agent`, `created_at`.
* **Key Improvements**:
  * Added cryptographically secure tokens (`crypto.randomBytes(32)`) for URLs to make link harvesting impossible.
  * Hashed protected link passwords using `bcryptjs` (salt rounds: 10).

---

### **Phase 4: Custom Canvas PDF Viewer**
Swapped basic browser `<iframe>` displays with a customizable rendering pipeline using PDF.js.

* **Key Features**:
  * Canvas-based PDF page rendering.
  * Toolbar: Zoom In/Out, Fit-to-Width, Page Up/Down, Fullscreen Mode.
  * Client-side search within PDF text.
  * Security restriction: Disabling PDF download button depending on share link settings.
* **Modules & Components**:
  * `client/src/components/PdfViewer.jsx`: Main UI component utilizing `react-pdf` to render pages as HTML canvas overlays.
  * `client/src/components/ViewerToolbar.jsx`: User navigation controls.
* **Key Improvements**:
  * Swapping iframes with canvas allowed developers to directly override default browser print commands, block right-click downloads, and layout coordinates on top of PDF text blocks.

---

### **Phase 5: Real-Time Synchronization**
Bridges document owners and viewers instantly via persistent WebSockets, letting viewers see updates without page refreshes.

* **Key Features**:
  * Dynamic viewer counter showing how many active windows have a share link open.
  * Live alert notification toast when a replacement PDF version is uploaded.
  * Automated document replacement (renders the new version instantly).
  * Synchronization (optionally syncing scroll height and page numbers from presenter to viewers).
* **Modules & Connections**:
  * `server/src/socket.js`: Express Socket.IO server initialization. Manages viewer room joins/leaves.
  * `client/src/hooks/useSocket.js`: React hook subscribing to WebSocket events.
* **Key Improvements**:
  * Avoided performance-heavy database polling by pushing server-side upload notifications instantly using Socket.IO events (`diff:ready`, `doc:updated`).

---

### **Phase 6: Diff Engine**
Built a standalone Python microservice to compare PDF text page-by-page and draw visual highlights on the canvas.

* **Key Features**:
  * Red overlays for removed text, Green overlays for added text, and Amber overlays for modifications.
  * Tooltips displaying old vs. new text when clicking overlays.
  * Dynamic overlay scaling on window resize or zoom.
* **Modules & microservices**:
  * `python/main.py`: FastAPI server receiving old and new S3 keys, executing comparison pipelines.
  * `python/extractor.py`: Extracts text strings and exact canvas bounding boxes using PyMuPDF (`fitz`).
  * `python/differ.py`: Employs Python's standard `difflib.SequenceMatcher` to generate diff segments.
* **Database Schema (`phase6.sql`)**:
  * `version_diffs`: `id`, `document_id`, `old_version_id`, `new_version_id`, `change_map` (JSONB storing coordinates/text), `total_changes`, `added_count`, `removed_count`, `modified_count`, `computed_at`.
* **Key Improvements**:
  * Shifted complex calculations away from the main Node.js event-loop to a dedicated Python subprocess, preventing API lag on large files.

---

### **Phase 7: AI Features**
Integrated Gemini AI and Vector Embeddings for smart summarization and document Q&A.

* **Key Features**:
  * Natural language Q&A (RAG chat window) responding with accurate page references.
  * LLM-generated plain English change summaries.
  * AI importance classification (Critical, High, Low importance) mapping changes to contract risks.
* **Modules & Services**:
  * `server/src/services/aiService.js`: Gemini API integration for summaries and risk scores.
  * `server/src/services/embeddingService.js`: Chunks text pages and contacts HuggingFace (`all-MiniLM-L6-v2`) for vector generation.
  * `server/src/services/qaService.js`: Performs similarity vector lookups and runs RAG prompt construction.
* **Database Schema (`phase7.sql`)**:
  * `ai_summaries`: `version_diff_id` (Primary Key), `summary_text`, `model_used`, `prompt_tokens`, `completion_tokens`.
  * `embeddings`: `id`, `document_id`, `version_id`, `chunk_index`, `chunk_text`, `page_number`, `embedding` (type `vector(384)` or REAL[] fallback array).
* **Key Improvements**:
  * Added fallback similarity algorithms in pure JS if standard PostgreSQL `pgvector` index queries are not active.
  * Cached AI outputs in `ai_summaries` to prevent duplicate LLM cost charges.

---

### **Phase 8: Notifications, Audit & Security**
Hardened the system with background queues, unread counters, activity auditing, and dynamic document watermarks.

* **Key Features**:
  * In-app notification panel showing a history of activities.
  * BullMQ + Redis background worker to send update alerts to email subscribers without lag.
  * Audit panel showing a ledger of actions, IP addresses, and user-agents.
  * PDF canvas watermarking (watermarks recipient's email diagonally across pages to deter leaking).
* **Modules & Security Services**:
  * `server/worker.js`: Instantiates a standalone BullMQ worker processing `emailQueue` tasks.
  * `client/src/components/WatermarkOverlay.jsx`: Renders custom watermarks on top of the PDF.
* **Database Schema (`phase8.sql`)**:
  * `notifications`: `id`, `user_id`, `document_id`, `message`, `is_read`, `created_at`.
* **Key Improvements**:
  * Moved SMTP email delivery to background tasks. An upload request no longer blocks waiting on SMTP socket handshakes.

---

### **Phase 9: Production Deployment, Stripe Billing, Organisations & Public API**
Scaled the system for commercial operations, introducing monetization tiers, team roles, and public API interfaces.

* **Key Features**:
  * Tiered subscription plans (Free, Pro, Enterprise) validated on uploads and AI requests.
  * Organizations (Teams) with admin, editor, and viewer roles.
  * Public REST API (developer keys) rate-limited via sliding-window rate limiters.
  * Dockerization of all components.
  * Automated DB backup cron tasks logging to Amazon S3.
  * Sentry logs tracking runtime errors in production.
  * GitHub actions pipeline automatically compiling frontend and pushing backend containers on git branch pushes.
* **Modules & Core Midde-tier**:
  * `server/src/middleware/planEnforcer.js`: Checks user plans and blocks action if limits are hit.
  * `server/src/controllers/stripeController.js`: Direct Stripe subscription checkout session manager and webhook processor.
  * `server/src/middleware/apiKeyAuth.js`: Validates bearer API developer keys against DB hashes.
  * `server/src/middleware/rateLimiter.js`: Redis-backed window counter for developer key calls.
* **Database Schema (`phase9.sql`)**:
  * `users` updates: `stripe_customer_id`, `stripe_subscription_id`, `plan` (FREE, PRO, ENTERPRISE).
  * `organisations`: `id`, `name`, `owner_id`, `created_at`.
  * `organisation_members`: `organisation_id`, `user_id`, `role` (`admin`, `editor`, `viewer`).
  * `organisation_documents`: `organisation_id`, `document_id`.
  * `api_keys`: `id`, `name`, `key_hash`, `user_id`, `scope`, `last_used_at`, `revoked_at`.
* **Key Improvements**:
  * Standardized environments across Docker containers.
  * Set up rate-limiting on API tokens to guard backend resources from automated spam.
