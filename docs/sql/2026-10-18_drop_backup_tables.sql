-- ============================================================================
-- ลบตาราง backup ที่สร้างตอนแก้ place_types (D-27) และตอนเปลี่ยน PK เป็น uuid (T23, D-28)
-- ผู้ใช้ยืนยันแล้ว 2026-10-18 ว่า T23 ทดสอบผ่านและให้ลบได้ · ลบแล้วกู้จาก backup เหล่านี้ไม่ได้อีก
-- ไม่แตะตารางจริงใดๆ — DROP เฉพาะชื่อที่ขึ้นต้นด้วย backup_20261019_ และ place_types_backup_20261018
-- ============================================================================
BEGIN;

DROP TABLE IF EXISTS public.place_types_backup_20261018;

DROP TABLE IF EXISTS public.backup_20261019_categories;
DROP TABLE IF EXISTS public.backup_20261019_place_categories;
DROP TABLE IF EXISTS public.backup_20261019_trip_categories;
DROP TABLE IF EXISTS public.backup_20261019_type_category_weights;
DROP TABLE IF EXISTS public.backup_20261019_trip_days;
DROP TABLE IF EXISTS public.backup_20261019_itineraries;
DROP TABLE IF EXISTS public.backup_20261019_poi_scores;
DROP TABLE IF EXISTS public.backup_20261019_place_types;
DROP TABLE IF EXISTS public.backup_20261019_admin_place_decisions;
DROP TABLE IF EXISTS public.backup_20261019_pipeline_jobs;
DROP TABLE IF EXISTS public.backup_20261019_pipeline_job_items;

COMMIT;

-- ตรวจผล (อ่านอย่างเดียว): ต้องไม่เหลือแถวเลย
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND (table_name LIKE 'backup\_20261019\_%' OR table_name = 'place_types_backup_20261018');
