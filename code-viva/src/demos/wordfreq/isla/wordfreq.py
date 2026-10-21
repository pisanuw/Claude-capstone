import re
from collections import Counter

STOP_WORDS = {"the", "a", "an", "and", "of", "to", "in"}


def tokenize(text):
    return [word for word in re.findall(r"[a-z']+", text.lower()) if word not in STOP_WORDS]


def top_words(text, k):
    if k <= 0:
        raise ValueError("k must be positive")
    counts = Counter(tokenize(text))
    ranked = sorted(counts.items(), key=lambda pair: (-pair[1], pair[0]))
    return ranked[:k]


def longest_word(text):
    words = tokenize(text)
    if not words:
        return None
    best = words[0]
    for word in words[1:]:
        if len(word) > len(best):
            best = word
    return best
