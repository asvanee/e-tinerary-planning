import { clampToForecastWindow, forecastLastDay } from "../weatherForecast";

describe("forecastLastDay", () => {
  test("นับ 15 วันจากวันที่ UTC", () => {
    // 2026-11-13 14:00 เวลาไทย = 07:00 UTC วันเดียวกัน
    expect(forecastLastDay(Date.parse("2026-11-13T07:00:00Z"))).toBe("2026-11-28");
  });

  test("ตี 2 เวลาไทย วันที่ UTC ยังเป็นเมื่อวาน → วันสุดท้ายไม่เลื่อนตามเวลาไทย", () => {
    // 2026-11-14 02:00 เวลาไทย = 2026-11-13 19:00 UTC
    expect(forecastLastDay(Date.parse("2026-11-13T19:00:00Z"))).toBe("2026-11-28");
  });
});

describe("clampToForecastWindow", () => {
  const today = "2026-11-14";
  const windowEnd = "2026-11-28";

  test("ทริปเกินวันสุดท้าย → ตัดเหลือถึงวันสุดท้ายที่ API ยอม", () => {
    expect(clampToForecastWindow("2026-11-20", "2026-12-05", today, windowEnd)).toEqual({
      start: "2026-11-20",
      end: "2026-11-28",
    });
  });

  test("ทริปเริ่มก่อนวันนี้ → เริ่มที่วันนี้", () => {
    expect(clampToForecastWindow("2026-11-10", "2026-11-16", today, windowEnd)).toEqual({
      start: "2026-11-14",
      end: "2026-11-16",
    });
  });

  test("ทริปอยู่หลังวันสุดท้ายทั้งหมด → null", () => {
    expect(clampToForecastWindow("2026-11-29", "2026-12-02", today, windowEnd)).toBeNull();
  });

  test("วันที่ผิดรูปแบบ → null", () => {
    expect(clampToForecastWindow("14/11/2026", "2026-11-16", today, windowEnd)).toBeNull();
  });
});
