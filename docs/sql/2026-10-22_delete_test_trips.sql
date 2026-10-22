-- ============================================================================
-- R5 · ลบทริปทดสอบทั้งหมด ก่อนลบ places ของ เชียงใหม่/ชลบุรี/กรุงเทพฯ แล้วนำเข้าใหม่ (D-26)
-- รันใน Supabase SQL Editor ครั้งเดียว — ทั้งไฟล์อยู่ใน transaction เดียว ถ้าพังจะย้อนกลับเอง
-- ผู้ใช้ยืนยัน 2026-10-22: ทริปทั้งหมดเป็นข้อมูลทดสอบ ลบได้ ไม่ต้องสำรอง
-- ตรวจก่อนรัน (อ่านอย่างเดียว 2026-10-22): trips 15 (เชียงใหม่ 14, น่าน 1) · trip_days 29 · itineraries 27
--   · poi_scores 749 · trip_categories 6
-- ลบ trips อย่างเดียว ที่เหลือถูกลบตาม FK CASCADE: trip_days → itineraries, poi_scores, trip_categories
-- ไม่แตะ: users, places, categories, ตาราง admin/pipeline
-- ============================================================================
BEGIN;

DELETE FROM public.trips;

COMMIT;

-- ---------------------------------------------------------------------------
-- ตรวจหลังรัน (อ่านอย่างเดียว) — ต้องเป็น 0 ทุกช่อง
-- ---------------------------------------------------------------------------
SELECT
  (SELECT count(*) FROM public.trips)           AS trips,
  (SELECT count(*) FROM public.trip_days)       AS trip_days,
  (SELECT count(*) FROM public.itineraries)     AS itineraries,
  (SELECT count(*) FROM public.poi_scores)      AS poi_scores,
  (SELECT count(*) FROM public.trip_categories) AS trip_categories;
