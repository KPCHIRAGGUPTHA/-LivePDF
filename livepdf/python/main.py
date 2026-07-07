from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from comparator import compute_diff
from scorer import score_all_changes
import uvicorn
import os
# pyrefly: ignore [missing-import]
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title='LivePDF Diff Engine', version='1.0.0')


class DiffRequest(BaseModel):
    old_s3_key: str
    new_s3_key: str


class DiffResponse(BaseModel):
    changes: list[dict]
    total_changes: int
    added_count: int
    removed_count: int
    modified_count: int


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
            added_count=sum(1 for c in changes if c['type'] == 'ADDED'),
            removed_count=sum(1 for c in changes if c['type'] == 'REMOVED'),
            modified_count=sum(1 for c in changes if c['type'] == 'MODIFIED'),
        )
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == '__main__':
    uvicorn.run('main:app', host='0.0.0.0', port=int(os.getenv('PORT', 8001)), reload=True)
