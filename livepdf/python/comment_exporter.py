# type: ignore
# pyright: reportMissingImports=false
# pyrefly: ignore [missing-import]
from io import BytesIO
import datetime
import html
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle

def generate_comments_pdf_report(payload: dict) -> bytes:
    """
    Generates a structured PDF report containing comment threads and approval history
    using ReportLab (or PyMuPDF as fallback).
    """
    try:
        return _generate_with_reportlab(payload)
    except Exception as rl_err:
        print(f"ReportLab export error: {rl_err}, trying PyMuPDF fallback...")
        try:
            import fitz
            return _generate_with_fitz(payload)
        except Exception:
            raise rl_err


def _generate_with_reportlab(payload: dict) -> bytes:
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        leftMargin=36,
        rightMargin=36,
        topMargin=36,
        bottomMargin=36,
    )

    styles = getSampleStyleSheet()
    
    title_style = ParagraphStyle(
        'DocTitle',
        parent=styles['Heading1'],
        fontName='Helvetica-Bold',
        fontSize=15,
        leading=18,
        textColor=colors.HexColor('#0f172a'),
    )

    meta_style = ParagraphStyle(
        'MetaText',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=9,
        leading=13,
        textColor=colors.HexColor('#475569'),
    )

    section_heading = ParagraphStyle(
        'SectionHeading',
        parent=styles['Heading2'],
        fontName='Helvetica-Bold',
        fontSize=11,
        leading=15,
        textColor=colors.HexColor('#1e293b'),
        spaceBefore=10,
        spaceAfter=4,
    )

    comment_header_style = ParagraphStyle(
        'CommentHeader',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=9.5,
        leading=13,
        textColor=colors.HexColor('#1e40af'),
    )

    comment_body_style = ParagraphStyle(
        'CommentBody',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=9,
        leading=13,
        textColor=colors.HexColor('#0f172a'),
    )

    reply_body_style = ParagraphStyle(
        'ReplyBody',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=8.5,
        leading=12,
        textColor=colors.HexColor('#334155'),
    )

    story = []

    # ── 1. Document Title Header ──────────────────────────────────────────
    raw_title = payload.get("title", "Untitled Document")
    title = html.escape(str(raw_title))
    approval_status = html.escape(str(payload.get("approvalStatus", "Draft")).upper())
    export_time = datetime.datetime.now().strftime("%B %d, %Y - %H:%M:%S")

    status_color = "#16a34a" if approval_status == "APPROVED" else "#dc2626" if approval_status == "REJECTED" else "#d97706" if approval_status == "CHANGES REQUESTED" else "#2563eb"

    header_data = [
        [
            Paragraph(f"<b>LivePDF — Collaboration & Comment Report</b><br/><font size=10 color='#334155'>Document: {title}</font>", title_style),
            Paragraph(f"<font color='{status_color}'><b>Status: {approval_status}</b></font><br/><font size=8 color='#64748b'>Exported: {export_time}</font>", meta_style)
        ]
    ]

    header_table = Table(header_data, colWidths=[380, 160])
    header_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#f8fafc')),
        ('BOX', (0, 0), (-1, -1), 1, colors.HexColor('#cbd5e1')),
        ('PADDING', (0, 0), (-1, -1), 8),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ]))
    story.append(header_table)
    story.append(Spacer(1, 12))

    # ── 2. Approval Audit Trail ──────────────────────────────────────────
    approvals = payload.get("approvals", [])
    if approvals:
        story.append(Paragraph("APPROVAL WORKFLOW AUDIT TRAIL", section_heading))
        story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor('#cbd5e1'), spaceBefore=2, spaceAfter=6))

        approval_table_data = [
            [
                Paragraph("<b>Round</b>", meta_style),
                Paragraph("<b>Reviewer</b>", meta_style),
                Paragraph("<b>Status</b>", meta_style),
                Paragraph("<b>Feedback / Notes</b>", meta_style)
            ]
        ]

        for app in approvals:
            r_num = app.get("round", 1)
            r_name = html.escape(str(app.get("reviewerName", "Reviewer")))
            r_email = html.escape(str(app.get("reviewerEmail", "")))
            r_status = html.escape(str(app.get("status", "pending")).upper())
            r_feedback = html.escape(str(app.get("feedback", "N/A") or "—"))

            st_clr = "#16a34a" if r_status == "APPROVED" else "#dc2626" if r_status == "REJECTED" else "#d97706"
            
            approval_table_data.append([
                Paragraph(f"Round {r_num}", meta_style),
                Paragraph(f"<b>{r_name}</b><br/><font size=8 color='#64748b'>{r_email}</font>", meta_style),
                Paragraph(f"<font color='{st_clr}'><b>[{r_status}]</b></font>", meta_style),
                Paragraph(r_feedback, meta_style),
            ])

        app_table = Table(approval_table_data, colWidths=[55, 145, 90, 250])
        app_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#f1f5f9')),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#e2e8f0')),
            ('PADDING', (0, 0), (-1, -1), 6),
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ]))
        story.append(app_table)
        story.append(Spacer(1, 12))

    # ── 3. Comments Section ──────────────────────────────────────────────
    comments = payload.get("comments", [])
    story.append(Paragraph(f"INLINE COMMENTS ({len(comments)} Total)", section_heading))
    story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor('#cbd5e1'), spaceBefore=2, spaceAfter=6))

    if not comments:
        story.append(Paragraph("<i>No comments have been recorded on this document.</i>", meta_style))
    else:
        top_level = [c for c in comments if not c.get("parentCommentId")]
        replies_by_parent = {}
        for r in comments:
            pid = r.get("parentCommentId")
            if pid:
                replies_by_parent.setdefault(pid, []).append(r)

        for idx, comment in enumerate(top_level, start=1):
            author = html.escape(str(comment.get("authorName", "Anonymous")))
            page_num = comment.get("pageNumber", 1)
            cx = comment.get("x", 0)
            cy = comment.get("y", 0)
            text = html.escape(str(comment.get("content", "")))
            is_resolved = comment.get("isResolved", False)
            version_num = comment.get("versionNumber", 1)
            created_at = str(comment.get("createdAt", ""))[:19].replace("T", " ")

            res_tag = "[RESOLVED]" if is_resolved else "[OPEN]"
            tag_color = "#16a34a" if is_resolved else "#2563eb"

            comment_content = [
                Paragraph(f"<b>#{idx} | Page {page_num} (x: {cx:.1f}, y: {cy:.1f}) — <font color='{tag_color}'>{res_tag}</font></b>", comment_header_style),
                Paragraph(f"<b>{author}</b> <font size=8 color='#64748b'>• v{version_num} • {created_at}</font>", meta_style),
                Spacer(1, 4),
                Paragraph(text, comment_body_style),
            ]

            thread_replies = replies_by_parent.get(comment.get("id"), [])
            if thread_replies:
                comment_content.append(Spacer(1, 4))
                for rep in thread_replies:
                    rep_author = html.escape(str(rep.get("authorName", "Anonymous")))
                    rep_text = html.escape(str(rep.get("content", "")))
                    rep_time = str(rep.get("createdAt", ""))[:19].replace("T", " ")
                    comment_content.append(
                        Paragraph(f"<b>↳ {rep_author}</b> <font size=8 color='#64748b'>({rep_time})</font>: {rep_text}", reply_body_style)
                    )

            card_table = Table([[comment_content]], colWidths=[540])
            card_bg = colors.HexColor('#f8fafc') if is_resolved else colors.HexColor('#ffffff')
            card_border = colors.HexColor('#16a34a') if is_resolved else colors.HexColor('#cbd5e1')
            card_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, -1), card_bg),
                ('BOX', (0, 0), (-1, -1), 1, card_border),
                ('PADDING', (0, 0), (-1, -1), 8),
            ]))
            story.append(card_table)
            story.append(Spacer(1, 8))

    doc.build(story)
    return buffer.getvalue()


def _generate_with_fitz(payload: dict) -> bytes:
    import fitz
    doc = fitz.open()
    page = doc.new_page(width=595.28, height=841.89)
    page.insert_text(fitz.Point(40, 40), f"Comments Report: {payload.get('title', 'Document')}", fontsize=14)
    return doc.write()
