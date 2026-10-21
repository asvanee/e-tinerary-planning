import { makeRow as row } from "../__testutils__/makeRow";
import { createGooglePlacesClient, GoogleApiError, GoogleCandidate, GoogleDetails, GooglePlacesClient } from "../import/googlePlaces";
import { buildSearchQuery, ImportItem, ImportStore, runImportJob } from "../import/importJob";
import { prepareImportRows } from "../import/importRows";
import { matchCandidate, namesSimilar, nameSimilarity } from "../import/matchCandidate";
import { buildPlaceRecord, PlaceRecord } from "../import/placeRecord";
import { DecisionKind, PlaceDecision } from "../review/reviewTypes";

// ห้ามเรียก Google จริงใน test — ทุกกรณีใช้ fetch / client ปลอม

let nextId = 1;
function decision(kind: DecisionKind, attIds: string[], extra: Partial<PlaceDecision> = {}): PlaceDecision {
  const n = nextId++;
  return {
    decision_id: `decision-${n}`,
    province: "ทดลอง",
    kind,
    att_ids: attIds,
    primary_att_id: null,
    field_sources: null,
    field_values: null,
    lat: null,
    lng: null,
    note: null,
    decided_by: "admin-1",
    decided_at: new Date(Date.UTC(2026, 9, 21, 0, 0, n)).toISOString(),
    ...extra,
  };
}

// 0.0009° latitude ≈ 100 m
const BASE = { lat: 18.79, lng: 98.98 };
const north = (meters: number) => ({ lat: BASE.lat + (meters / 100) * 0.0009, lng: BASE.lng });

describe("Google Places client (fetch ปลอม)", () => {
  function fakeFetch(body: unknown, ok = true, status = 200) {
    const urls: string[] = [];
    const fn = async (url: string) => {
      urls.push(url);
      return { ok, status, json: async () => body };
    };
    return { fn, urls };
  }

  test("findPlace ส่ง query/bias/fields/language และคืน candidate แรก", async () => {
    const { fn, urls } = fakeFetch({ status: "OK", candidates: [{ place_id: "g1", name: "A" }, { place_id: "g2" }] });
    const client = createGooglePlacesClient("KEY", fn);
    expect(await client.findPlace("วัด ก เมือง เชียงใหม่", BASE)).toEqual({ place_id: "g1", name: "A" });

    const params = new URL(urls[0]).searchParams;
    expect(urls[0]).toContain("findplacefromtext");
    expect(params.get("input")).toBe("วัด ก เมือง เชียงใหม่");
    expect(params.get("inputtype")).toBe("textquery");
    expect(params.get("locationbias")).toBe("circle:1000@18.79,98.98");
    expect(params.get("fields")).toBe("place_id,name,geometry,formatted_address");
    expect(params.get("language")).toBe("th");
    expect(params.get("key")).toBe("KEY");
  });

  test("ZERO_RESULTS → null", async () => {
    const client = createGooglePlacesClient("KEY", fakeFetch({ status: "ZERO_RESULTS", candidates: [] }).fn);
    expect(await client.findPlace("x", BASE)).toBeNull();
  });

  test("REQUEST_DENIED → GoogleApiError แบบ fatal และข้อความไม่มี key", async () => {
    const client = createGooglePlacesClient("SECRET", fakeFetch({ status: "REQUEST_DENIED", error_message: "bad key" }).fn);
    const err = await client.findPlace("x", BASE).catch((e) => e);
    expect(err).toBeInstanceOf(GoogleApiError);
    expect(err.fatal).toBe(true);
    expect(err.message).toContain("REQUEST_DENIED");
    expect(err.message).not.toContain("SECRET");
  });

  test("HTTP ไม่ ok → error ไม่ fatal", async () => {
    const client = createGooglePlacesClient("KEY", fakeFetch({}, false, 500).fn);
    const err = await client.findPlace("x", BASE).catch((e) => e);
    expect(err).toBeInstanceOf(GoogleApiError);
    expect(err.fatal).toBe(false);
  });

  test("getDetails ขอ field รวม type และคืน result · NOT_FOUND → error", async () => {
    const ok = fakeFetch({ status: "OK", result: { place_id: "g1", types: ["museum"] } });
    expect(await createGooglePlacesClient("KEY", ok.fn).getDetails("g1")).toEqual({ place_id: "g1", types: ["museum"] });
    const params = new URL(ok.urls[0]).searchParams;
    expect(params.get("place_id")).toBe("g1");
    expect(params.get("fields")).toContain("opening_hours");
    expect(params.get("fields")).toContain("type");

    const missing = createGooglePlacesClient("KEY", fakeFetch({ status: "NOT_FOUND" }).fn);
    await expect(missing.getDetails("g1")).rejects.toBeInstanceOf(GoogleApiError);
  });
});

