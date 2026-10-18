import { makeRow as row } from "../__testutils__/makeRow";
import { AttractionRow } from "../attractionTypes";
import { buildProvinceReview } from "../review/buildReview";
import { decisionsToRules } from "../review/decisionRules";
import { parseGroupDecision, parseRowDecision } from "../review/decisionInput";
import { DecisionKind, PlaceDecision } from "../review/reviewTypes";

let nextId = 1;
function decision(kind: DecisionKind, attIds: string[], extra: Partial<PlaceDecision> = {}): PlaceDecision {
  return {
    decision_id: nextId++,
    province: "ทดลอง",
    kind,
    att_ids: attIds,
    primary_att_id: null,
    field_sources: null,
    lat: null,
    lng: null,
    note: null,
    decided_by: "admin-1",
    decided_at: "2026-10-18T00:00:00Z",
    ...extra,
  };
}

// พิกัดในเชียงใหม่: A–B ห่าง ~110 m · A–C ห่าง ~30 m · FAR ห่าง ~5.5 km
const A = "18.7900, 98.9800";
const B = "18.7910, 98.9800";
const C = "18.79027, 98.9800";
const FAR = "18.8400, 98.9800";

const byId = (rows: AttractionRow[]) => new Map(rows.map((r) => [r.ATT_ID, r]));

describe("decisionsToRules", () => {
  test("merge → forceMerge, separate → blocked ทุกคู่ยกเว้นคู่ที่ merge", () => {
    const rules = decisionsToRules([
      decision("merge", ["a", "b"]),
      decision("separate", ["a", "b", "c"]),
      decision("exclude", ["x"]),
      decision("fix_location", ["y"], { lat: 18.8, lng: 98.9 }),
    ]);
    expect(rules.forceMergeGroups).toEqual([["a", "b"]]);
    expect(rules.blockedPairs).toEqual([["a", "c"], ["b", "c"]]);
    expect(rules.excludeIds).toEqual(["x"]);
    expect(rules.locationOverrides.y).toMatchObject({ lat: 18.8, lng: 98.9 });
  });

  test("merge ที่กรอกพิกัดเอง → override พิกัดของแถวหลัก", () => {
    const rules = decisionsToRules([decision("merge", ["a", "b"], { primary_att_id: "b", lat: 18.7, lng: 98.9 })]);
    expect(rules.locationOverrides.b).toMatchObject({ lat: 18.7, lng: 98.9 });
  });
});

