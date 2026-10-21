def tokenize(text):
    w = []
    cur = ""
    for ch in text.lower():
        if ch.isalpha() or ch == "'":
            cur += ch
        else:
            if cur:
                w.append(cur)
            cur = ""
    if cur:
        w.append(cur)
    return [x for x in w if x not in ["the", "a", "an", "and", "of", "to", "in"]]


def top_words(text, k):
    d = {}
    for x in tokenize(text):
        if x in d:
            d[x] += 1
        else:
            d[x] = 1
    items = list(d.items())
    for i in range(len(items)):
        for j in range(len(items) - 1 - i):
            a, b = items[j], items[j + 1]
            if a[1] < b[1] or (a[1] == b[1] and a[0] > b[0]):
                items[j], items[j + 1] = b, a
    return items[:k]


def longest_word(text):
    ws = tokenize(text)
    if len(ws) == 0:
        return None
    return max(ws, key=len)
