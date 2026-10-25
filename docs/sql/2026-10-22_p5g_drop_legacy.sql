-- ============================================================================
-- R5 P5g · ล้างของเก่าหลังเปลี่ยนเป็นหมวดจากป้าย ททท. (D-35, D-36, D-38)
-- รันใน Supabase SQL Editor ครั้งเดียว — ทั้งไฟล์อยู่ใน transaction เดียว ถ้าพังจะย้อนกลับเอง
-- ⚠️ รันหลัง commit โค้ด P5g (การนำเข้าเลิกเขียน place_types) และรีสตาร์ท backend แล้วเท่านั้น
-- ⚠️ Auto Trip (ของกิ่ง — getAutoTripPlaces / autoTripBuilder / buildAutoTripController) ยังอ่าน
--    place_categories และ default_duration_min: หลังรันไฟล์นี้ Auto Trip จะตอบ error 500 จนกว่ากิ่งแก้
--    ตาม P5-Auto-Trip-brief (ผู้ใช้แจ้งกิ่งแล้ว 2026-10-22 · เลือกไม่แตะโค้ด Auto Trip ตาม D-38)
-- สิ่งที่ทำ:
--   1) สำรอง place_types (ตารางเดียวที่ยังมีข้อมูล)
--   2) ลบคอลัมน์ categories.default_duration_min (เวลาที่อยู่ผู้ใช้กรอกเอง — itineraries.visit_duration_min)
--   3) ลบตาราง place_categories (ว่าง), type_category_weights (ว่าง), place_types
-- ไม่ลบ: ตาราง backup_20261022_* (ผู้ใช้เลือกเก็บไว้ก่อน)
-- ============================================================================
BEGIN;

-- ---------------------------------------------------------------------------
-- 1) สำรอง place_types (ลบได้เมื่อมั่นใจแล้ว) · อีก 2 ตารางว่างอยู่แล้ว และมี backup_20261022_* ของข้อมูลเดิม
-- ---------------------------------------------------------------------------
CREATE TABLE public.backup_20261022_place_types AS SELECT * FROM public.place_types;
ALTER TABLE public.backup_20261022_place_types ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 2) categories.default_duration_min
-- ---------------------------------------------------------------------------
ALTER TABLE public.categories DROP COLUMN default_duration_min;

-- ---------------------------------------------------------------------------
-- 3) ตารางที่ไม่ใช้แล้ว · ไม่ใช้ CASCADE — ถ้ามีอะไรอ้างอยู่ (เช่น view) ให้ error แล้วย้อนกลับ
-- ---------------------------------------------------------------------------
DROP TABLE public.place_categories;
DROP TABLE public.type_category_weights;
DROP TABLE public.place_types;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- ตรวจหลังรัน (อ่านอย่างเดียว) — ต้องไม่เหลือ 3 ตารางนี้ และ categories ไม่มี default_duration_min
-- ---------------------------------------------------------------------------
-- SELECT table_name FROM information_schema.tables
-- WHERE table_schema = 'public' AND table_name IN ('place_categories', 'type_category_weights', 'place_types');
-- SELECT column_name FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'categories' ORDER BY ordinal_position;
