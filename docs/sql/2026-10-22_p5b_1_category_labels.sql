-- ============================================================================
-- R5 P5b ชุดที่ 1 · หมวดจากป้าย ททท. (D-35, D-39, D-40) — เพิ่มอย่างเดียว ไม่ลบ/ไม่แก้ข้อมูลเดิม
-- รันใน Supabase SQL Editor ครั้งเดียว — ทั้งไฟล์อยู่ใน transaction เดียว ถ้าพังจะย้อนกลับเอง
-- สิ่งที่ทำ:
--   1) categories เพิ่มคอลัมน์ parent_group (กลุ่มใหญ่ของ ททท. 3 กลุ่ม — หมวดเดิม 15 หมวดเป็น NULL)
--   2) เพิ่มหมวดใหม่ 29 หมวด (default_duration_min ใช้ค่า default 60 — Auto Trip ยังอ่านอยู่จนกว่า P5g)
--   3) ตารางใหม่ category_labels: ป้าย ททท. → หมวด (53 ป้าย, 1 ป้าย = 1 หมวด)
--   4) FK places.att_type_label → category_labels.att_type_label (ให้ query embed หมวดจากป้ายได้)
-- หลังรัน: โค้ดเดิมยังทำงานเหมือนเดิม (ยังอ่าน place_categories) · หมวดใหม่จะโผล่ใน GET /api/categories
--          (หน้าสร้างทริปจะเห็น 44 หมวดชั่วคราวจนกว่า P5c/P5d และ SQL ชุดที่ 2 ลบหมวดเดิม)
-- ไฟล์นี้สร้างจากตาราง D-39 ด้วยสคริปต์ที่ตรวจแล้วว่าป้ายตรงกับ backend/data/attraction.csv ครบ 53 ป้าย
-- ============================================================================
BEGIN;

-- ---------------------------------------------------------------------------
-- 0) สำรอง categories (ชุดนี้แก้โครงสร้างแค่ตารางนี้ — ลบได้เมื่อมั่นใจแล้ว)
-- ---------------------------------------------------------------------------
CREATE TABLE public.backup_20261022_categories AS SELECT * FROM public.categories;
ALTER TABLE public.backup_20261022_categories ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 1) กลุ่มใหญ่ของหมวด · ค่า: HISTORY_CULTURE = แหล่งท่องเที่ยวทางประวัติศาสตร์ และวัฒนธรรม
--    NATURE = แหล่งท่องเที่ยวทางธรรมชาติ · RECREATION = แหล่งท่องเที่ยวสำหรับกิจกรรมพิเศษ นันทนาการ และความสนใจพิเศษ
--    ยังเป็น NULL ได้เพราะหมวดเดิม — SQL ชุดที่ 2 จะตั้ง NOT NULL หลังลบหมวดเดิม
-- ---------------------------------------------------------------------------
ALTER TABLE public.categories ADD COLUMN parent_group text;
ALTER TABLE public.categories ADD CONSTRAINT categories_parent_group_check
  CHECK (parent_group IN ('HISTORY_CULTURE', 'NATURE', 'RECREATION'));

