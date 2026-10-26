-- ============================================================================
-- D-52 · ช่วงราคาต่อคนจาก Google Places API (New) priceRange + เติมราคาของน่าน
-- รันใน Supabase SQL Editor ครั้งเดียว — ทั้งไฟล์อยู่ใน transaction เดียว ถ้าพังจะย้อนกลับเอง
-- ⚠️ รันก่อนใช้โค้ด D-52 — query ของ POI / itinerary / places จะ select คอลัมน์ใหม่
-- สิ่งที่ทำ:
--   1. เพิ่ม places.price_range_start / price_range_end (บาท, ว่างได้) — เก็บเฉพาะราคาสกุล THB
--      end ว่าง = Google ให้ช่วงแบบ "มากกว่า X" (ไม่มีขอบบน)
--   2. เติมราคาน่านจากผลเรียก Places API (New) 2026-10-26 (nan-price-range-probe.csv):
--      114 แห่ง · ตอบสำเร็จ 107 · มี priceRange 6 แห่ง (ทุกแห่ง PRICE_LEVEL_INEXPENSIVE, ฿1–200)
--      อีก 7 แห่งมี google_place_id แบบ "csv:..." (ไม่มีใน Google)
--   จับคู่ด้วย place_name + province (ตรวจแล้ว: ชื่อทั้ง 6 ตรงกับ places แห่งละ 1 แถว)
--   ไม่แตะ price_level — โค้ดของเราเลิกใช้แล้ว (D-52) เก็บคอลัมน์ไว้จนกว่า Auto Trip จะย้ายมาใช้ priceRange
-- ============================================================================
BEGIN;

ALTER TABLE public.places
  ADD COLUMN price_range_start numeric CHECK (price_range_start >= 0),
  ADD COLUMN price_range_end   numeric CHECK (price_range_end >= 0);

UPDATE public.places
SET price_range_start = 1, price_range_end = 200
WHERE province = 'น่าน'
  AND place_name IN (
    'โกโก้วัลเลย์ คาเฟ่',
    'ไร่ปางวัว -Pangwua farm Cafe’',
    'โรงบ่มปัว คาเฟ่ แอนด์ อีทเทอรี่',
    'โรงบ่มริมน้ำน่าน',
    'ฟาร์มแกะแดนพนา อำเภอปัว',
    'ร้านกาแฟบ้านสบขุ่น'
  );

COMMIT;

-- ---------------------------------------------------------------------------
-- ตรวจหลังรัน (อ่านอย่างเดียว) — ต้องได้ 6 แถว ทุกแถว ฿1–200
-- ---------------------------------------------------------------------------
SELECT place_name, price_range_start, price_range_end
FROM public.places
WHERE price_range_start IS NOT NULL OR price_range_end IS NOT NULL
ORDER BY place_name;
