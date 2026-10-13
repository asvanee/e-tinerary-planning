/**
 * utils/weatherDebug.ts — ไฟล์ debug ชั่วคราว (ลบได้เมื่อหาสาเหตุ weather_score = 1 เจอแล้ว)
 *
 * ไม่แตะ poiScoreCalculator.ts / weatherForecast.ts เลย
 * - debugOpenMeteo : ยิง Open-Meteo เองด้วย endpoint เดียวกัน (daily.precipitation_probability_max)
 *                    แล้ว log URL, HTTP status, JSON ดิบ, จำนวนวันเที่ยว, ฝนรายวัน, ค่าเฉลี่ย
 * - debugRainGrid  : log ว่า rainByGrid (ที่ระบบได้จริง) มีอะไรบ้าง + gridKey ของ place hit/miss ไหม
 * - explainWeatherScore : อธิบายสูตร weather_score ทีละขั้น + เทียบกับค่าที่ระบบคำนวณจริง
 *
 * ต้องใช้ Node 18+ (global fetch)
 */

type Env = "INDOOR" | "OUTDOOR" | "MIXED";

// ต้องตรงกับ RAIN_EXPOSURE ใน poiScoreCalculator.ts (ซ้ำไว้ชั่วคราวเพื่อไม่แก้ไฟล์นั้น)
const RAIN_EXPOSURE: Record<Env, number> = { OUTDOOR: 1, MIXED: 0.5, INDOOR: 0 };

// น้ำหนัก weather ใน poiScoreCalculator.ts (WEIGHTS.weather / REMAINING_BASE_SUM)
const BASE_WEATHER_WEIGHT = 0.1;
const REMAINING_BASE_SUM = 0.85;

const fmt = (n: number, d = 4) => Number(n.toFixed(d));

/** วันที่ปัจจุบันตามเวลาไทย รูปแบบ YYYY-MM-DD */
function todayBangkok(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" });
}

/** ผลต่างเป็นจำนวนวันระหว่าง 2 วันที่ YYYY-MM-DD (b - a) */
function diffDays(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
}