-- ---------------------------------------------------------------------------
-- 2) หมวดใหม่ 29 หมวด (D-39)
-- ---------------------------------------------------------------------------
INSERT INTO public.categories (category_name, parent_group, environment_type, price_nature) VALUES
  ('วัดและศาสนสถาน', 'HISTORY_CULTURE', 'MIXED', 'free'),
  ('โบราณสถานและสถานที่ทางประวัติศาสตร์', 'HISTORY_CULTURE', 'MIXED', 'free'),
  ('พิพิธภัณฑ์', 'HISTORY_CULTURE', 'INDOOR', 'paid'),
  ('ศูนย์วัฒนธรรมและประวัติศาสตร์', 'HISTORY_CULTURE', 'MIXED', 'free'),
  ('วิถีชีวิตชุมชน', 'HISTORY_CULTURE', 'OUTDOOR', 'free'),
  ('ศูนย์เรียนรู้และหัตถกรรม', 'HISTORY_CULTURE', 'MIXED', 'free'),
  ('ตลาดน้ำและตลาดโบราณ', 'HISTORY_CULTURE', 'OUTDOOR', 'free'),
  ('จุดชมวิว', 'NATURE', 'OUTDOOR', 'free'),
  ('น้ำตก', 'NATURE', 'OUTDOOR', 'free'),
  ('ถ้ำ', 'NATURE', 'OUTDOOR', 'free'),
  ('ภูเขาและธรณีวิทยา', 'NATURE', 'OUTDOOR', 'free'),
  ('ทะเลและหมู่เกาะ', 'NATURE', 'OUTDOOR', 'free'),
  ('อุทยานแห่งชาติและวนอุทยาน', 'NATURE', 'OUTDOOR', 'paid'),
  ('เขตรักษาพันธุ์สัตว์ป่า', 'NATURE', 'OUTDOOR', 'free'),
  ('สวนพฤกษศาสตร์และศูนย์ศึกษาธรรมชาติ', 'NATURE', 'OUTDOOR', 'free'),
  ('ทุ่งดอกไม้', 'NATURE', 'OUTDOOR', 'free'),
  ('แม่น้ำ ทะเลสาบ และเขื่อน', 'NATURE', 'OUTDOOR', 'free'),
  ('ป่าชายเลนและพื้นที่ชุ่มน้ำ', 'NATURE', 'OUTDOOR', 'free'),
  ('น้ำพุร้อน', 'NATURE', 'OUTDOOR', 'free'),
  ('เกษตรและโครงการหลวง', 'RECREATION', 'OUTDOOR', 'free'),
  ('แหล่งช้อปปิ้งและตลาด', 'RECREATION', 'MIXED', 'paid'),
  ('สวนสาธารณะ', 'RECREATION', 'OUTDOOR', 'free'),
  ('กีฬาและกิจกรรมผจญภัย', 'RECREATION', 'OUTDOOR', 'paid'),
  ('สวนสัตว์', 'RECREATION', 'OUTDOOR', 'paid'),
  ('สวนสนุกและธีมปาร์ค', 'RECREATION', 'MIXED', 'paid'),
  ('สุขภาพและความงาม', 'RECREATION', 'INDOOR', 'paid'),
  ('การแสดงและโรงละคร', 'RECREATION', 'INDOOR', 'paid'),
  ('ศูนย์ประชุม', 'RECREATION', 'INDOOR', 'paid'),
  ('จุดผ่านแดน', 'RECREATION', 'OUTDOOR', 'paid');

-- ---------------------------------------------------------------------------
-- 3) ป้าย ททท. → หมวด · att_type_label UNIQUE = 1 ป้ายอยู่ได้ 1 หมวด
--    ON DELETE RESTRICT: ลบหมวดที่ยังมีป้ายอ้างอยู่ไม่ได้ (ต้องย้ายป้ายก่อน)
-- ---------------------------------------------------------------------------
CREATE TABLE public.category_labels (
  category_label_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  att_type_label    text NOT NULL UNIQUE,
  category_id       uuid NOT NULL REFERENCES public.categories (category_id) ON DELETE RESTRICT,
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now()
);
CREATE INDEX idx_category_labels_category_id ON public.category_labels (category_id);
-- backend ใช้ service role (ข้าม RLS) · เปิด RLS กันการเข้าถึงด้วย anon key จาก browser
ALTER TABLE public.category_labels ENABLE ROW LEVEL SECURITY;

