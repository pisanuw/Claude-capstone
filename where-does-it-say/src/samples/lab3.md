# Lab 3: Word Frequencies

Due Thursday, October 15, at 11:59 pm. Check off in your lab section that week.

## Goal

Read a text file, count how often each word appears, and print the ten most common words with their counts. This lab practises dictionaries, loops over files, and sorting with a key function.

## What to submit

Submit a single file named `wordfreq.py` on the course site. Do not submit the input text files. Your file must run with `python3 wordfreq.py input.txt` and print exactly ten lines.

## Requirements

1. Words are compared in lower case, so "The" and "the" are the same word.
2. Strip punctuation from the start and end of each word, but keep apostrophes inside words (don't stays don't).
3. Ignore empty strings after stripping.
4. Break ties in count alphabetically.
5. Each output line has the word, a single space, and the count.

You may not import the `collections` module for this lab; we want you to build the dictionary yourself. Any other standard library module is fine.

## Testing

Three sample inputs and their expected output are posted with the lab. The autograder runs five more hidden inputs, including an empty file. Your program should print nothing, not crash, when the input file is empty.

## Partners

Lab 3 may be done with one partner from your lab section. Both partners submit the same file, and both names must appear in a comment at the top of it.

## Grading

The lab is worth 10 points: 6 for the autograder tests, 2 for the in-person check-off, and 2 for readable code (clear names and a comment for each function).
