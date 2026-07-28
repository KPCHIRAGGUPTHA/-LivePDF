import fitz  # PyMuPDF
from typing import List, Dict, Any
from extractor import download_pdf_from_s3


def apply_redlines(s3_key: str, proposals: List[Dict[str, Any]]) -> bytes:
    """
    Apply accepted redline proposals (replacements & deletions) to a PDF using PyMuPDF (fitz).

    Each proposal dict in proposals:
    {
        "id": str,
        "page_number": int, # 1-indexed page number
        "x": float,
        "y": float,
        "width": float,
        "height": float,
        "original_text": str,
        "proposed_text": str | None,
        "proposal_type": 'replacement' | 'deletion',
    }

    Returns raw bytes of the modified PDF.
    """
    pdf_bytes = download_pdf_from_s3(s3_key)
    doc = fitz.open(stream=pdf_bytes, filetype='pdf')

    # Sort proposals by page number
    sorted_proposals = sorted(proposals, key=lambda p: p.get('page_number', 1))

    for prop in sorted_proposals:
        page_num = prop.get('page_number', 1)
        page_index = max(0, page_num - 1)

        if page_index >= len(doc):
            continue

        page = doc[page_index]

        x = float(prop.get('x', 0))
        y = float(prop.get('y', 0))
        width = float(prop.get('width', 0))
        height = float(prop.get('height', 0))

        # Default fallback box dimensions if bounding box is tiny
        if width <= 0:
            width = 100.0
        if height <= 0:
            height = 14.0

        rect = fitz.Rect(x, y, x + width, y + height)

        # 1. Add redaction annotation over original text (fill with white background)
        page.add_redaction_annot(rect, fill=(1, 1, 1))
        page.apply_redactions()

        # 2. If it's a replacement proposal, write in the proposed text
        proposal_type = prop.get('proposal_type', 'replacement')
        proposed_text = prop.get('proposed_text', '')

        if proposal_type == 'replacement' and proposed_text and proposed_text.strip():
            # Estimate font size from rectangle height
            fontsize = max(8.0, min(14.0, height * 0.75))

            # Attempt to insert within textbox rect
            rc = page.insert_textbox(
                rect,
                proposed_text.strip(),
                fontname="helv",
                fontsize=fontsize,
                color=(0, 0, 0)
            )

            # If text box insertion overflowed or failed, fallback to direct text insertion at baseline
            if rc < 0:
                baseline_point = fitz.Point(rect.x0, rect.y1 - 2)
                page.insert_text(
                    baseline_point,
                    proposed_text.strip(),
                    fontname="helv",
                    fontsize=fontsize,
                    color=(0, 0, 0)
                )

    output_bytes = doc.tobytes()
    doc.close()
    return output_bytes
