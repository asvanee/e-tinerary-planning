-- ============================================================================
-- D-51 · ลบทริปทดสอบทั้งหมด ก่อนเปลี่ยน daily_budget เป็นงบต่อคนต่อวัน
-- รันใน Supabase SQL Editor ครั้งเดียว — ทั้งไฟล์อยู่ใน transaction เดียว ถ้าพังจะย้อนกลับเอง
-- ผู้ใช้เลือก 2026-10-26: ลบทริปทดสอบทิ้ง (ไม่แปลงค่า daily_budget เดิม) ไม่ต้องสำรอง
-- ตรวจก่อนรัน (อ่านอย่างเดียว 2026-10-26): trips 9 (น่านทั้งหมด, ใช้งบ 2) · trip_days 19 · itineraries 21
--   · poi_scores 165 · trip_categories 27
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
