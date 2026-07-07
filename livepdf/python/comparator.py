from difflib import SequenceMatcher
from extractor import extract_blocks, merge_adjacent_blocks


def compute_diff(old_s3_key: str, new_s3_key: str) -> list[dict]:
    """
    Compare two PDFs and return a list of change objects.

    Each change object:
    {
        type: 'ADDED' | 'REMOVED' | 'MODIFIED',
        page: int,
        x0, y0, x1, y1: float,       # coordinates (use new version for ADDED/MODIFIED,
                                       #              old version for REMOVED)
        old_text: str | None,
        new_text: str | None,
        page_height: float,           # needed by frontend for coordinate conversion
        page_width: float,
    }
    """
    # Extract and merge blocks from both versions
    old_blocks = merge_adjacent_blocks(extract_blocks(old_s3_key))
    new_blocks = merge_adjacent_blocks(extract_blocks(new_s3_key))

    old_texts = [b['text'] for b in old_blocks]
    new_texts = [b['text'] for b in new_blocks]

    # Run sequence matcher on text content
    matcher = SequenceMatcher(
        isjunk=None,
        a=old_texts,
        b=new_texts,
        autojunk=False,   # disable auto-junk heuristic for accuracy
    )

    changes = []

    for tag, i1, i2, j1, j2 in matcher.get_opcodes():
        if tag == 'equal':
            continue   # no change — skip

        elif tag == 'delete':
            # Blocks exist in old version but not new — REMOVED
            for idx in range(i1, i2):
                block = old_blocks[idx]
                changes.append({
                    'type': 'REMOVED',
                    'page': block['page'],
                    'x0': block['x0'],
                    'y0': block['y0'],
                    'x1': block['x1'],
                    'y1': block['y1'],
                    'old_text': block['text'],
                    'new_text': None,
                    'page_height': block['page_height'],
                    'page_width': block['page_width'],
                })

        elif tag == 'insert':
            # Blocks exist in new version but not old — ADDED
            for idx in range(j1, j2):
                block = new_blocks[idx]
                changes.append({
                    'type': 'ADDED',
                    'page': block['page'],
                    'x0': block['x0'],
                    'y0': block['y0'],
                    'x1': block['x1'],
                    'y1': block['y1'],
                    'old_text': None,
                    'new_text': block['text'],
                    'page_height': block['page_height'],
                    'page_width': block['page_width'],
                })

        elif tag == 'replace':
            # Blocks differ between versions — MODIFIED
            # Pair old and new blocks as best we can
            old_range = old_blocks[i1:i2]
            new_range = new_blocks[j1:j2]
            pairs = zip(old_range, new_range)

            for old_block, new_block in pairs:
                changes.append({
                    'type': 'MODIFIED',
                    'page': new_block['page'],
                    'x0': new_block['x0'],
                    'y0': new_block['y0'],
                    'x1': new_block['x1'],
                    'y1': new_block['y1'],
                    'old_text': old_block['text'],
                    'new_text': new_block['text'],
                    'page_height': new_block['page_height'],
                    'page_width': new_block['page_width'],
                })

            # Handle unequal range sizes — remaining unpaired blocks
            if len(old_range) > len(new_range):
                for block in old_range[len(new_range):]:
                    changes.append({
                        'type': 'REMOVED',
                        'page': block['page'],
                        'x0': block['x0'], 'y0': block['y0'],
                        'x1': block['x1'], 'y1': block['y1'],
                        'old_text': block['text'], 'new_text': None,
                        'page_height': block['page_height'],
                        'page_width': block['page_width'],
                    })
            elif len(new_range) > len(old_range):
                for block in new_range[len(old_range):]:
                    changes.append({
                        'type': 'ADDED',
                        'page': block['page'],
                        'x0': block['x0'], 'y0': block['y0'],
                        'x1': block['x1'], 'y1': block['y1'],
                        'old_text': None, 'new_text': block['text'],
                        'page_height': block['page_height'],
                        'page_width': block['page_width'],
                    })

    # Sort by page then vertical position for consistent ordering
    changes.sort(key=lambda c: (c['page'], c['y0']))
    return changes