INSERT INTO public.category_labels (att_type_label, category_id)
SELECT v.att_type_label, c.category_id
FROM (VALUES
  ('ศาสนสถาน (วัด/โบสถ์/มัสยิด ฯลฯ)', 'วัดและศาสนสถาน'),
  ('สถานปฏิบัติธรรม', 'วัดและศาสนสถาน'),
  ('ชุมชนโบราณ/โบราณสถาน/โบราณวัตถุ', 'โบราณสถานและสถานที่ทางประวัติศาสตร์'),
  ('อุทยานประวัติศาสตร์', 'โบราณสถานและสถานที่ทางประวัติศาสตร์'),
  ('กำแพงเมือง/คูเมือง', 'โบราณสถานและสถานที่ทางประวัติศาสตร์'),
  ('อนุสาวรีย์/อนุสรณ์สถาน', 'โบราณสถานและสถานที่ทางประวัติศาสตร์'),
  ('พระตำหนัก/วัง/พระราชวัง', 'โบราณสถานและสถานที่ทางประวัติศาสตร์'),
  ('ประวัติความเป็นมา', 'โบราณสถานและสถานที่ทางประวัติศาสตร์'),
  ('พิพิธภัณฑ์', 'พิพิธภัณฑ์'),
  ('เหมือง/ประวัติศาสตร์การทำเหมือง', 'พิพิธภัณฑ์'),
  ('ศูนย์วัฒนธรรม', 'ศูนย์วัฒนธรรมและประวัติศาสตร์'),
  ('ศูนย์ศึกษาประวัติศาสตร์', 'ศูนย์วัฒนธรรมและประวัติศาสตร์'),
  ('วิถีชีวิตความเป็นอยู่ (ชุมชน)', 'วิถีชีวิตชุมชน'),
  ('หมู่บ้าน', 'วิถีชีวิตชุมชน'),
  ('งานประเพณี', 'วิถีชีวิตชุมชน'),
  ('ศูนย์การเรียนรู้ฯ (เกี่ยวกับกิจกรรม ผลิตภัณฑ์ และภูมิปัญญาในท้องถิ่น)', 'ศูนย์เรียนรู้และหัตถกรรม'),
  ('ศูนย์หัตถกรรม', 'ศูนย์เรียนรู้และหัตถกรรม'),
  ('ตลาดน้ำ/ตลาดโบราณ', 'ตลาดน้ำและตลาดโบราณ'),
  ('จุดชมวิว', 'จุดชมวิว'),
  ('น้ำตก', 'น้ำตก'),
  ('ถ้ำ', 'ถ้ำ'),
  ('ภูเขา/ธรณีสัณฐานเฉพาะ', 'ภูเขาและธรณีวิทยา'),
  ('ซากฟอสซิล', 'ภูเขาและธรณีวิทยา'),
  ('อ่าว/หาดทราย/ชายทะเล', 'ทะเลและหมู่เกาะ'),
  ('หมู่เกาะ', 'ทะเลและหมู่เกาะ'),
  ('แหล่งปะการังน้ำลึก/น้ำตื้น', 'ทะเลและหมู่เกาะ'),
  ('อุทยานแห่งชาติ', 'อุทยานแห่งชาติและวนอุทยาน'),
  ('วนอุทยาน', 'อุทยานแห่งชาติและวนอุทยาน'),
  ('เขตรักษาพันธุ์สัตว์ป่า', 'เขตรักษาพันธุ์สัตว์ป่า'),
  ('เขตห้ามล่าสัตว์ป่า', 'เขตรักษาพันธุ์สัตว์ป่า'),
  ('สวนพฤกษศาสตร์', 'สวนพฤกษศาสตร์และศูนย์ศึกษาธรรมชาติ'),
  ('สวนรุกชาติ', 'สวนพฤกษศาสตร์และศูนย์ศึกษาธรรมชาติ'),
  ('ศูนย์ศึกษาธรรมชาติ/พิพิธภัณธ์ธรรมชาติ (พืชพันธุ์)', 'สวนพฤกษศาสตร์และศูนย์ศึกษาธรรมชาติ'),
  ('ทุ่งดอกไม้และพืชพันธุ์', 'ทุ่งดอกไม้'),
  ('แม่น้ำ/ลำคลอง/แก่ง', 'แม่น้ำ ทะเลสาบ และเขื่อน'),
  ('เขื่อน/อ่างเก็บน้ำ', 'แม่น้ำ ทะเลสาบ และเขื่อน'),
  ('ทะเลสาบ/หนอง/บึง', 'แม่น้ำ ทะเลสาบ และเขื่อน'),
  ('พรุ/ป่าชายเลน/พื้นที่ชุ่มน้ำ', 'ป่าชายเลนและพื้นที่ชุ่มน้ำ'),
  ('น้ำพุร้อน/บ่อน้ำร้อน/ธารน้ำ', 'น้ำพุร้อน'),
  ('ไร่/สวนเกษตร (ฟาร์มสัตว์/ประมง)', 'เกษตรและโครงการหลวง'),
  ('ศูนย์วิจัย (เกษตร)/สถานีทดลอง (เกษตร)', 'เกษตรและโครงการหลวง'),
  ('โครงการหลวง/โครงการพระราชดำริ', 'เกษตรและโครงการหลวง'),
  ('ห้างสรรพสินค้า/แหล่งช้อปปิ้ง/ตลาดสด/ตลาดนัด/ถนนคนเดิน', 'แหล่งช้อปปิ้งและตลาด'),
  ('สวนสาธารณะ/สวนหย่อม', 'สวนสาธารณะ'),
  ('ศูนย์กีฬา/สนามกีฬาสถานที่ทางการกีฬาทางบก/ทางน้ำ/ทางอากาศ', 'กีฬาและกิจกรรมผจญภัย'),
  ('สวนสัตว์/ศูนย์ฝึกสัตว์/พิพิธภัณฑ์สัตว์', 'สวนสัตว์'),
  ('สวนสนุก/สวนน้ำ', 'สวนสนุกและธีมปาร์ค'),
  ('ธีมปาร์ค (Theme Park)', 'สวนสนุกและธีมปาร์ค'),
  ('สุขภาพและความงาม', 'สุขภาพและความงาม'),
  ('โรงละคร/โรงมหรสพ (โชว์)', 'การแสดงและโรงละคร'),
  ('โรงภาพยนต์โบราณ (โรงหนังเก่า)', 'การแสดงและโรงละคร'),
  ('ศูนย์ประชุมฯ', 'ศูนย์ประชุม'),
  ('จุดผ่านแดน/ชายแดน', 'จุดผ่านแดน')
) AS v (att_type_label, category_name)
JOIN public.categories c ON c.category_name = v.category_name;

