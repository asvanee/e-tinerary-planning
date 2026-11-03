"""
ตรวจ ahp.py กับตัวอย่างที่ตีพิมพ์ใน R.W. Saaty (1987)
รัน: python -m unittest test_ahp.py  (ในโฟลเดอร์ docs/ahp)
"""

import unittest

from ahp import (
    aggregate_priorities,
    analyze,
    build_matrix,
    consistency_ratio,
    pair_keys,
    parse_judgment,
    principal_eigenvector,
)
from convert_form import PLANNED_QUESTION, convert

# ตัวอย่างเลือกมหาวิทยาลัย — เมทริกซ์เกณฑ์ (Saaty 1987 น. 164)
COLLEGE_CRITERIA = [
    [1, 1 / 7, 1 / 5, 1 / 5],
    [7, 1, 2, 3],
    [5, 1 / 2, 1, 1],
    [5, 1 / 3, 1, 1],
]
# น้ำหนักที่ตีพิมพ์ (LOCATION, AMBIENCE, REPUTATION, ACADEMICS) และ inconsistency ratio 0.02 (น. 165)
# ACADEMICS ใช้ 0.218 ตามเวกเตอร์ใน น. 166 — ข้อความ น. 165 พิมพ์ 0.213 แต่ผลรวมจะไม่เท่ากับ 1
COLLEGE_CRITERIA_WEIGHTS = [0.053, 0.491, 0.238, 0.218]

# เมทริกซ์มหาวิทยาลัยเทียบตาม LOCATION (Saaty 1987 น. 165)
COLLEGE_LOCATION = [
    [1, 1 / 4, 1 / 3, 1 / 3, 7],
    [4, 1, 2, 3, 7],
    [3, 1 / 2, 1, 3, 6],
    [3, 1 / 3, 1 / 3, 1, 4],
    [1 / 7, 1 / 7, 1 / 6, 1 / 4, 1],
]
# U. MICH ใช้ 0.284 ตามเวกเตอร์ใน น. 166 (ตาราง น. 165 พิมพ์ 0.283)
COLLEGE_LOCATION_WEIGHTS = [0.115, 0.402, 0.284, 0.163, 0.037]


class SaatyExampleTest(unittest.TestCase):
    def assert_weights(self, actual, expected):
        for a, e in zip(actual, expected):
            # เปเปอร์ปัดทศนิยม 3 ตำแหน่ง
            self.assertAlmostEqual(a, e, delta=0.0005)

    def test_college_criteria(self):
        weights = principal_eigenvector(COLLEGE_CRITERIA)
        self.assert_weights(weights, COLLEGE_CRITERIA_WEIGHTS)
        self.assertAlmostEqual(consistency_ratio(COLLEGE_CRITERIA, weights), 0.02, delta=0.005)

    def test_college_location(self):
        weights = principal_eigenvector(COLLEGE_LOCATION)
        self.assert_weights(weights, COLLEGE_LOCATION_WEIGHTS)
        self.assertAlmostEqual(consistency_ratio(COLLEGE_LOCATION, weights), 0.092, delta=0.005)


class InputTest(unittest.TestCase):
    def test_ten_pairs_for_five_factors(self):
        self.assertEqual(len(pair_keys()), 10)

    def test_parse_judgment(self):
        self.assertEqual(parse_judgment("1"), 1.0)
        self.assertEqual(parse_judgment("5"), 5.0)
        self.assertAlmostEqual(parse_judgment("-5"), 0.2)
        for bad in ("0", "-1", "10", "-10"):
            with self.assertRaises(ValueError):
                parse_judgment(bad)

    def test_matrix_is_reciprocal(self):
        judgments = {key: 3.0 for key in pair_keys()}
        matrix = build_matrix(judgments)
        for i in range(5):
            for j in range(5):
                self.assertAlmostEqual(matrix[i][j] * matrix[j][i], 1.0)


class AggregationTest(unittest.TestCase):
    def test_identical_respondents_give_same_weights(self):
        w = [0.4, 0.3, 0.1, 0.1, 0.1]
        for a, b in zip(aggregate_priorities([w, w, w]), w):
            self.assertAlmostEqual(a, b)

    def test_result_sums_to_one(self):
        result = aggregate_priorities([[0.5, 0.2, 0.1, 0.1, 0.1], [0.1, 0.2, 0.3, 0.2, 0.2]])
        self.assertAlmostEqual(sum(result), 1.0)

    def test_inconsistent_respondent_is_excluded(self):
        equal = {key: "1" for key in pair_keys()}
        # วนกลับ: category > rating > distance แต่ distance > category ระดับ 9 ทุกคู่ → ไม่สอดคล้อง
        cyclic = dict(equal, **{"category-rating": "9", "rating-distance": "9", "category-distance": "-9"})
        results, group = analyze([dict(equal, respondent_id="ok"), dict(cyclic, respondent_id="bad")])
        self.assertTrue(results[0]["passed"])
        self.assertFalse(results[1]["passed"])
        for weight in group:
            self.assertAlmostEqual(weight, 0.2)


class ConvertFormTest(unittest.TestCase):
    """จำลองแถวจากไฟล์ export ของ Google Form ตามชื่อข้อใน create_form.gs"""

    def make_export(self, answers):
        headers = ["Timestamp", PLANNED_QUESTION, "ใน 1 ปีที่ผ่านมา คุณเที่ยวในประเทศไทยประมาณกี่ครั้ง (ตอบเป็นตัวเลข)"]
        row = {headers[0]: "2026/10/27", headers[1]: "เคย", headers[2]: "3"}
        for number, (side, level) in enumerate(answers, start=1):
            q1 = f"{number}.1 เมื่อเลือกสถานที่ท่องเที่ยว ปัจจัยไหนสำคัญกว่า"
            q2 = f"{number}.2 สำคัญกว่ามากแค่ไหน"
            headers += [q1, q2]
            row[q1], row[q2] = side, str(level)
        return headers, [row]

    def test_sign_follows_chosen_factor_and_level_one_is_equal(self):
        answers = [("หมวดหมู่", 5), ("ระยะทาง", 3)] + [("หมวดหมู่", 1)] * 8
        headers, rows = self.make_export(answers)
        result = convert(rows, headers)[0]
        self.assertEqual(result["category-rating"], 5)
        self.assertEqual(result["category-distance"], -3)
        self.assertEqual(result["budget-weather"], 1)
        self.assertEqual(result["planned_trip"], "เคย")
        self.assertEqual(result["trips_last_year"], "3")

    def test_converted_row_feeds_analyze(self):
        headers, rows = self.make_export([("หมวดหมู่", 1)] * 10)
        results, group = analyze(convert(rows, headers))
        self.assertTrue(results[0]["passed"])
        self.assertAlmostEqual(group[0], 0.2)


if __name__ == "__main__":
    unittest.main()
