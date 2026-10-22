import { makeRow } from "../__testutils__/makeRow";
import { runDedupe } from "../dedupe/runDedupe";
import { DedupeRules } from "../dedupe/dedupeTypes";
import {
  isJunkName,
  namesStrictlyMatch,
  normalizePhone,
  normalizeWebsite,
  parseCoords,
} from "../dedupe/normalize";

const NO_RULES: DedupeRules = {
  locationOverrides: {},
  excludeIds: [],
  blockedPairs: [],
  forceMergeGroups: [],
};

const row = makeRow;

// 2 จุดห่างกันราว 110 m และ ~5.5 km
const NEAR_A = "18.7900, 98.9800";
const NEAR_B = "18.7910, 98.9800";
const FAR = "18.8400, 98.9800";

describe("normalize", () => {
  test("normalizePhone เก็บแค่ตัวเลข และต้องยาว ≥ 9 หลัก", () => {
    expect(normalizePhone("053-123-456")).toBe("053123456");
    expect(normalizePhone("1234")).toBeNull();
    expect(normalizePhone("")).toBeNull();
  });

  test("normalizeWebsite เหลือ hostname ไม่มี www.", () => {
    expect(normalizeWebsite("https://www.Example.com/path")).toBe("example.com");
    expect(normalizeWebsite("example.com")).toBe("example.com");
    expect(normalizeWebsite("")).toBeNull();
  });

  test("namesStrictlyMatch: เหมือนกันหลัง normalize หรือครอบกันและยาวต่างไม่เกิน 6", () => {
    expect(namesStrictlyMatch("วัดพระสิงห์", "วัด พระสิงห์!")).toBe(true);
    expect(namesStrictlyMatch("หาดจอมเทียน", "หาดจอมเทียนพัทยา")).toBe(true);
    expect(namesStrictlyMatch("ถ้ำเชียงดาว", "ถ้ำหลวง")).toBe(false);
    expect(namesStrictlyMatch("Cafe&#8217;s", "cafes")).toBe(true);
  });

  test("parseCoords คืน null เมื่อพิกัดพัง", () => {
    expect(parseCoords(row("1", { ATT_LOCATION: "18.79, 98.98" }))).toEqual({ lat: 18.79, lng: 98.98 });
    expect(parseCoords(row("1", { ATT_LOCATION: "https://maps.app.goo.gl/abc" }))).toBeNull();
  });

  test("isJunkName จับ record ทดสอบ", () => {
    expect(isJunkName(row("1", { ATT_NAME_TH: "ทดสอบอัพเดทผ่าน API. 17:51" }))).toBe(true);
    expect(isJunkName(row("1", { ATT_NAME_TH: "ผาช่อ" }))).toBe(false);
  });
});

