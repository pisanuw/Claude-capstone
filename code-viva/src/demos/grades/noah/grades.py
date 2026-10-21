import csv
import math


def load_scores(path):
    with open(path, newline="") as handle:
        reader = csv.DictReader(handle)
        return [row for row in reader]


def column_values(rows, column):
    values = []
    for row in rows:
        cell = row.get(column, "").strip()
        if cell:
            values.append(float(cell))
    return values


def median(values):
    ordered = sorted(values)
    middle = len(ordered) // 2
    if len(ordered) % 2 == 1:
        return ordered[middle]
    return (ordered[middle - 1] + ordered[middle]) / 2


def summarize(rows):
    columns = [name for name in rows[0] if name != "student"] if rows else []
    summary = {}
    for column in columns:
        values = column_values(rows, column)
        if not values:
            continue
        mean = sum(values) / len(values)
        spread = math.sqrt(sum((v - mean) ** 2 for v in values) / len(values))
        summary[column] = {"mean": mean, "median": median(values), "stdev": spread}
    return summary


def letter_grade(percent):
    for cutoff, letter in [(90, "A"), (80, "B"), (70, "C"), (60, "D")]:
        if percent >= cutoff:
            return letter
    return "F"
