import fitz   # PyMuPDF
import boto3
import os
from dotenv import load_dotenv

load_dotenv()

s3 = boto3.client(
    's3',
    region_name=os.getenv('AWS_REGION'),
    aws_access_key_id=os.getenv('AWS_ACCESS_KEY_ID'),
    aws_secret_access_key=os.getenv('AWS_SECRET_ACCESS_KEY'),
)

def download_pdf_from_s3(s3_key: str) -> bytes:
    """Download a PDF from S3 (or local directory in Mock S3 Mode) and return raw bytes."""
    is_mock = (
        not os.getenv('AWS_ACCESS_KEY_ID') or 
        os.getenv('AWS_ACCESS_KEY_ID').startswith('dummy') or 
        os.getenv('AWS_ACCESS_KEY_ID').startswith('your_') or 
        os.getenv('AWS_ACCESS_KEY_ID') == ''
    )
    
    if is_mock:
        # Resolve path relative to python folder to server/uploads
        # python/ is at the same level as server/
        local_path = os.path.abspath(os.path.join(os.path.dirname(__file__), '../server/uploads', s3_key))
        if os.path.exists(local_path):
            with open(local_path, 'rb') as f:
                return f.read()
        else:
            raise FileNotFoundError(f"Local mock S3 file not found at: {local_path}")

    response = s3.get_object(
        Bucket=os.getenv('S3_BUCKET_NAME'),
        Key=s3_key,
    )
    return response['Body'].read()


def extract_blocks(s3_key: str) -> list[dict]:
    """
    Download a PDF from S3 and extract all text blocks.

    Returns a list of dicts:
    {
        page: int,          # 0-indexed page number
        x0: float,          # left edge in points
        y0: float,          # top edge in points (PDF coordinates — origin bottom-left)
        x1: float,          # right edge
        y1: float,          # bottom edge
        text: str,          # block text content, normalized
        page_height: float, # total page height in points (for coordinate conversion)
        page_width: float,  # total page width in points
    }
    """
    pdf_bytes = download_pdf_from_s3(s3_key)
    doc = fitz.open(stream=pdf_bytes, filetype='pdf')
    blocks = []

    for page_index in range(len(doc)):
        page = doc[page_index]
        page_rect = page.rect
        raw_blocks = page.get_text('blocks')  # returns list of tuples

        for block in raw_blocks:
            x0, y0, x1, y1, text, block_no, block_type = block

            # Skip image blocks (type 1) and empty text blocks
            if block_type != 0:
                continue
            text = text.strip()
            if not text:
                continue

            blocks.append({
                'page': page_index,
                'x0': round(x0, 2),
                'y0': round(y0, 2),
                'x1': round(x1, 2),
                'y1': round(y1, 2),
                'text': text,
                'page_height': round(page_rect.height, 2),
                'page_width': round(page_rect.width, 2),
            })

    doc.close()
    return blocks


def merge_adjacent_blocks(blocks: list[dict], threshold: float = 5.0) -> list[dict]:
    """
    Merge text blocks that are on the same page and vertically adjacent
    within `threshold` points. This handles paragraphs split across
    multiple raw blocks due to font changes or layout differences.
    """
    if not blocks:
        return blocks

    merged = []
    current = blocks[0].copy()

    for block in blocks[1:]:
        same_page = block['page'] == current['page']
        vertically_close = abs(block['y0'] - current['y1']) <= threshold
        same_column = abs(block['x0'] - current['x0']) <= 20.0

        if same_page and vertically_close and same_column:
            # Merge into current
            current['text'] += ' ' + block['text']
            current['y1'] = block['y1']
            current['x0'] = min(current['x0'], block['x0'])
            current['x1'] = max(current['x1'], block['x1'])
        else:
            merged.append(current)
            current = block.copy()

    merged.append(current)
    return merged
