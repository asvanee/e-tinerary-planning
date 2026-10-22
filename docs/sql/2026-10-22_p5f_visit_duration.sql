-- ============================================================================
-- R5 P5f · เวลาที่ผู้ใช้กรอกต่อสถานที่ในแผน (D-36)
-- รันใน Supabase SQL Editor ครั้งเดียว — เพิ่มคอลัมน์อย่างเดียว ไม่แก้ข้อมูลเดิม
-- แผนที่บันทึกไว้ก่อนหน้านี้จะเป็น NULL (ตอนแก้แผนผู้ใช้ต้องกรอกใหม่)
-- backend (confirmItinerary) บังคับกรอกครบทุกแถวก่อนบันทึก · CHECK กันค่าผิดช่วงที่ระดับ DB อีกชั้น
-- ============================================================================
BEGIN;

ALTER TABLE public.itineraries ADD COLUMN visit_duration_min int;
ALTER TABLE public.itineraries ADD CONSTRAINT itineraries_visit_duration_min_check
  CHECK (visit_duration_min BETWEEN 1 AND 1440);

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ตรวจหลังรัน (อ่านอย่างเดียว)
-- SELECT count(*) AS rows, count(visit_duration_min) AS with_duration FROM public.itineraries;