export async function debugOpenMeteo(
  lat: number,
  lng: number,
  startDate: string,
  endDate: string
): Promise<void> {
  const today = todayBangkok();
  const tripDays = diffDays(startDate, endDate) + 1;

  console.log("[WEATHER-DEBUG] ===== ช่วงเดินทาง =====");
  console.log({
    today,
    startDate,
    endDate,
    tripDays,
    daysUntilStart: diffDays(today, startDate),
    daysUntilEnd: diffDays(today, endDate),
    note: "Open-Meteo forecast ครอบคลุมประมาณ 16 วันนับจากวันนี้ — ถ้า daysUntilEnd > ~15 มักได้ error/ว่าง",
  });

  const url =
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${lat}&longitude=${lng}` +
    `&daily=precipitation_probability_max` +
    `&timezone=Asia%2FBangkok` +
    `&start_date=${startDate}&end_date=${endDate}`;
  console.log("[WEATHER-DEBUG] URL:", url);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);

  try {
    const res = await fetch(url, { signal: controller.signal });
    console.log("[WEATHER-DEBUG] HTTP status:", res.status, res.statusText);

    const text = await res.text();
    if (!res.ok) {
      console.log("[WEATHER-DEBUG] ❌ response body (error):", text);
      return;
    }

    const json = JSON.parse(text);
    const times: string[] = json?.daily?.time ?? [];
    const rains: Array<number | null> =
      json?.daily?.precipitation_probability_max ?? [];

    console.log("[WEATHER-DEBUG] raw daily:", JSON.stringify(json?.daily));

    const rows = times.map((t, i) => ({
      date: t,
      rainPct: rains[i] ?? null,
    }));
    console.table(rows);

    const valid = rows
      .map((r) => r.rainPct)
      .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
    const nullCount = rows.length - valid.length;
    const avg =
      valid.length > 0 ? valid.reduce((s, v) => s + v, 0) / valid.length : null;

    console.log("[WEATHER-DEBUG] สรุป:", {
      daysReturned: rows.length,
      tripDays,
      daysMissing: tripDays - rows.length,
      nullDays: nullCount,
      sum: valid.reduce((s, v) => s + v, 0),
      averageRainPct: avg === null ? null : fmt(avg, 2),
      averageFormula:
        valid.length > 0
          ? `(${valid.join(" + ")}) / ${valid.length}`
          : "ไม่มีค่าที่ใช้ได้ → ระบบจะ fallback weather_score = 1.0",
    });
  } catch (err: any) {
    console.log(
      "[WEATHER-DEBUG] ❌ fetch ล้มเหลว:",
      err?.name === "AbortError" ? "timeout 10 วินาที" : err?.message ?? err
    );
  } finally {
    clearTimeout(timer);
  }
}

/** ดูว่า rainByGrid ที่ระบบได้จริงมีอะไร และ gridKey ของ place hit/miss */
export function debugRainGrid(
  rainByGrid: Map<string, number>,
  places: Array<{ placeId: string; latitude: number | string; longitude: number | string }>,
  gridKey: (lat: number, lng: number) => string,
  sample = 3
): void {
  console.log("[WEATHER-DEBUG] ===== rainByGrid (ค่าที่ระบบได้จริง) =====");
  console.log("size:", rainByGrid.size, rainByGrid.size === 0 ? "→ ว่าง = fallback weather_score 1.0 ทุก place" : "");
  console.log("entries (สูงสุด 10):", [...rainByGrid.entries()].slice(0, 10));

  places.slice(0, sample).forEach((p) => {
    const key = gridKey(Number(p.latitude), Number(p.longitude));
    console.log("[WEATHER-DEBUG] place", p.placeId, {
      lat: Number(p.latitude),
      lng: Number(p.longitude),
      gridKey: key,
      hit: rainByGrid.has(key),
      rainPct: rainByGrid.get(key) ?? null,
    });
  });
}

/**
 * อธิบาย weather_score ทีละขั้น
 * @param budgetWeight weight ของ budget dimension ที่ใช้จริง (0 หรือ 0.15) ใช้คำนวณ weight ของ weather หลัง renormalize
 * @param actualScore  weatherScore ที่ระบบคำนวณจริง เอามาเทียบว่าตรงกันไหม
 */
export function explainWeatherScore(
  label: string,
  env: Env,
  rainPct: number | null,
  budgetWeight: number,
  actualScore: number
): void {
  const scale = (1 - budgetWeight) / REMAINING_BASE_SUM;
  const weatherWeight = BASE_WEATHER_WEIGHT * scale;

  let expected: number;
  const steps: Record<string, unknown> = { place: label, env };

  if (rainPct === null || !Number.isFinite(rainPct)) {
    expected = 1.0;
    steps["1) rainPct"] = "null → ไม่มีพยากรณ์ของ place นี้ → fallback weather_score = 1.0";
  } else {
    const rain = Math.min(1, Math.max(0, rainPct / 100));
    const exposure = RAIN_EXPOSURE[env] ?? RAIN_EXPOSURE.MIXED;
    const rainPart = exposure * (1 - rain);
    const dryPart = (1 - exposure) * 1;
    expected = rainPart + dryPart;

    steps["1) rainPct"] = rainPct;
    steps["2) rain = rainPct/100 (clamp 0-1)"] = fmt(rain);
    steps["3) exposure ของ env"] = `${env} → ${exposure}`;
    steps["4) ส่วนกลางแจ้ง = exposure × (1 − rain)"] = `${exposure} × ${fmt(1 - rain)} = ${fmt(rainPart)}`;
    steps["5) ส่วนในร่ม = (1 − exposure) × 1"] = `${fmt(1 - exposure)} × 1 = ${fmt(dryPart)}`;
  }

  steps["6) weather_score = (4)+(5)"] = fmt(expected);
  steps["7) weight ใน poiScore"] = `${BASE_WEATHER_WEIGHT} × (1−${budgetWeight})/${REMAINING_BASE_SUM} = ${fmt(weatherWeight)}`;
  steps["8) ส่วนที่เพิ่มให้ poiScore = score × weight"] = fmt(expected * weatherWeight);
  steps["ค่าที่ระบบคำนวณจริง"] = fmt(actualScore);
  steps["ผลเทียบ"] = Math.abs(expected - actualScore) < 1e-9 ? "✅ ตรงกัน" : "❌ ไม่ตรง — สูตรหรือ input ต่างกัน";

  console.log("[WEATHER-DEBUG] ===== คำนวณ weather_score =====");
  console.log(steps);
}