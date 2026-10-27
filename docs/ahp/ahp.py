"""
คำนวณน้ำหนัก POI Score ด้วย AHP (D-56)

ทุกขั้นตอนอ้างอิงจาก:
- R.W. Saaty (1987) The analytic hierarchy process—what it is and how it is used.
  Mathematical Modelling 9(3–5), 161–176.
- E. Forman & K. Peniwati (1998) Aggregating individual judgments and priorities
  with the Analytic Hierarchy Process. European Journal of Operational Research 108, 165–169.

ใช้ Python มาตรฐานอย่างเดียว (ไม่มี dependency)

วิธีใช้:  python ahp.py responses.csv
รูปแบบ CSV ดู README.md
"""

import csv
import math
import sys
from itertools import combinations

# ลำดับปัจจัยตรงกับ WEIGHTS ใน backend/src/features/poi/poiScoreCalculator.ts
FACTORS = ["category", "rating", "distance", "budget", "weather"]

# Random consistency index (R.I.) — Saaty 1987 น. 171
RANDOM_INDEX = {1: 0, 2: 0, 3: 0.58, 4: 0.90, 5: 1.12, 6: 1.24, 7: 1.32, 8: 1.41, 9: 1.45, 10: 1.49}

# ยอมรับเมื่อ C.R. น้อยกว่า 0.10 — Saaty 1987 น. 171
CR_THRESHOLD = 0.10

# สเกล 1–9 และค่ากลาง — Saaty 1987 Table 1 น. 163
VALID_JUDGMENTS = set(range(1, 10))


def pair_keys(factors=FACTORS):
    """คู่ที่ต้องถาม n(n−1)/2 คู่ — Saaty 1987 น. 163"""
    return [f"{a}-{b}" for a, b in combinations(factors, 2)]


def parse_judgment(raw):
    """
    ค่าในแต่ละคู่ "a-b": จำนวนเต็ม
      +k (k = 2..9) = a สำคัญกว่า b ระดับ k
      -k (k = 2..9) = b สำคัญกว่า a ระดับ k
       1            = สำคัญเท่ากัน
    คืนค่า a_ab (ความสำคัญของ a เทียบ b)
    """
    value = int(str(raw).strip())
    if value == 1:
        return 1.0
    if abs(value) not in VALID_JUDGMENTS or abs(value) == 1:
        raise ValueError(f"ค่าไม่อยู่ในสเกล 1–9: {raw}")
    return float(value) if value > 0 else 1.0 / -value


def build_matrix(judgments, factors=FACTORS):
    """เมทริกซ์ส่วนกลับ a_ji = 1/a_ij (Axiom 1) — Saaty 1987 น. 167"""
    n = len(factors)
    index = {f: i for i, f in enumerate(factors)}
    matrix = [[1.0] * n for _ in range(n)]
    for key in pair_keys(factors):
        a, b = key.split("-")
        i, j = index[a], index[b]
        matrix[i][j] = judgments[key]
        matrix[j][i] = 1.0 / judgments[key]
    return matrix


def principal_eigenvector(matrix, tolerance=1e-12, max_iterations=10_000):
    """
    ยกกำลังเมทริกซ์ซ้ำแล้ว normalize จนเวกเตอร์แทบไม่เปลี่ยน — Saaty 1987 น. 170–171
    (lim A^k x / λmax^k = c·w) ไม่ใช้วิธีประมาณเพราะทำให้ลำดับสลับได้ (น. 170)
    """
    n = len(matrix)
    weights = [1.0 / n] * n
    for _ in range(max_iterations):
        product = [sum(matrix[i][j] * weights[j] for j in range(n)) for i in range(n)]
        total = sum(product)
        updated = [v / total for v in product]
        if max(abs(u - w) for u, w in zip(updated, weights)) < tolerance:
            return updated
        weights = updated
    raise RuntimeError("eigenvector ไม่ลู่เข้า")


def lambda_max(matrix, weights):
    """ผลรวมแต่ละคอลัมน์ของ A คูณ w — Saaty 1987 น. 171"""
    n = len(matrix)
    return sum(sum(matrix[i][j] for i in range(n)) * weights[j] for j in range(n))


def consistency_ratio(matrix, weights):
    """C.I. = (λmax − n)/(n − 1) · C.R. = C.I./R.I. — Saaty 1987 น. 171"""
    n = len(matrix)
    if RANDOM_INDEX[n] == 0:
        return 0.0
    ci = (lambda_max(matrix, weights) - n) / (n - 1)
    return ci / RANDOM_INDEX[n]


def aggregate_priorities(priority_sets):
    """
    AIP: ค่าเฉลี่ยเรขาคณิตของน้ำหนักแต่ละคน (ผู้ตอบมีน้ำหนักเท่ากัน)
    แล้ว normalize ให้ผลรวม = 1 — Forman & Peniwati 1998 น. 167–168
    """
    count = len(priority_sets)
    n = len(priority_sets[0])
    means = [math.prod(p[i] for p in priority_sets) ** (1.0 / count) for i in range(n)]
    total = sum(means)
    return [m / total for m in means]


def analyze(rows, factors=FACTORS):
    """
    rows = list ของ dict (respondent_id + คอลัมน์คู่)
    คืน (ผลรายคน, น้ำหนักรวมจากคนที่ CR ผ่าน)
    """
    results = []
    for row in rows:
        judgments = {key: parse_judgment(row[key]) for key in pair_keys(factors)}
        matrix = build_matrix(judgments, factors)
        weights = principal_eigenvector(matrix)
        cr = consistency_ratio(matrix, weights)
        results.append({
            "respondent_id": row.get("respondent_id", ""),
            "weights": weights,
            "cr": cr,
            "passed": cr < CR_THRESHOLD,
        })
    passed = [r["weights"] for r in results if r["passed"]]
    group = aggregate_priorities(passed) if passed else None
    return results, group


def main(path):
    # console ของ Windows อาจไม่ใช่ UTF-8 — บังคับให้พิมพ์ภาษาไทยได้
    sys.stdout.reconfigure(encoding="utf-8")
    with open(path, newline="", encoding="utf-8-sig") as f:
        rows = list(csv.DictReader(f))
    results, group = analyze(rows)

    header = "respondent_id".ljust(16) + "".join(f.rjust(10) for f in FACTORS) + "        CR  ผล"
    print(header)
    for r in results:
        line = str(r["respondent_id"]).ljust(16)
        line += "".join(f"{w:10.3f}" for w in r["weights"])
        line += f"{r['cr']:10.3f}  {'ผ่าน' if r['passed'] else 'ไม่ผ่าน'}"
        print(line)

    passed_count = sum(r["passed"] for r in results)
    print(f"\nผ่านเกณฑ์ CR < {CR_THRESHOLD}: {passed_count} จาก {len(results)} คน")
    if group is None:
        print("ไม่มีแบบที่ผ่านเกณฑ์ — คำนวณน้ำหนักรวมไม่ได้")
        return
    print("น้ำหนักรวม (AIP, ค่าเฉลี่ยเรขาคณิต):")
    for factor, weight in zip(FACTORS, group):
        print(f"  {factor:<10}{weight:.3f}")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("วิธีใช้: python ahp.py responses.csv")
        sys.exit(1)
    main(sys.argv[1])
