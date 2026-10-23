/** Bundled sample assignments: one CS1 programming task with pytest tests, one writing task. */
import type { Assignment } from './types.js';

const RLE_TESTS = `import pytest
from rle import encode, decode


def test_basic_encode():
    assert encode("aaabcc") == "3a1b2c"


def test_basic_decode():
    assert decode("3a1b2c") == "aaabcc"


def test_round_trip():
    for s in ["abc", "zzzzzzzzzzzz", "aabbaa", "xyzzy"]:
        assert decode(encode(s)) == s


def test_multi_digit_counts():
    assert encode("q" * 12) == "12q"
    assert decode("12q3r") == "q" * 12 + "rrr"


def test_case_is_kept():
    assert encode("aAaa") == "1a1A2a"


def test_empty_encode():
    assert encode("") == ""


def test_empty_decode():
    assert decode("") == ""


def test_single_char():
    assert encode("x") == "1x"


def test_digits_rejected():
    with pytest.raises(ValueError):
        encode("ab3c")


def test_digits_decode_malformed():
    with pytest.raises(ValueError):
        decode("3")
`;

export const SAMPLES: { id: string; name: string; assignment: Assignment }[] = [
  {
    id: 'rle',
    name: 'CS1: run-length encoding (Python + pytest)',
    assignment: {
      title: 'Lab 4: Run-length encoding',
      course: 'CSS 142',
      prompt: `Lab 4: Run-length encoding

Write a module rle.py with two functions.

encode(s) takes a string of letters and returns its run-length encoding: each run of
the same character becomes the run length followed by the character. Case matters, so
"aAaa" has three runs. encode("aaabcc") returns "3a1b2c". encode("") returns "".
If s contains a digit, raise ValueError, because the encoding could not be decoded.

decode(s) reverses encode. Counts can have more than one digit: decode("12q") is twelve
q's. If s is malformed (for example it ends in a number with no character after it),
raise ValueError.

Do not use itertools.groupby or regular expressions: we have not covered them yet.

Submit rle.py, plus a testing log with at least three cases you tried by hand
(input, expected output, actual output) and a reflection of about 150 words on one
bug you hit while writing this lab and how you found it.`,
      rubricText: `Correctness (40) {tests}
  Passes the instructor's test suite
Edge cases (15) {tests: test_empty*, test_single*, test_digits*}
  Empty strings, single characters and bad input
Code quality (15)
  Clear names, a docstring on each function, no groupby or regular expressions
Testing log (15)
  At least three hand-tried cases with input, expected and actual output
Reflection (15)
  About 150 words on one bug the student hit and how they found it`,
      code: {
        solutionFile: 'rle.py',
        starter: [],
        tests: [{ name: 'test_rle.py', content: RLE_TESTS }],
      },
    },
  },
  {
    id: 'memo',
    name: 'Computing and society: policy memo (writing)',
    assignment: {
      title: 'Memo 2: Facial recognition on campus',
      course: 'CSS 301',
      prompt: `Memo 2: Facial recognition on campus

Write a memo of about 600 words to the university IT committee recommending whether
the campus should replace ID-card building access with facial recognition.

Your memo must:
- make a clear recommendation in the first paragraph;
- draw on at least two course readings by name, including Buolamwini and Gebru's
  "Gender Shades" (Week 3);
- respond to one specific argument a classmate made during our in-class debate on
  October 14, naming the classmate and quoting or closely paraphrasing them;
- answer the strongest counterargument to your recommendation.`,
      rubricText: `Recommendation and argument (25)
  Clear recommendation up front, supported by reasons that follow from the evidence
Use of course readings (20)
  At least two readings by name, used accurately, including Gender Shades
Connection to the October 14 debate (20)
  Names a classmate and engages a specific argument they made in class
Counterargument (15)
  States the strongest opposing view fairly and answers it
Writing (20)
  Memo format, about 600 words, clear and concise prose`,
      code: null,
    },
  },
];

export function sample(id: string): Assignment {
  const s = SAMPLES.find((x) => x.id === id);
  if (!s) throw new Error(`No sample ${id}`);
  return structuredClone(s.assignment);
}
