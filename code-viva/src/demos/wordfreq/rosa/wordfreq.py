import string

STOP_WORDS = frozenset("the a an and of to in".split())


def tokenize(text):
    cleaned = text.lower().translate(str.maketrans("", "", string.punctuation.replace("'", "")))
    return [word for word in cleaned.split() if word not in STOP_WORDS]


def top_words(text, k):
    if k <= 0:
        raise ValueError("k must be positive")
    counts = {}
    for word in tokenize(text):
        counts[word] = counts.get(word, 0) + 1
    return sorted(counts.items(), key=lambda pair: (-pair[1], pair[0]))[:k]


def longest_word(text):
    longest = None
    for word in tokenize(text):
        if longest is None or len(word) > len(longest):
            longest = word
    return longest
