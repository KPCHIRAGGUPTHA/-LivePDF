import re

# Keywords that suggest a HIGH importance change (numbers, dates, money)
HIGH_PATTERNS = [
    r'\d+',                    # any number
    r'\d{1,2}[/-]\d{1,2}[/-]\d{2,4}',   # date format
    r'[₹$€£¥]\s*[\d,]+',      # currency
    r'\d+\.?\d*\s*%',          # percentage
    r'\b(january|february|march|april|may|june|july|august|'
    r'september|october|november|december)\b',
]

# Keywords that suggest a CRITICAL importance change (legal/contract terms)
CRITICAL_KEYWORDS = [
    'termination', 'terminate', 'penalty', 'penalise', 'liable', 'liability',
    'expiry', 'expire', 'expires', 'payment', 'refund', 'warranty', 'warrants',
    'indemnify', 'indemnification', 'breach', 'damages', 'arbitration',
    'jurisdiction', 'governing law', 'confidential', 'non-disclosure',
    'intellectual property', 'force majeure', 'cancellation',
]


def score_change(change: dict) -> str:
    """
    Return 'Low', 'High', or 'Critical' for a change object.
    Checks both old_text and new_text.
    """
    texts = ' '.join(filter(None, [
        change.get('old_text', '') or '',
        change.get('new_text', '') or '',
    ])).lower()

    # Critical check first — highest priority
    for keyword in CRITICAL_KEYWORDS:
        if keyword in texts:
            return 'Critical'

    # High check — contains numbers, dates, or money
    for pattern in HIGH_PATTERNS:
        if re.search(pattern, texts, re.IGNORECASE):
            return 'High'

    # Default — minor wording change
    return 'Low'


def score_all_changes(changes: list[dict]) -> list[dict]:
    """Add an 'importance' field to every change object."""
    for change in changes:
        change['importance'] = score_change(change)
    return changes