describe("เกณฑ์จับคู่ (D-33)", () => {
  test("ใกล้มากแต่ชื่อไม่คล้าย = mismatch (กรณีวงเวียนพระธาตุแช่แห้ง น่าน)", () => {
    expect(
      matchCandidate(BASE, north(0), "วงเรียนพระธาตุแช่แห้ง", ["เวียงภูเพียงแช่แห้ง", "Wiang Phu Phiang Chae Haeng"])
    ).toMatchObject({ accepted: false, reason: "name_mismatch" });
    expect(matchCandidate(BASE, north(30), "โกโก้วัลเลย์ คาเฟ่", ["โกโก้ วัลเล่ย์", "Cocoa Valley"])).toMatchObject({
      accepted: true,
      reason: "similar_name",
    });
  });

  test("ไม่เกิน 1 km รับเมื่อชื่อคล้าย ไม่คล้าย = mismatch", () => {
    expect(matchCandidate(BASE, north(500), "วัดพระสิงห์วรมหาวิหาร", ["วัดพระสิงห์"])).toMatchObject({
      accepted: true,
      reason: "similar_name",
    });
    expect(matchCandidate(BASE, north(500), "ไทวัสดุ", ["พิพิธภัณฑ์ท้องถิ่น"])).toMatchObject({
      accepted: false,
      reason: "name_mismatch",
    });
  });

  test("> 1 km ไม่รับแม้ชื่อเหมือน · Google ไม่มีพิกัด = no_location", () => {
    expect(matchCandidate(BASE, north(1200), "วัดพระสิงห์", ["วัดพระสิงห์"])).toMatchObject({ accepted: false, reason: "too_far" });
    expect(matchCandidate(BASE, undefined, "วัดพระสิงห์", ["วัดพระสิงห์"])).toEqual({
      accepted: false,
      distanceM: null,
      reason: "no_location",
    });
  });

  test("namesSimilar: เทียบทั้งชื่อไทยและอังกฤษ ไม่นับช่องว่าง/ไม่มี", () => {
    expect(namesSimilar("Asiatique The Riverfront", ["เอเชียทีค", "Asiatique"])).toBe(true);
    expect(namesSimilar("ตลาดวโรรส", ["ไม่มี", "  "])).toBe(false);
    expect(namesSimilar("", ["ตลาดวโรรส"])).toBe(false);
    expect(namesSimilar("ตลาดวโรรส (กาดหลวง)", ["ตลาดวโรรส"])).toBe(true); // ครอบกัน
    expect(namesSimilar("Wat Chedi Luang", ["wat chedi luang!"])).toBe(true);
  });

  test("nameSimilarity ใช้ระยะแก้ไขต่อความยาว (เกณฑ์ 0.6)", () => {
    expect(nameSimilarity("abcde", "abcde")).toBe(1);
    expect(nameSimilarity("abcde", "abcxy")).toBeCloseTo(0.6);
    expect(namesSimilar("abcde", ["abxyz"])).toBe(false); // 0.4
    expect(namesSimilar("abcde", ["abcxy"])).toBe(true); // 0.6
  });
});

