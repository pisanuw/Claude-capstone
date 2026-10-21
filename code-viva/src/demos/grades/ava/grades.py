def load_scores(path):
    f = open(path)
    lines = f.read().split("\n")
    hdr = lines[0].split(",")
    data = []
    for l in lines[1:]:
        if l:
            data.append(dict(zip(hdr, l.split(","))))
    return data


def summarize(rows):
    res = {}
    for k in rows[0]:
        if k == "student":
            continue
        v2 = [float(r[k]) for r in rows if r[k] != ""]
        v2.sort()
        m = sum(v2) / len(v2)
        if len(v2) % 2:
            md = v2[len(v2) // 2]
        else:
            md = (v2[len(v2) // 2] + v2[len(v2) // 2 - 1]) / 2
        sd = (sum([(x - m) ** 2 for x in v2]) / len(v2)) ** 0.5
        res[k] = {"mean": m, "median": md, "stdev": sd}
    return res


def letter_grade(p):
    if p >= 90:
        return "A"
    elif p >= 80:
        return "B"
    elif p >= 70:
        return "C"
    elif p >= 60:
        return "D"
    return "F"
