import { makeRow as row } from "../__testutils__/makeRow";
import { GoogleDetails, GooglePlacesClient } from "../import/googlePlaces";
import { ImportItem } from "../import/importJob";
import { PlaceRecord } from "../import/placeRecord";
import { resolveItem, ResolveStore } from "../import/resolveItem";

// P4c — ห้ามเรียก Google/Supabase จริง ทุกกรณีใช้ของปลอม

function fakeStore(opts: { existing?: Record<string, string>; alreadyResolved?: boolean } = {}) {
  const places: PlaceRecord[] = [];
  const resolved: [string, string | null, string][] = [];
  const store: ResolveStore = {
    async findPlaceIdByGooglePlaceId(id) {
      return opts.existing?.[id] ?? null;
    },
    async insertPlace(record) {
      places.push(record);
      return `place-${places.length}`;
    },
    async markResolved(itemId, placeId, message) {
      if (opts.alreadyResolved) return false;
      resolved.push([itemId, placeId, message]);
      return true;
    },
  };
  return { store, places, resolved };
}

function fakeGoogle(details: GoogleDetails = {}) {
  const calls: string[] = [];
  const client: GooglePlacesClient = {
    async findPlace() {
      throw new Error("ไม่ควรเรียก Find Place ตอนตัดสิน");
    },
    async getDetails(placeId) {
      calls.push(placeId);
      return { place_id: placeId, ...details };
    },
  };
  return { client, calls };
}

const item = (extra: Partial<ImportItem> = {}): ImportItem & { item_id: string } => ({
  item_id: "item-1",
  job_id: "job-1",
  att_id: "a",
  status: "needs_review_mismatch",
  google_place_id: "g1",
  place_id: null,
  candidate: { name: "ชื่อ Google", formatted_address: "ที่อยู่ Google", lat: 1, lng: 1 },
  distance_m: 2000,
  message: "ผลจาก Google ห่างจากพิกัด CSV เกิน 1 km",
  ...extra,
});

const csvRow = row("a", { ATT_NAME_TH: "ชื่อ CSV", ATT_LOCATION: "18.79, 98.98", ATT_TEL: "053111111", PROVINCE_NAME_TH: "น่าน" });

describe("resolveItem (P4c)", () => {
  test("accept_google: Details 1 ครั้ง · พิกัดจาก CSV · ชื่อจาก Google · gmaps_types · resolved", async () => {
    const google = fakeGoogle({ name: "ชื่อจาก Details", rating: 4.2, types: ["park", "park"] });
    const db = fakeStore();
    const result = await resolveItem({ item: item(), row: csvRow, action: "accept_google", google: google.client, store: db.store });

    expect(result).toEqual({ ok: true, placeId: "place-1" });
    expect(google.calls).toEqual(["g1"]);
    expect(db.places[0]).toMatchObject({
      google_place_id: "g1",
      place_name: "ชื่อจาก Details",
      latitude: 18.79,
      longitude: 98.98,
      rating: 4.2,
      att_id: "a",
    });
    expect(db.places[0].gmaps_types).toEqual(["park", "park"]); // ไม่เขียน place_types แล้ว (D-38)
    expect(db.resolved).toEqual([["item-1", "place-1", "admin ยอมรับผล Google"]]);
  });

  test("csv_only: ไม่เรียก Google · google_place_id = csv:<ATT_ID> · ค่าจาก CSV", async () => {
    const google = fakeGoogle();
    const db = fakeStore();
    const result = await resolveItem({ item: item(), row: csvRow, action: "csv_only", google: google.client, store: db.store });

    expect(result).toEqual({ ok: true, placeId: "place-1" });
    expect(google.calls).toEqual([]);
    expect(db.places[0]).toMatchObject({
      google_place_id: "csv:a",
      place_name: "ชื่อ CSV",
      phone_number: "053111111",
      rating: null,
      opening_hours: null,
      gmaps_types: null,
    });
    expect(db.resolved[0][2]).toBe("admin นำเข้าจาก CSV อย่างเดียว");
  });

  test("skip: ไม่บันทึก places · resolved โดยไม่มี place_id", async () => {
    const db = fakeStore();
    const result = await resolveItem({ item: item(), row: csvRow, action: "skip", google: null, store: db.store });
    expect(result).toEqual({ ok: true, placeId: null });
    expect(db.places).toEqual([]);
    expect(db.resolved).toEqual([["item-1", null, "admin ตัดทิ้ง"]]);
  });

  test.each([
    ["แถวที่ไม่ได้รอตรวจแล้ว", { item: item({ status: "imported" }), action: "skip" as const }],
    ["ยอมรับผล Google ของแถวซ้ำ", { item: item({ status: "needs_review_duplicate" }), action: "accept_google" as const }],
    ["ยอมรับผล Google ของแถวที่ Google ไม่พบ", { item: item({ status: "needs_review_not_found", google_place_id: null }), action: "accept_google" as const }],
    ["ไม่มี API key", { item: item(), action: "accept_google" as const, noGoogle: true }],
    ["ไม่มีแถวในข้อมูลที่ตรวจแล้ว", { item: item(), action: "csv_only" as const, noRow: true }],
    ["พิกัด CSV ใช้ไม่ได้", { item: item(), action: "csv_only" as const, badRow: true }],
  ])("ปฏิเสธ: %s (ไม่บันทึกอะไร)", async (_label, c) => {
    const google = fakeGoogle();
    const db = fakeStore();
    const result = await resolveItem({
      item: c.item,
      row: "noRow" in c ? undefined : "badRow" in c ? row("a", { ATT_LOCATION: "พัง" }) : csvRow,
      action: c.action,
      google: "noGoogle" in c ? null : google.client,
      store: db.store,
    });
    expect(result.ok).toBe(false);
    expect(db.places).toEqual([]);
    expect(db.resolved).toEqual([]);
    expect(google.calls).toEqual([]);
  });

  test("ปฏิเสธเมื่อมีสถานที่นี้ใน places แล้ว (ทั้ง Google และ csv:)", async () => {
    const google = fakeGoogle();
    const db = fakeStore({ existing: { g1: "place-old", "csv:a": "place-csv" } });
    expect((await resolveItem({ item: item(), row: csvRow, action: "accept_google", google: google.client, store: db.store })).ok).toBe(false);
    expect((await resolveItem({ item: item(), row: csvRow, action: "csv_only", google: google.client, store: db.store })).ok).toBe(false);
    expect(google.calls).toEqual([]);
    expect(db.places).toEqual([]);
  });

  test("Details คืน place_id ใหม่ที่มีอยู่แล้ว → ปฏิเสธก่อนบันทึก", async () => {
    const google = fakeGoogle({ place_id: "g-new" });
    const db = fakeStore({ existing: { "g-new": "place-old" } });
    const result = await resolveItem({ item: item(), row: csvRow, action: "accept_google", google: google.client, store: db.store });
    expect(result.ok).toBe(false);
    expect(db.places).toEqual([]);
  });

  test("ถูกตัดสินไปก่อนแล้ว (กดซ้ำ/สองแท็บ) → แจ้งผู้ใช้", async () => {
    const db = fakeStore({ alreadyResolved: true });
    const result = await resolveItem({ item: item(), row: csvRow, action: "skip", google: null, store: db.store });
    expect(result).toEqual({ ok: false, message: "แถวนี้ถูกตัดสินไปแล้ว" });
  });
});