describe("prepareImportRows", () => {
  const A = "18.7900, 98.9800";
  const B = "18.7910, 98.9800";

  test("merge ใช้ primary_att_id และค่าแต่ละช่องตาม field_sources · พิกัดที่ admin กรอกเอง", () => {
    const rows = [
      row("a", { ATT_NAME_TH: "ชื่อ A", ATT_LOCATION: A, ATT_TEL: "011", ATT_WEBSITE: "a.com" }),
      row("b", { ATT_NAME_TH: "ชื่อ B", ATT_LOCATION: B, ATT_TEL: "022", ATT_WEBSITE: "b.com" }),
      row("c", { ATT_NAME_TH: "อื่น", ATT_LOCATION: "18.9, 98.9" }),
    ];
    const result = prepareImportRows(rows, [
      decision("merge", ["a", "b"], { primary_att_id: "b", field_sources: { ATT_TEL: "a" }, lat: 18.8, lng: 98.99 }),
    ]);

    expect(result.map((r) => r.attId)).toEqual(["b", "c"]);
    const merged = result[0];
    expect(merged.row.ATT_ID).toBe("b");
    expect(merged.row.ATT_NAME_TH).toBe("ชื่อ B");
    expect(merged.row.ATT_WEBSITE).toBe("b.com");
    expect(merged.row.ATT_TEL).toBe("011");
    expect(merged.row.ATT_LOCATION).toBe("18.8, 98.99");
    expect(merged.mergedAttIds.sort()).toEqual(["a", "b"]);
  });

  test("พิกัดเลือกจากอีกแถวผ่าน field_sources ใช้พิกัดที่แก้แล้วของแถวนั้น", () => {
    const rows = [row("a", { ATT_LOCATION: A }), row("b", { ATT_LOCATION: "พัง" })];
    const result = prepareImportRows(rows, [
      decision("fix_location", ["a"], { lat: 18.81, lng: 98.97 }),
      decision("merge", ["a", "b"], { primary_att_id: "b", field_sources: { ATT_LOCATION: "a" } }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].attId).toBe("b");
    expect(result[0].row.ATT_LOCATION).toBe("18.81, 98.97");
  });

  test("แถวเดียวอยู่ 2 การ์ด: การ์ดหนึ่งแยก อีกการ์ดรวม → รวมเฉพาะคู่ที่สั่งรวม (กรณีแก่งสะม้า 9 บั้ง น่าน)", () => {
    const tel = "0 5471 8938";
    const rows = [
      row("waterfall", { ATT_NAME_TH: "น้ำตกตาดม่าน", ATT_LOCATION: "19.2825262, 100.8174841", ATT_TEL: tel }),
      row("kaeng-old", { ATT_NAME_TH: "แก่งสะม้า 9 บั้ง", ATT_LOCATION: "19.2261741, 100.8239599", ATT_TEL: tel }),
      row("kaeng-new", { ATT_NAME_TH: "แก่งสะม้า 9 บั้ง", ATT_LOCATION: "19.2264481, 100.8225072" }),
    ];
    const result = prepareImportRows(rows, [
      decision("separate", ["waterfall", "kaeng-old"]),
      decision("merge", ["kaeng-new", "kaeng-old"], { primary_att_id: "kaeng-old" }),
    ]);
    expect(result.map((r) => [r.attId, [...r.mergedAttIds].sort()])).toEqual([
      ["waterfall", ["waterfall"]],
      ["kaeng-old", ["kaeng-new", "kaeng-old"]],
    ]);
  });

  test("field_values ทับค่าเดิม (ค่าว่าง = ล้างช่อง) ยกเว้นพิกัดและช่องที่ไม่ได้นำเข้า (D-32)", () => {
    const rows = [
      row("a", { ATT_LOCATION: A, ATT_TEL: "011", ATT_WEBSITE: "a.com", ATT_STATUS: "1" }),
      row("b", { ATT_LOCATION: B, ATT_TEL: "022" }),
    ];
    const result = prepareImportRows(rows, [
      decision("merge", ["a", "b"], {
        primary_att_id: "a",
        field_values: { ATT_TEL: "053999999", ATT_WEBSITE: "", ATT_LOCATION: "1, 1", ATT_STATUS: "0" },
      }),
    ]);
    expect(result[0].row).toMatchObject({ ATT_TEL: "053999999", ATT_WEBSITE: "", ATT_LOCATION: A, ATT_STATUS: "1" });
  });

  test("field_sources เก่าที่เลือกช่องที่ไม่ได้นำเข้าไว้ ไม่มีผล (D-31)", () => {
    const rows = [row("a", { ATT_LOCATION: A, ATT_STATUS: "1" }), row("b", { ATT_LOCATION: B, ATT_STATUS: "0" })];
    const result = prepareImportRows(rows, [
      decision("merge", ["a", "b"], { primary_att_id: "a", field_sources: { ATT_STATUS: "b" } }),
    ]);
    expect(result[0].row.ATT_STATUS).toBe("1");
  });

  test("exclude ตัดทิ้ง · fix_location ล่าสุดเท่านั้น · separate คงทุกแถว", () => {
    const rows = [
      row("a", { ATT_NAME_TH: "ซ้ำ", ATT_LOCATION: A, ATT_TEL: "0811111111" }),
      row("b", { ATT_NAME_TH: "ซ้ำ", ATT_LOCATION: B, ATT_TEL: "0811111111" }),
      row("x", { ATT_LOCATION: A }),
    ];
    const result = prepareImportRows(rows, [
      decision("separate", ["a", "b"]),
      decision("exclude", ["x"]),
      decision("fix_location", ["a"], { lat: 18.5, lng: 98.5 }),
      decision("fix_location", ["a"], { lat: 18.6, lng: 98.6 }),
    ]);
    expect(result.map((r) => r.attId)).toEqual(["a", "b"]);
    expect(result[0].row.ATT_LOCATION).toBe("18.6, 98.6");
  });
});

describe("buildPlaceRecord / buildSearchQuery", () => {
  const csv = row("a", {
    ATT_NAME_TH: "ชื่อ CSV",
    ATT_TEL: "053111111",
    ATT_WEBSITE: "ไม่มี",
    DISTRICT_NAME_TH: "เมืองเชียงใหม่",
    PROVINCE_NAME_TH: "เชียงใหม่",
    ATT_TYPE_LABEL: "วัด",
    ATT_FACEBOOK: "  ",
  });

  test("พิกัดจาก CSV · ชื่อ/เว็บจาก Google ก่อน · เบอร์ fallback CSV · att_* จาก CSV", () => {
    const record = buildPlaceRecord(
      csv,
      { lat: 18.7, lng: 98.9 },
      { place_id: "g1", name: "ชื่อ candidate", geometry: { location: { lat: 1, lng: 1 } } },
      { place_id: "g1", name: "ชื่อ Google", website: "https://g.com", rating: 4.5, types: ["place_of_worship"] }
    );
    expect(record).toMatchObject({
      google_place_id: "g1",
      place_name: "ชื่อ Google",
      latitude: 18.7,
      longitude: 98.9,
      website: "https://g.com",
      phone_number: "053111111",
      rating: 4.5,
      price_level: null,
      opening_hours: null,
      gmaps_types: ["place_of_worship"],
      province: "เชียงใหม่",
      district: "เมืองเชียงใหม่",
      att_id: "a",
      att_type_label: "วัด",
      att_facebook: null,
    });
  });

  test("Google ไม่มีชื่อ/เว็บ → candidate แล้ว CSV · ไม่มี types = null", () => {
    const record = buildPlaceRecord(csv, { lat: 1, lng: 2 }, { place_id: "g1" }, {});
    expect(record.place_name).toBe("ชื่อ CSV");
    expect(record.website).toBeNull(); // "ไม่มี" ใน CSV
    expect(record.gmaps_types).toBeNull();
    expect(record.formatted_address).toBe("เมืองเชียงใหม่, เชียงใหม่");
  });

  test("query = ชื่อไทย อำเภอ จังหวัด (ไม่มีชื่อไทยใช้อังกฤษ)", () => {
    expect(buildSearchQuery(csv)).toBe("ชื่อ CSV เมืองเชียงใหม่ เชียงใหม่");
    expect(buildSearchQuery(row("b", { ATT_NAME_TH: "", ATT_NAME_EN: "Old City", PROVINCE_NAME_TH: "เชียงใหม่" }))).toBe(
      "Old City เชียงใหม่"
    );
  });
});

describe("runImportJob (Google และ DB ปลอม)", () => {
  type Script = { candidate?: GoogleCandidate | null; details?: GoogleDetails; error?: Error };

  function fakeGoogle(byQueryPrefix: Record<string, Script>) {
    const calls = { find: 0, details: 0 };
    const scriptFor = (query: string) => {
      const key = Object.keys(byQueryPrefix).find((k) => query.startsWith(k));
      if (!key) throw new Error(`ไม่มี script สำหรับ ${query}`);
      return byQueryPrefix[key];
    };
    const detailsById = new Map<string, Script>();
    const client: GooglePlacesClient = {
      async findPlace(query) {
        calls.find++;
        const script = scriptFor(query);
        if (script.error) throw script.error;
        if (script.candidate) detailsById.set(script.candidate.place_id, script);
        return script.candidate ?? null;
      },
      async getDetails(placeId) {
        calls.details++;
        return detailsById.get(placeId)?.details ?? { place_id: placeId };
      },
    };
    return { client, calls };
  }

  function fakeStore(opts: { existing?: Record<string, string>; cancelAfter?: number; failTypes?: boolean } = {}) {
    const items: ImportItem[] = [];
    const places: PlaceRecord[] = [];
    const placeTypes: [string, string[]][] = [];
    const progress: number[] = [];
    let finished: { status: string; error: string | null } | null = null;
    let cancelChecks = 0;
    const store: ImportStore = {
      async isCancelRequested() {
        cancelChecks++;
        return opts.cancelAfter !== undefined && cancelChecks > opts.cancelAfter;
      },
      async findPlaceIdByGooglePlaceId(id) {
        return opts.existing?.[id] ?? null;
      },
      async insertPlace(record) {
        places.push(record);
        return `place-${places.length}`;
      },
      async insertPlaceTypes(placeId, types) {
        if (opts.failTypes) throw new Error("types fail");
        placeTypes.push([placeId, types]);
      },
      async addItem(item) {
        items.push(item);
      },
      async updateProgress(_jobId, counters) {
        progress.push(counters.processed);
      },
      async finishJob(_jobId, status, error) {
        finished = { status, error };
      },
    };
    return { store, items, places, placeTypes, progress, finished: () => finished };
  }

  const at = (meters: number) => ({ location: north(meters) });
  const importRow = (id: string, name: string, location = "18.7900, 98.9800") => ({
    attId: id,
    row: row(id, { ATT_NAME_TH: name, ATT_LOCATION: location, PROVINCE_NAME_TH: "เชียงใหม่" }),
    mergedAttIds: [id],
  });
  const noSleep = async () => {};
  let consoleError: jest.SpyInstance;
  beforeEach(() => {
    consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => consoleError.mockRestore());

  test("แยกผลทุกสถานะ และนับตัวเลขถูก", async () => {
    const google = fakeGoogle({
      ใกล้: { candidate: { place_id: "g1", name: "ใกล้", geometry: at(50) }, details: { place_id: "g1", types: ["a", "a", "b"] } },
      ชื่อคล้าย: { candidate: { place_id: "g2", name: "ชื่อคล้าย (สาขา)", geometry: at(600) } },
      ไกล: { candidate: { place_id: "g3", name: "ไกล", geometry: at(3000) } },
      ไม่เจอ: { candidate: null },
      ซ้ำในjob: { candidate: { place_id: "g1", name: "ซ้ำในjob", geometry: at(10) } },
      ซ้ำในdb: { candidate: { place_id: "gdb", name: "ซ้ำในdb", geometry: at(10) } },
      พัง: { error: new Error("network") },
    });
    const db = fakeStore({ existing: { gdb: "place-old" } });

    await runImportJob({
      jobId: "job-1",
      rows: [
        importRow("1", "ใกล้"),
        importRow("2", "ชื่อคล้าย"),
        importRow("3", "ไกล"),
        importRow("4", "ไม่เจอ"),
        importRow("5", "ซ้ำในjob"),
        importRow("6", "ซ้ำในdb"),
        importRow("7", "พิกัดเสีย", "short.link/x"),
        importRow("8", "พัง"),
      ],
      google: google.client,
      store: db.store,
      sleep: noSleep,
    });

    expect(db.items.map((i) => [i.att_id, i.status])).toEqual([
      ["1", "imported"],
      ["2", "imported"],
      ["3", "needs_review_mismatch"],
      ["4", "needs_review_not_found"],
      ["5", "needs_review_duplicate"],
      ["6", "needs_review_duplicate"],
      ["7", "error"],
      ["8", "error"],
    ]);
    expect(db.items[0]).toMatchObject({ job_id: "job-1", google_place_id: "g1", place_id: "place-1", distance_m: 50 });
    expect(db.items[1].message).toBeNull();
    expect(db.items[2]).toMatchObject({ google_place_id: "g3", place_id: null });
    expect(db.items[2].distance_m).toBeGreaterThan(2990); // north() ประมาณ 0.0009° ≈ 100 m
    expect(db.items[2].distance_m).toBeLessThan(3010);
    expect(db.items[2].candidate).toMatchObject({ name: "ไกล" });
    expect(db.items[4].message).toContain("ATT_ID 1");
    expect(db.items[5]).toMatchObject({ place_id: "place-old" });
    expect(db.places.map((p) => p.att_id)).toEqual(["1", "2"]);
    expect(db.places[0]).toMatchObject({ latitude: 18.79, longitude: 98.98 }); // พิกัด CSV ไม่ใช่ของ Google
    expect(db.placeTypes).toEqual([["place-1", ["a", "b"]]]);
    expect(google.calls).toEqual({ find: 7, details: 2 }); // แถวพิกัดเสียไม่เรียก Google · ไม่ผ่านเกณฑ์ไม่เรียก Details
    expect(db.progress).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(db.finished()).toEqual({ status: "done", error: null });
  });

  test("ยกเลิกระหว่างทาง → cancelled และไม่ทำแถวที่เหลือ", async () => {
    const google = fakeGoogle({ ที่: { candidate: { place_id: "g", name: "ที่", geometry: at(0) } } });
    const db = fakeStore({ cancelAfter: 1 });
    await runImportJob({
      jobId: "job-2",
      rows: [importRow("1", "ที่1"), importRow("2", "ที่2"), importRow("3", "ที่3")],
      google: google.client,
      store: db.store,
      sleep: noSleep,
    });
    expect(db.items).toHaveLength(1);
    expect(db.finished()).toEqual({ status: "cancelled", error: null });
  });

  test("Google key/โควต้าใช้ไม่ได้ → หยุดทั้ง job เป็น failed", async () => {
    const google = fakeGoogle({ ที่: { error: new GoogleApiError("REQUEST_DENIED", "Google status REQUEST_DENIED") } });
    const db = fakeStore();
    await runImportJob({
      jobId: "job-3",
      rows: [importRow("1", "ที่1"), importRow("2", "ที่2")],
      google: google.client,
      store: db.store,
      sleep: noSleep,
    });
    expect(db.items).toHaveLength(0);
    expect(google.calls.find).toBe(1);
    expect(db.finished()).toEqual({ status: "failed", error: "Google status REQUEST_DENIED" });
  });

  test("place_types บันทึกไม่สำเร็จ ยังนับว่า imported พร้อมหมายเหตุ · หน่วงหลังทุก request", async () => {
    const google = fakeGoogle({ ที่: { candidate: { place_id: "g", name: "ที่", geometry: at(0) }, details: { types: ["museum"] } } });
    const db = fakeStore({ failTypes: true });
    const sleeps: number[] = [];
    await runImportJob({
      jobId: "job-4",
      rows: [importRow("1", "ที่")],
      google: google.client,
      store: db.store,
      delayMs: 200,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    });
    expect(db.items[0]).toMatchObject({ status: "imported", message: "บันทึก place_types ไม่สำเร็จ" });
    expect(sleeps).toEqual([200, 200]);
  });
});
