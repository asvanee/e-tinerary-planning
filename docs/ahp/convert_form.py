"""
แปลงไฟล์คำตอบที่ดาวน์โหลดจาก Google Form (create_form.gs) → CSV ที่ ahp.py อ่าน

วิธีใช้:  python convert_form.py google_export.csv responses.csv

ในฟอร์ม 1 คู่ = 2 ข้อ: "k.1 ... ปัจจัยไหนสำคัญกว่า" (ชื่อปัจจัย) + "k.2 สำคัญกว่ามากแค่ไหน" (1–9)
→ ค่า = +ระดับ ถ้าเลือกปัจจัยแรกของคู่ · −ระดับ ถ้าเลือกปัจจัยที่สอง · 1 ถ้าระดับ = 1 (เท่ากัน)
"""

import csv
import re
import sys

from ahp import FACTORS, pair_keys

# ชื่อปัจจัยในฟอร์ม — ต้องตรงกับ FACTORS ใน create_form.gs
FACTOR_NAMES = {
    "category": "หมวดหมู่",
    "rating": "คะแนนรีวิว",
    "distance": "ระยะทาง",
    "budget": "ราคาเทียบงบ",
    "weather": "สภาพอากาศ",
}
PLANNED_QUESTION = "คุณเคยวางแผนเที่ยวในประเทศไทยด้วยตัวเองหรือไม่"
TRIPS_QUESTION_PREFIX = "ใน 1 ปีที่ผ่านมา"
QUESTION_PATTERN = re.compile(r"^(\d+)\.([12])\s")


def find_columns(headers):
    """คืน {(เลขคู่, 1|2): ชื่อคอลัมน์}"""
    columns = {}
    for header in headers:
        match = QUESTION_PATTERN.match(header.strip())
        if match:
            columns[(int(match.group(1)), int(match.group(2)))] = header
    expected = {(k, part) for k in range(1, len(pair_keys()) + 1) for part in (1, 2)}
    missing = expected - columns.keys()
    if missing:
        raise ValueError(f"ไม่พบคอลัมน์ของข้อ: {sorted(missing)}")
    return columns


def convert_row(row, columns):
    converted = {}
    for number, key in enumerate(pair_keys(), start=1):
        left, right = key.split("-")
        side = row[columns[(number, 1)]].strip()
        level = int(row[columns[(number, 2)]].strip())
        if level == 1:
            converted[key] = 1
        elif side == FACTOR_NAMES[left]:
            converted[key] = level
        elif side == FACTOR_NAMES[right]:
            converted[key] = -level
        else:
            raise ValueError(f"คู่ {number}: ไม่รู้จักคำตอบ '{side}'")
    return converted


def find_header(headers, predicate):
    return next((h for h in headers if predicate(h.strip())), None)


def convert(rows, headers):
    columns = find_columns(headers)
    planned_column = find_header(headers, lambda h: h == PLANNED_QUESTION)
    trips_column = find_header(headers, lambda h: h.startswith(TRIPS_QUESTION_PREFIX))
    output = []
    for index, row in enumerate(rows, start=1):
        converted = {"respondent_id": f"R{index:03d}"}
        converted.update(convert_row(row, columns))
        converted["planned_trip"] = row[planned_column].strip() if planned_column else ""
        converted["trips_last_year"] = row[trips_column].strip() if trips_column else ""
        output.append(converted)
    return output


def main(source, target):
    with open(source, newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        rows = list(reader)
        headers = reader.fieldnames or []
    output = convert(rows, headers)
    fieldnames = ["respondent_id", *pair_keys(), "planned_trip", "trips_last_year"]
    with open(target, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(output)
    sys.stdout.reconfigure(encoding="utf-8")
    print(f"แปลง {len(output)} คำตอบ → {target}")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("วิธีใช้: python convert_form.py google_export.csv responses.csv")
        sys.exit(1)
    main(sys.argv[1], sys.argv[2])