describe("buildProvinceReview — กลุ่ม", () => {
  const contactRows = () => [
    row("a", { ATT_TEL: "053111222", ATT_LOCATION: A }),
    row("b", { ATT_TEL: "053111222", ATT_LOCATION: B }),
  ];

  test("contact ตรง + พิกัดใกล้ → น่าจะซ้ำ และยังไม่ตัดสิน", () => {
    const review = buildProvinceReview("ทดลอง", contactRows(), []);
    expect(review.groups).toHaveLength(1);
    expect(review.groups[0]).toMatchObject({ attIds: ["a", "b"], category: "likely_duplicate", decided: false });
    expect(review.summary.pending).toBe(1);
  });

  test("merge ครอบทุกคู่ → ตัดสินแล้ว", () => {
    const d = decision("merge", ["a", "b"], { primary_att_id: "a" });
    const review = buildProvinceReview("ทดลอง", contactRows(), [d]);
    expect(review.groups[0]).toMatchObject({ decided: true, decisionIds: [d.decision_id] });
    expect(review.summary.pending).toBe(0);
  });

  test("ชื่อคล้ายแต่ไม่มี contact ร่วม → ต้องตรวจสอบ (similar_name)", () => {
    const review = buildProvinceReview(
      "ทดลอง",
      [row("a", { ATT_NAME_TH: "วัดพระสิงห์", ATT_LOCATION: A }), row("b", { ATT_NAME_TH: "วัด พระสิงห์", ATT_LOCATION: FAR })],
      []
    );
    expect(review.groups[0].category).toBe("needs_review");
    expect(review.groups[0].reasons.map((r) => r.type)).toEqual(["similar_name"]);
  });

  test("พิกัดห่างไม่เกิน 50 m แต่ชื่อต่าง → near_points", () => {
    const review = buildProvinceReview(
      "ทดลอง",
      [row("a", { ATT_NAME_TH: "ร้านกาแฟ", ATT_LOCATION: A }), row("c", { ATT_NAME_TH: "พิพิธภัณฑ์", ATT_LOCATION: C })],
      []
    );
    expect(review.groups[0].reasons.map((r) => r.type)).toEqual(["near_points"]);
  });

  test("ไม่รวมกลุ่มข้ามตัวตรวจ — แถวเดียวอยู่ได้หลายกลุ่ม และตัดสินแยกกันได้", () => {
    const rows = [
      row("a", { ATT_NAME_TH: "น้ำตกแม่สา", ATT_TEL: "053111222", ATT_LOCATION: A }),
      row("b", { ATT_NAME_TH: "สวนพฤกษ", ATT_TEL: "053111222", ATT_LOCATION: B }),
      row("c", { ATT_NAME_TH: "น้ำตก แม่สา", ATT_LOCATION: FAR }),
    ];
    const review = buildProvinceReview("ทดลอง", rows, []);
    expect(review.groups.map((g) => [g.reasons[0].type, g.attIds])).toEqual([
      ["contact_confirmed", ["a", "b"]],
      ["similar_name", ["a", "c"]],
    ]);

    const decided = buildProvinceReview("ทดลอง", rows, [decision("separate", ["a", "c"])]);
    expect(decided.groups.map((g) => g.decided)).toEqual([false, true]);
  });

  test("merge บางส่วน + separate ทั้งกลุ่ม → ตัดสินแล้ว · มีแถวใหม่เข้ากลุ่ม → กลับไปรอตัดสิน", () => {
    const rows = [
      row("a", { ATT_TEL: "053111222", ATT_LOCATION: A }),
      row("b", { ATT_TEL: "053111222", ATT_LOCATION: B }),
      row("c", { ATT_TEL: "053111222", ATT_LOCATION: FAR }),
    ];
    const decisions = [decision("merge", ["a", "b"], { primary_att_id: "a" }), decision("separate", ["a", "b", "c"])];
    // กลุ่ม contact ยืนยันได้ [a,b] + กลุ่ม contact ยืนยันไม่ได้ [a,b,c]
    expect(buildProvinceReview("ทดลอง", rows, decisions).groups.map((g) => g.decided)).toEqual([true, true]);

    const withNewRow = [...rows, row("d", { ATT_TEL: "053111222", ATT_LOCATION: FAR })];
    const groups = buildProvinceReview("ทดลอง", withNewRow, decisions).groups;
    expect(groups.find((g) => g.attIds.includes("d"))?.decided).toBe(false);
    expect(groups.find((g) => g.attIds.join() === "a,b")?.decided).toBe(true);
  });

  test("แถวที่ exclude ไม่อยู่ในกลุ่ม", () => {
    const review = buildProvinceReview("ทดลอง", contactRows(), [decision("exclude", ["b"])]);
    expect(review.groups).toEqual([]);
    expect(review.summary.excluded).toBe(1);
    expect(review.problemRows.find((r) => r.attId === "b")?.decision?.kind).toBe("exclude");
  });
});

describe("buildProvinceReview — ปัญหารายแถว", () => {
  const issuesOf = (rows: AttractionRow[], id: string, decisions: PlaceDecision[] = []) =>
    buildProvinceReview("ทดลอง", rows, decisions).problemRows.find((r) => r.attId === id)?.issues.map((i) => i.type) ?? [];

  const base = [row("ok1", { ATT_LOCATION: A }), row("ok2", { ATT_LOCATION: FAR })];

  test("ตรวจพบปัญหาแต่ละประเภท", () => {
    const rows = [
      ...base,
      row("link", { ATT_LOCATION: "https://maps.app.goo.gl/x" }),
      row("abroad", { ATT_LOCATION: "9.9, -84.0" }),
      row("far", { ATT_LOCATION: "13.75, 100.5" }),
      row("junk", { ATT_NAME_TH: "ทดสอบอัพเดทผ่าน API", ATT_LOCATION: A.replace("98.98", "98.99") }),
      row("noname", { ATT_NAME_TH: "", ATT_NAME_EN: "ไม่มี", ATT_LOCATION: FAR.replace("18.84", "18.85") }),
      row("closed", { ATT_STATUS: "3", ATT_STATUS_REMARK: "โครงการปิดไปแล้ว", ATT_LOCATION: FAR.replace("18.84", "18.86") }),
    ];
    expect(issuesOf(rows, "link")).toEqual(["invalid_location"]);
    expect(issuesOf(rows, "abroad")).toEqual(["outside_thailand"]);
    expect(issuesOf(rows, "far")).toEqual(["far_from_province"]);
    expect(issuesOf(rows, "junk")).toEqual(["junk_name"]);
    expect(issuesOf(rows, "noname")).toEqual(["missing_name"]);
    expect(issuesOf(rows, "closed")).toEqual(["status_not_active"]);
    expect(issuesOf(rows, "ok1")).toEqual([]);
  });

  test("fix_location ล่าสุดแก้พิกัดก่อนตรวจ และแถวยังแสดงพร้อมการตัดสินใจ", () => {
    const rows = [...base, row("link", { ATT_LOCATION: "https://maps.app.goo.gl/x" })];
    const old = decision("fix_location", ["link"], { lat: 9.9, lng: 99.9 });
    const latest = decision("fix_location", ["link"], { lat: 18.8, lng: 98.98 });
    const review = buildProvinceReview("ทดลอง", rows, [old, latest]);
    const entry = review.problemRows.find((r) => r.attId === "link")!;
    expect(entry.issues).toEqual([]);
    expect(entry.decision?.decision_id).toBe(latest.decision_id);
    expect(review.summary.pending).toBe(0);
  });
});

