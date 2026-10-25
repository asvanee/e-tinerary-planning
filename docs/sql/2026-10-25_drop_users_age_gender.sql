-- ============================================================================
-- D-47 · เลิกเก็บอายุและเพศของผู้ใช้
-- รันใน Supabase SQL Editor ครั้งเดียว — ทั้งไฟล์อยู่ใน transaction เดียว ถ้าพังจะย้อนกลับเอง
-- ⚠️ รันหลังโค้ด D-47 (register เลิกส่ง/insert age, gender) และรีสตาร์ท backend แล้วเท่านั้น
--    ถ้ารันก่อน การสมัครสมาชิกจะพังเพราะโค้ดเดิมยัง insert สองคอลัมน์นี้
-- สิ่งที่ทำ: ลบคอลัมน์ users.age และ users.gender (CHECK ของ gender หายไปพร้อมคอลัมน์)
-- ไม่สำรองข้อมูล (ผู้ใช้เลือก 2026-10-25 — มีแต่บัญชีทดสอบ)
-- ============================================================================
BEGIN;

ALTER TABLE public.users
  DROP COLUMN IF EXISTS age,
  DROP COLUMN IF EXISTS gender;

COMMIT;

-- ตรวจหลังรัน (ต้องได้ 0 แถว)
-- SELECT column_name FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'users' AND column_name IN ('age', 'gender');
