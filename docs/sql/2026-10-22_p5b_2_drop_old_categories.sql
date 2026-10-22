-- ============================================================================
-- R5 P5b ชุดที่ 2 · ลบหมวดอังกฤษเดิม 15 หมวด (D-39 — ผู้ใช้สั่ง 2026-10-22)
-- รันใน Supabase SQL Editor ครั้งเดียว — ทั้งไฟล์อยู่ใน transaction เดียว ถ้าพังจะย้อนกลับเอง
-- ⚠️ รันหลังโค้ด P5c (backend อ่านหมวดจากป้าย ททท.) เท่านั้น
-- ⚠️ Auto Trip (ของเพื่อน — getAutoTripPlaces) ยังอ่าน place_categories อยู่: หลังรันไฟล์นี้ place_categories
--    ถูกลบตามหมวดเดิม (FK CASCADE) ทั้ง 486 แถว Auto Trip จะไม่มีสถานที่ให้จัดจนกว่าเพื่อนเปลี่ยน query
-- สิ่งที่ทำ:
--   1) ลบ trip_categories ที่อ้างหมวดเดิม (ตรวจ 2026-10-22: 24 แถว ใน 10 ทริป — ผู้ใช้เลือกลบ ไม่ย้าย)
--   2) ลบหมวดเดิม (parent_group IS NULL) → place_categories และ type_category_weights ที่อ้างอยู่ถูกลบตาม (CASCADE)
--   3) ตั้ง categories.parent_group เป็น NOT NULL
-- ============================================================================
BEGIN;

-- ---------------------------------------------------------------------------
-- 0) สำรองตารางที่จะถูกลบแถว (ลบได้เมื่อมั่นใจแล้ว) · categories สำรองไว้แล้วในชุดที่ 1 (backup_20261022_categories)
-- ---------------------------------------------------------------------------
CREATE TABLE public.backup_20261022_trip_categories       AS SELECT * FROM public.trip_categories;
CREATE TABLE public.backup_20261022_place_categories      AS SELECT * FROM public.place_categories;
CREATE TABLE public.backup_20261022_type_category_weights AS SELECT * FROM public.type_category_weights;
ALTER TABLE public.backup_20261022_trip_categories       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.backup_20261022_place_categories      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.backup_20261022_type_category_weights ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 1) trip_categories ที่อ้างหมวดเดิม (FK เป็น NO ACTION — ต้องลบก่อนลบหมวด)
--    ไม่แตะแถวที่ผู้ใช้เลือกหมวดใหม่ไปแล้ว
-- ---------------------------------------------------------------------------
DELETE FROM public.trip_categories
WHERE category_id IN (SELECT category_id FROM public.categories WHERE parent_group IS NULL);

-- ---------------------------------------------------------------------------
-- 2) หมวดเดิม 15 หมวด → place_categories / type_category_weights ถูกลบตาม (CASCADE)
-- ---------------------------------------------------------------------------
DELETE FROM public.categories WHERE parent_group IS NULL;

-- ---------------------------------------------------------------------------
-- 3) ทุกหมวดต้องมีกลุ่มใหญ่
-- ---------------------------------------------------------------------------
ALTER TABLE public.categories ALTER COLUMN parent_group SET NOT NULL;

-- ---------------------------------------------------------------------------
-- 4) ตรวจผลก่อน COMMIT — ถ้าไม่ตรง จะ error และย้อนกลับทั้งไฟล์
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  category_count int;
  label_count int;
BEGIN
  SELECT count(*) INTO category_count FROM public.categories;
  SELECT count(*) INTO label_count FROM public.category_labels;
  IF category_count <> 29 OR label_count <> 53 THEN
    RAISE EXCEPTION 'ตรวจไม่ผ่าน: หมวด % (ต้อง 29), ป้าย % (ต้อง 53)', category_count, label_count;
  END IF;
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- ตรวจหลังรัน (อ่านอย่างเดียว)
-- ---------------------------------------------------------------------------
-- SELECT (SELECT count(*) FROM public.categories) AS categories,
--        (SELECT count(*) FROM public.trip_categories) AS trip_categories,
--        (SELECT count(*) FROM public.place_categories) AS place_categories,
--        (SELECT count(*) FROM public.type_category_weights) AS type_category_weights;