describe("parseGroupDecision", () => {
  const rows = byId([
    row("a", { ATT_TEL: "1", ATT_LOCATION: A }),
    row("b", { ATT_TEL: "2", ATT_LOCATION: B }),
    row("c", { ATT_TEL: "3" }),
  ]);
  const parse = (body: unknown) => parseGroupDecision(body, "ทดลอง", rows, "admin-1");

  test("merge 2 แถว + แยกอีก 1 แถว → merge + separate", () => {
    const result = parse({
      attIds: ["a", "b", "c"],
      sets: [{ attIds: ["a", "b"], primaryAttId: "a", fieldSources: { ATT_TEL: "b", ATT_NAME_TH: "a" } }],
    });
    expect(result.ok && result.value.map((d) => d.kind)).toEqual(["merge", "separate"]);
    expect(result.ok && result.value[0]).toMatchObject({ primary_att_id: "a", field_sources: { ATT_TEL: "b" } });
  });

  test("merge ทั้งกลุ่ม → merge อย่างเดียว · ไม่ merge เลย → separate อย่างเดียว", () => {
    const all = parse({ attIds: ["a", "b"], sets: [{ attIds: ["a", "b"], primaryAttId: "b" }] });
    expect(all.ok && all.value.map((d) => d.kind)).toEqual(["merge"]);
    const none = parse({ attIds: ["a", "b"], sets: [] });
    expect(none.ok && none.value.map((d) => d.kind)).toEqual(["separate"]);
  });

  test.each([
    ["แถวไม่อยู่ในจังหวัด", { attIds: ["a", "zzz"], sets: [] }],
    ["กลุ่มมีแถวเดียว", { attIds: ["a"], sets: [] }],
    ["set ซ้อนกัน", { attIds: ["a", "b", "c"], sets: [{ attIds: ["a", "b"], primaryAttId: "a" }, { attIds: ["b", "c"], primaryAttId: "b" }] }],
    ["แถวหลักไม่อยู่ใน set", { attIds: ["a", "b", "c"], sets: [{ attIds: ["a", "b"], primaryAttId: "c" }] }],
    ["เลือกค่าจากแถวนอก set", { attIds: ["a", "b", "c"], sets: [{ attIds: ["a", "b"], primaryAttId: "a", fieldSources: { ATT_TEL: "c" } }] }],
    ["ช่องข้อมูลที่ไม่มีจริง", { attIds: ["a", "b"], sets: [{ attIds: ["a", "b"], primaryAttId: "a", fieldSources: { HACK: "b" } }] }],
    ["พิกัดนอกไทย", { attIds: ["a", "b"], sets: [{ attIds: ["a", "b"], primaryAttId: "a", lat: 9.9, lng: -84 }] }],
    ["กรอกพิกัดพร้อมเลือกพิกัดจากแถวอื่น", { attIds: ["a", "b"], sets: [{ attIds: ["a", "b"], primaryAttId: "a", lat: 18.8, lng: 98.9, fieldSources: { ATT_LOCATION: "b" } }] }],
  ])("ปฏิเสธ: %s", (_label, body) => {
    expect(parse(body).ok).toBe(false);
  });
});

describe("parseRowDecision", () => {
  const rows = byId([row("a")]);
  const parse = (body: unknown, attId = "a") => parseRowDecision(body, "ทดลอง", attId, rows, "admin-1");

  test("fix_location ต้องมีพิกัดในไทย", () => {
    expect(parse({ kind: "fix_location", lat: 18.8, lng: 98.9 })).toMatchObject({ ok: true, value: { lat: 18.8, lng: 98.9 } });
    expect(parse({ kind: "fix_location" }).ok).toBe(false);
    expect(parse({ kind: "fix_location", lat: "18.8", lng: 98.9 }).ok).toBe(false);
  });

  test("exclude / ok ไม่รับพิกัด และต้องเป็นแถวในจังหวัด", () => {
    expect(parse({ kind: "exclude", note: "record ทดสอบ" })).toMatchObject({ ok: true, value: { note: "record ทดสอบ" } });
    expect(parse({ kind: "ok", lat: 18.8, lng: 98.9 }).ok).toBe(false);
    expect(parse({ kind: "merge" }).ok).toBe(false);
    expect(parse({ kind: "ok" }, "zzz").ok).toBe(false);
  });
});
