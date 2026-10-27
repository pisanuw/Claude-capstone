/**
 * Bundled sample assignment. Solutions were written by hand to show each
 * style (the AI baselines are illustrative, not model output); the pass
 * counts come from running each one against the seven pytest tests.
 */
import { type Assignment } from './analyze';

export const SAMPLE: Assignment = {
  "title": "Word frequency (sample)",
  "description": "Implement top_words(text, n) in wordfreq.py. Seven pytest tests; the pass counts below come from running each solution against them.",
  "testsTotal": 7,
  "starter": [
    {
      "path": "wordfreq.py",
      "content": "\"\"\"Word frequency helper for the text-tools module.\"\"\"\n\nimport re\n\nSTOPWORDS = {\"the\", \"a\", \"an\", \"and\", \"of\", \"to\", \"in\"}\n\n\ndef tokenize(text):\n    \"\"\"Split text into lowercase words (letters and apostrophes).\"\"\"\n    return re.findall(r\"[a-z']+\", text.lower())\n\n\ndef top_words(text, n):\n    \"\"\"Return the n most common words as (word, count) pairs.\n\n    Most frequent first; ties are broken alphabetically. Words in STOPWORDS\n    are ignored. Raise ValueError if n is negative.\n    \"\"\"\n    raise NotImplementedError\n"
    },
    {
      "path": "test_wordfreq.py",
      "content": "import pytest\n\nfrom wordfreq import top_words\n\n\ndef test_counts():\n    assert top_words(\"b b x b x c\", 2) == [(\"b\", 3), (\"x\", 2)]\n\n\ndef test_ties_alphabetical():\n    assert top_words(\"pear apple fig apple pear fig\", 3) == [(\"apple\", 2), (\"fig\", 2), (\"pear\", 2)]\n\n\ndef test_stopwords_ignored():\n    assert top_words(\"the cat and the hat of the cat\", 1) == [(\"cat\", 2)]\n\n\ndef test_case_and_apostrophes():\n    assert top_words(\"Don't don't DON'T stop\", 1) == [(\"don't\", 3)]\n\n\ndef test_n_larger_than_vocabulary():\n    assert top_words(\"one two\", 5) == [(\"one\", 1), (\"two\", 1)]\n\n\ndef test_zero():\n    assert top_words(\"x y z\", 0) == []\n\n\ndef test_negative_n():\n    with pytest.raises(ValueError):\n        top_words(\"x\", -1)\n"
    }
  ],
  "solutions": [
    {
      "id": "reference",
      "label": "Instructor reference",
      "author": "reference",
      "note": "Counter plus one sorted() call with a (-count, word) key.",
      "testsPassed": 7,
      "files": [
        {
          "path": "wordfreq.py",
          "content": "\"\"\"Word frequency helper for the text-tools module.\"\"\"\n\nimport re\nfrom collections import Counter\n\nSTOPWORDS = {\"the\", \"a\", \"an\", \"and\", \"of\", \"to\", \"in\"}\n\n\ndef tokenize(text):\n    \"\"\"Split text into lowercase words (letters and apostrophes).\"\"\"\n    return re.findall(r\"[a-z']+\", text.lower())\n\n\ndef top_words(text, n):\n    \"\"\"Return the n most common words as (word, count) pairs.\n\n    Most frequent first; ties are broken alphabetically. Words in STOPWORDS\n    are ignored. Raise ValueError if n is negative.\n    \"\"\"\n    if n < 0:\n        raise ValueError(\"n must be non-negative\")\n    counts = Counter(w for w in tokenize(text) if w not in STOPWORDS)\n    return sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))[:n]\n"
        }
      ]
    },
    {
      "id": "student-a",
      "label": "Student 1",
      "author": "student",
      "note": "Hand-rolled dict and two stable sorts; forgot the ValueError for negative n.",
      "testsPassed": 6,
      "files": [
        {
          "path": "wordfreq.py",
          "content": "\"\"\"Word frequency helper for the text-tools module.\"\"\"\n\nimport re\n\nSTOPWORDS = {\"the\", \"a\", \"an\", \"and\", \"of\", \"to\", \"in\"}\n\n\ndef tokenize(text):\n    \"\"\"Split text into lowercase words (letters and apostrophes).\"\"\"\n    return re.findall(r\"[a-z']+\", text.lower())\n\n\ndef top_words(text, n):\n    \"\"\"Return the n most common words as (word, count) pairs.\n\n    Most frequent first; ties are broken alphabetically. Words in STOPWORDS\n    are ignored. Raise ValueError if n is negative.\n    \"\"\"\n    counts = {}\n    for word in tokenize(text):\n        if word in STOPWORDS:\n            continue\n        if word in counts:\n            counts[word] = counts[word] + 1\n        else:\n            counts[word] = 1\n    pairs = []\n    for word in counts:\n        pairs.append((word, counts[word]))\n    pairs.sort(key=lambda pair: pair[0])\n    pairs.sort(key=lambda pair: pair[1], reverse=True)\n    result = []\n    for i in range(n):\n        if i < len(pairs):\n            result.append(pairs[i])\n    return result\n"
        }
      ]
    },
    {
      "id": "student-b",
      "label": "Student 2",
      "author": "student",
      "note": "Crammed onto four lines; few lines, but the unit count shows it is not small.",
      "testsPassed": 7,
      "files": [
        {
          "path": "wordfreq.py",
          "content": "\"\"\"Word frequency helper for the text-tools module.\"\"\"\n\nimport re\n\nSTOPWORDS = {\"the\", \"a\", \"an\", \"and\", \"of\", \"to\", \"in\"}\n\n\ndef tokenize(text):\n    \"\"\"Split text into lowercase words (letters and apostrophes).\"\"\"\n    return re.findall(r\"[a-z']+\", text.lower())\n\n\ndef top_words(text, n):\n    \"\"\"Return the n most common words as (word, count) pairs.\n\n    Most frequent first; ties are broken alphabetically. Words in STOPWORDS\n    are ignored. Raise ValueError if n is negative.\n    \"\"\"\n    if n < 0: raise ValueError(\"n must be non-negative\")\n    c = {}\n    for w in tokenize(text): c[w] = c.get(w, 0) + 1 if w not in STOPWORDS else c.get(w, 0)\n    return sorted([(w, k) for w, k in c.items() if k], key=lambda p: (-p[1], p[0]))[:n]\n"
        }
      ]
    },
    {
      "id": "student-c",
      "label": "Student 3",
      "author": "student",
      "note": "Two copies of a bubble sort, one per sort key; correct but heavily duplicated.",
      "testsPassed": 7,
      "files": [
        {
          "path": "wordfreq.py",
          "content": "\"\"\"Word frequency helper for the text-tools module.\"\"\"\n\nimport re\n\nSTOPWORDS = {\"the\", \"a\", \"an\", \"and\", \"of\", \"to\", \"in\"}\n\n\ndef tokenize(text):\n    \"\"\"Split text into lowercase words (letters and apostrophes).\"\"\"\n    return re.findall(r\"[a-z']+\", text.lower())\n\n\ndef top_words(text, n):\n    \"\"\"Return the n most common words as (word, count) pairs.\n\n    Most frequent first; ties are broken alphabetically. Words in STOPWORDS\n    are ignored. Raise ValueError if n is negative.\n    \"\"\"\n    if n < 0:\n        raise ValueError(\"n must be non-negative\")\n    words = []\n    for word in tokenize(text):\n        if word not in STOPWORDS:\n            words.append(word)\n    counts = {}\n    for word in words:\n        if word in counts:\n            counts[word] = counts[word] + 1\n        else:\n            counts[word] = 1\n    pairs = list(counts.items())\n    for i in range(len(pairs)):\n        for j in range(len(pairs) - 1 - i):\n            if pairs[j][1] < pairs[j + 1][1]:\n                pairs[j], pairs[j + 1] = pairs[j + 1], pairs[j]\n    for i in range(len(pairs)):\n        for j in range(len(pairs) - 1 - i):\n            if pairs[j][1] == pairs[j + 1][1] and pairs[j][0] > pairs[j + 1][0]:\n                pairs[j], pairs[j + 1] = pairs[j + 1], pairs[j]\n    return pairs[:n]\n"
        }
      ]
    },
    {
      "id": "ai-terse",
      "label": "AI baseline: terse",
      "author": "ai",
      "note": "Illustrative terse style (hand-written for the sample): most_common() breaks ties by first appearance, not alphabetically.",
      "testsPassed": 6,
      "files": [
        {
          "path": "wordfreq.py",
          "content": "\"\"\"Word frequency helper for the text-tools module.\"\"\"\n\nimport re\nfrom collections import Counter\n\nSTOPWORDS = {\"the\", \"a\", \"an\", \"and\", \"of\", \"to\", \"in\"}\n\n\ndef tokenize(text):\n    \"\"\"Split text into lowercase words (letters and apostrophes).\"\"\"\n    return re.findall(r\"[a-z']+\", text.lower())\n\n\ndef top_words(text, n):\n    \"\"\"Return the n most common words as (word, count) pairs.\n\n    Most frequent first; ties are broken alphabetically. Words in STOPWORDS\n    are ignored. Raise ValueError if n is negative.\n    \"\"\"\n    if n < 0:\n        raise ValueError(\"n must be non-negative\")\n    return Counter(w for w in tokenize(text) if w not in STOPWORDS).most_common(n)\n"
        }
      ]
    },
    {
      "id": "ai-balanced",
      "label": "AI baseline: balanced",
      "author": "ai",
      "note": "Illustrative balanced style (hand-written for the sample): the reference plus comments and a clearer error message.",
      "testsPassed": 7,
      "files": [
        {
          "path": "wordfreq.py",
          "content": "\"\"\"Word frequency helper for the text-tools module.\"\"\"\n\nimport re\nfrom collections import Counter\n\nSTOPWORDS = {\"the\", \"a\", \"an\", \"and\", \"of\", \"to\", \"in\"}\n\n\ndef tokenize(text):\n    \"\"\"Split text into lowercase words (letters and apostrophes).\"\"\"\n    return re.findall(r\"[a-z']+\", text.lower())\n\n\ndef top_words(text, n):\n    \"\"\"Return the n most common words as (word, count) pairs.\n\n    Most frequent first; ties are broken alphabetically. Words in STOPWORDS\n    are ignored. Raise ValueError if n is negative.\n    \"\"\"\n    if n < 0:\n        raise ValueError(f\"n must be non-negative, got {n}\")\n\n    # Count every word that is not a stopword.\n    counts = Counter(word for word in tokenize(text) if word not in STOPWORDS)\n\n    # Sort by descending count, then alphabetically to break ties.\n    ranked = sorted(counts.items(), key=lambda item: (-item[1], item[0]))\n    return ranked[:n]\n"
        }
      ]
    },
    {
      "id": "ai-defensive",
      "label": "AI baseline: defensive",
      "author": "ai",
      "note": "Illustrative defensive style (hand-written for the sample): type checks, logging and early returns the tests never exercise.",
      "testsPassed": 7,
      "files": [
        {
          "path": "wordfreq.py",
          "content": "\"\"\"Word frequency helper for the text-tools module.\"\"\"\n\nimport logging\nimport re\nfrom collections import Counter\n\nlogger = logging.getLogger(__name__)\n\nSTOPWORDS = {\"the\", \"a\", \"an\", \"and\", \"of\", \"to\", \"in\"}\n\n\ndef tokenize(text):\n    \"\"\"Split text into lowercase words (letters and apostrophes).\"\"\"\n    return re.findall(r\"[a-z']+\", text.lower())\n\n\ndef _validate_inputs(text, n):\n    \"\"\"Check argument types and ranges before doing any work.\"\"\"\n    if text is None:\n        raise TypeError(\"text must be a string, not None\")\n    if not isinstance(text, str):\n        raise TypeError(f\"text must be a string, got {type(text).__name__}\")\n    if isinstance(n, bool) or not isinstance(n, int):\n        raise TypeError(f\"n must be an integer, got {type(n).__name__}\")\n    if n < 0:\n        raise ValueError(f\"n must be non-negative, got {n}\")\n\ndef top_words(text, n):\n    \"\"\"Return the n most common words as (word, count) pairs.\n\n    Most frequent first; ties are broken alphabetically. Words in STOPWORDS\n    are ignored. Raise ValueError if n is negative.\n    \"\"\"\n    _validate_inputs(text, n)\n    if n == 0 or not text.strip():\n        return []\n\n    words = tokenize(text)\n    if not words:\n        logger.debug(\"No words found in input of length %d\", len(text))\n        return []\n\n    counts = Counter()\n    for word in words:\n        if not isinstance(word, str) or not word:\n            continue\n        if word in STOPWORDS:\n            continue\n        counts[word] += 1\n\n    if not counts:\n        logger.debug(\"All %d words were stopwords\", len(words))\n        return []\n\n    try:\n        ranked = sorted(counts.items(), key=lambda item: (-item[1], item[0]))\n    except TypeError as exc:\n        logger.error(\"Could not sort word counts: %s\", exc)\n        raise\n\n    limit = min(n, len(ranked))\n    result = []\n    for index in range(limit):\n        word, count = ranked[index]\n        result.append((word, int(count)))\n    return result\n"
        }
      ]
    }
  ]
};
