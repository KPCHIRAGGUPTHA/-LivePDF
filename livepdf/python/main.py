# type: ignore
# pyright: reportMissingImports=false
# pyrefly: ignore [missing-import]
from fastapi import FastAPI, HTTPException, Response, Body
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional
from comparator import compute_diff
from scorer import score_all_changes
from comment_exporter import generate_comments_pdf_report
from redliner import apply_redlines
import uvicorn
import os

from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title='LivePDF Diff Engine & Export Service', version='1.0.0')

# Enable CORS for browser / microservice requests
app.add_middleware(
    CORSMiddleware,
    allow_origins=['*'],
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)


class DiffRequest(BaseModel):
    old_s3_key: str
    new_s3_key: str


class DiffResponse(BaseModel):
    changes: List[Dict[str, Any]]
    total_changes: int
    added_count: int
    removed_count: int
    modified_count: int


class CommentExportRequest(BaseModel):
    docId: Optional[str] = None
    title: Optional[str] = 'Untitled Document'
    approvalStatus: Optional[str] = 'Draft'
    comments: Optional[List[Dict[str, Any]]] = Field(default_factory=list)
    approvals: Optional[List[Dict[str, Any]]] = Field(default_factory=list)


class RedlineProposalItem(BaseModel):
    id: str
    page_number: int = Field(default=1, alias="pageNumber")
    x: float = 0.0
    y: float = 0.0
    width: float = 0.0
    height: float = 0.0
    original_text: str = Field(default="", alias="originalText")
    proposed_text: Optional[str] = Field(default=None, alias="proposedText")
    proposal_type: str = Field(default="replacement", alias="proposalType")

    class Config:
        populate_by_name = True


class RedlineApplyRequest(BaseModel):
    s3_key: str
    proposals: List[Dict[str, Any]]


@app.get('/health')
def health():
    return {'status': 'ok', 'service': 'livepdf-diff-engine'}


@app.post('/diff', response_model=DiffResponse)
def run_diff(body: DiffRequest):
    try:
        changes = compute_diff(body.old_s3_key, body.new_s3_key)
        changes = score_all_changes(changes)

        return DiffResponse(
            changes=changes,
            total_changes=len(changes),
            added_count=sum(1 for c in changes if c.get('type') == 'ADDED'),
            removed_count=sum(1 for c in changes if c.get('type') == 'REMOVED'),
            modified_count=sum(1 for c in changes if c.get('type') == 'MODIFIED'),
        )
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.post('/export-comments')
def export_comments(payload: Dict[str, Any] = Body(...)):
    try:
        pdf_bytes = generate_comments_pdf_report(payload)
        return Response(
            content=pdf_bytes,
            media_type='application/pdf',
            headers={'Content-Disposition': 'attachment; filename="livepdf-comments-report.pdf"'}
        )
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.post('/redline/apply')
def apply_redline_changes(body: RedlineApplyRequest):
    try:
        pdf_bytes = apply_redlines(body.s3_key, body.proposals)
        return Response(
            content=pdf_bytes,
            media_type='application/pdf',
            headers={'Content-Disposition': 'attachment; filename="redlined_output.pdf"'}
        )
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == '__main__':
    uvicorn.run('main:app', host='0.0.0.0', port=int(os.getenv('PORT', 8001)), reload=True)