-- ---------------------------------------------------------------------------
-- 4) places.att_type_label → category_labels · ถ้ามีสถานที่ที่ป้ายไม่อยู่ใน 53 ป้าย คำสั่งนี้จะ error
--    แล้วทั้งไฟล์ย้อนกลับ (ตรวจแล้ว 2026-10-22: ป้ายใน places 47 แบบ อยู่ใน 53 ป้ายทั้งหมด)
--    att_type_label ที่เป็น NULL ผ่าน FK ได้ (สถานที่นั้นจะไม่มีหมวด)
-- ---------------------------------------------------------------------------
ALTER TABLE public.places ADD CONSTRAINT places_att_type_label_fkey
  FOREIGN KEY (att_type_label) REFERENCES public.category_labels (att_type_label)
  ON UPDATE CASCADE ON DELETE RESTRICT;
CREATE INDEX idx_places_att_type_label ON public.places (att_type_label);

-- ---------------------------------------------------------------------------
-- 5) ตรวจผลก่อน COMMIT — ถ้าจำนวนไม่ตรง จะ error และย้อนกลับทั้งไฟล์
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  new_categories int;
  labels int;
  unmapped_places int;
BEGIN
  SELECT count(*) INTO new_categories FROM public.categories WHERE parent_group IS NOT NULL;
  SELECT count(*) INTO labels FROM public.category_labels;
  SELECT count(*) INTO unmapped_places FROM public.places p
    LEFT JOIN public.category_labels l ON l.att_type_label = p.att_type_label
    WHERE l.category_label_id IS NULL;
  IF new_categories <> 29 OR labels <> 53 OR unmapped_places <> 0 THEN
    RAISE EXCEPTION 'ตรวจไม่ผ่าน: หมวดใหม่ % (ต้อง 29), ป้าย % (ต้อง 53), สถานที่ไม่มีหมวด % (ต้อง 0)',
      new_categories, labels, unmapped_places;
  END IF;
END $$;

COMMIT;

-- ให้ Supabase API (PostgREST) รู้จักตารางและ FK ใหม่ทันที
NOTIFY pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- ตรวจหลังรัน (อ่านอย่างเดียว) — จำนวนสถานที่ต่อหมวดใหม่ แยกตามจังหวัด
-- ---------------------------------------------------------------------------
-- SELECT c.parent_group, c.category_name, p.province, count(*)
-- FROM public.places p
-- JOIN public.category_labels l ON l.att_type_label = p.att_type_label
-- JOIN public.categories c ON c.category_id = l.category_id
-- GROUP BY 1, 2, 3 ORDER BY 1, 2, 3;