describe("runDedupe", () => {
  test("phone ตรง + พิกัดใกล้ → merge ด้วย location", () => {
    const result = runDedupe(
      [row("a", { ATT_TEL: "053111222", ATT_LOCATION: NEAR_A }), row("b", { ATT_TEL: "053111222", ATT_LOCATION: NEAR_B })],
      NO_RULES
    );
    expect(result.deduped.map((r) => r.ATT_ID)).toEqual(["a"]);
    expect(result.mergedGroups).toEqual([
      { representativeAttId: "a", droppedAttIds: ["b"], matchedBy: ["phone"], confirmedBy: ["location"] },
    ]);
    expect(result.reviewGroups).toEqual([]);
  });

  test("phone ตรงแต่พิกัดไกล → ไม่ merge แต่เข้า review", () => {
    const result = runDedupe(
      [row("a", { ATT_TEL: "053111222", ATT_LOCATION: NEAR_A }), row("b", { ATT_TEL: "053111222", ATT_LOCATION: FAR })],
      NO_RULES
    );
    expect(result.deduped).toHaveLength(2);
    expect(result.reviewGroups.map((g) => g.rows.map((r) => r.ATT_ID))).toEqual([["a", "b"]]);
  });

  test("ไม่มีพิกัด → ใช้ชื่อยืนยัน", () => {
    const result = runDedupe(
      [
        row("a", { ATT_WEBSITE: "www.site.com", ATT_NAME_TH: "วัดพระสิงห์" }),
        row("b", { ATT_WEBSITE: "https://site.com", ATT_NAME_TH: "วัด พระสิงห์" }),
      ],
      NO_RULES
    );
    expect(result.mergedGroups[0]).toMatchObject({ matchedBy: ["website"], confirmedBy: ["name"] });
  });

  test("blockedPairs ห้าม merge แม้พิกัดใกล้", () => {
    const rows = [row("a", { ATT_TEL: "053111222", ATT_LOCATION: NEAR_A }), row("b", { ATT_TEL: "053111222", ATT_LOCATION: NEAR_B })];
    const result = runDedupe(rows, { ...NO_RULES, blockedPairs: [["b", "a"]] });
    expect(result.deduped).toHaveLength(2);
    expect(result.reviewGroups).toHaveLength(1);
  });

  test("ไม่เลือก record ขยะเป็นตัวแทน และเลือกแถวที่มีพิกัดก่อน", () => {
    const result = runDedupe(
      [
        row("junk", { ATT_NAME_TH: "ทดสอบ", ATT_TEL: "053111222", ATT_LOCATION: NEAR_A }),
        row("real", { ATT_TEL: "053111222", ATT_LOCATION: NEAR_B }),
      ],
      NO_RULES
    );
    expect(result.deduped.map((r) => r.ATT_ID)).toEqual(["real"]);
    expect(result.representativeMap).toEqual({ junk: "real", real: "real" });
  });

  test("excludeIds ถูกตัดทิ้งก่อน dedupe", () => {
    const result = runDedupe([row("a"), row("b")], { ...NO_RULES, excludeIds: ["b"] });
    expect(result.rowsBefore).toBe(2);
    expect(result.deduped.map((r) => r.ATT_ID)).toEqual(["a"]);
  });

  test("locationOverrides แก้พิกัดก่อน ทำให้ merge ได้", () => {
    const rows = [
      row("a", { ATT_TEL: "053111222", ATT_LOCATION: NEAR_A }),
      row("b", { ATT_TEL: "053111222", ATT_LOCATION: "https://maps.app.goo.gl/x" }),
    ];
    const result = runDedupe(rows, {
      ...NO_RULES,
      locationOverrides: { b: { lat: 18.791, lng: 98.98, source: "test" }, other: { lat: 0, lng: 0, source: "ไม่มีในข้อมูล" } },
    });
    expect(result.locationOverridesApplied).toBe(1);
    expect(result.mergedGroups).toHaveLength(1);
    expect(rows[1].ATT_LOCATION).toBe("https://maps.app.goo.gl/x"); // ไม่แก้ข้อมูลต้นทาง
  });

  test("forceMergeGroups รวมกลุ่มที่อัลกอริทึมมองไม่ออก และเอา review cluster ที่ resolve แล้วออก", () => {
    const rows = [
      row("a", { ATT_TEL: "053111222", ATT_LOCATION: NEAR_A }),
      row("b", { ATT_TEL: "053111222", ATT_LOCATION: FAR }),
    ];
    const result = runDedupe(rows, { ...NO_RULES, forceMergeGroups: [["a", "b"], ["x", "y"]] });
    expect(result.deduped.map((r) => r.ATT_ID)).toEqual(["a"]);
    expect(result.mergedGroups).toEqual([
      { representativeAttId: "a", droppedAttIds: ["b"], matchedBy: ["manual"], confirmedBy: ["manual"] },
    ]);
    expect(result.reviewGroups).toEqual([]);
    expect(result.representativeMap.b).toBe("a");
  });
});
