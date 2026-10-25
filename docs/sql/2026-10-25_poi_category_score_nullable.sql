-- ============================================================================
-- D-48 · category_score ว่างได้ (ผู้ใช้ไม่ได้เลือกหมวด = ตัด category ออกจากสูตร POI)
-- รันใน Supabase SQL Editor ครั้งเดียว — ทั้งไฟล์อยู่ใน transaction เดียว ถ้าพังจะย้อนกลับเอง
-- ⚠️ รันก่อนใช้โค้ด D-48 — ถ้ายังไม่รัน ทริปที่ไม่ได้เลือกหมวดจะคำนวณ POI แล้วบันทึกไม่สำเร็จ (NOT NULL)
-- สิ่งที่ทำ: ปลด NOT NULL และ default 0 ของ poi_scores.category_score (ข้อมูลเดิมไม่เปลี่ยน)
-- ============================================================================
BEGIN;

ALTER TABLE public.poi_scores
  ALTER COLUMN category_score DROP NOT NULL,
  ALTER COLUMN category_score DROP DEFAULT;

COMMIT;

-- ตรวจหลังรัน (is_nullable ต้องเป็น YES และ column_default ต้องว่าง)
-- SELECT is_nullable, column_default FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'poi_scores' AND column_name = 'category_score';
