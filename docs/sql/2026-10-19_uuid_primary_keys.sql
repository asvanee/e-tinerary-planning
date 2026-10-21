-- ============================================================================
-- T23 · เปลี่ยน primary key ที่เป็น int/bigint ให้เป็น uuid ทั้งหมด (D-28)
-- ⚠️ ห้ามรันจนกว่าโค้ด backend/frontend จะแก้ type ของ id เสร็จ (ดู DEVELOPMENT_PLAN T23)
--    ถ้ารันก่อน: การเลือก "การตัดสินใจล่าสุด" ของหน้า admin จะผิด (เทียบ uuid แทนลำดับเลข)
-- รันใน Supabase SQL Editor ครั้งเดียว — ทั้งไฟล์อยู่ใน transaction เดียว ถ้าพังจะย้อนกลับเอง
-- ตาราง users / trips / places เป็น uuid อยู่แล้ว ไม่แตะ
-- UNIQUE แบบหลายคอลัมน์ที่โค้ดใช้อยู่ (เช่น poi_scores (trip_id, place_id) ที่ upsert ใช้) สร้างกลับเหมือนเดิม
-- ============================================================================
BEGIN;

-- ---------------------------------------------------------------------------
-- 0) สำรองทุกตารางที่แก้ (ลบได้เมื่อมั่นใจแล้ว)
-- ---------------------------------------------------------------------------
CREATE TABLE public.backup_20261019_categories            AS SELECT * FROM public.categories;
CREATE TABLE public.backup_20261019_place_categories      AS SELECT * FROM public.place_categories;
CREATE TABLE public.backup_20261019_trip_categories       AS SELECT * FROM public.trip_categories;
CREATE TABLE public.backup_20261019_type_category_weights AS SELECT * FROM public.type_category_weights;
CREATE TABLE public.backup_20261019_trip_days             AS SELECT * FROM public.trip_days;
CREATE TABLE public.backup_20261019_itineraries           AS SELECT * FROM public.itineraries;
CREATE TABLE public.backup_20261019_poi_scores            AS SELECT * FROM public.poi_scores;
CREATE TABLE public.backup_20261019_place_types           AS SELECT * FROM public.place_types;
CREATE TABLE public.backup_20261019_admin_place_decisions AS SELECT * FROM public.admin_place_decisions;
CREATE TABLE public.backup_20261019_pipeline_jobs         AS SELECT * FROM public.pipeline_jobs;
CREATE TABLE public.backup_20261019_pipeline_job_items    AS SELECT * FROM public.pipeline_job_items;
ALTER TABLE public.backup_20261019_categories            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.backup_20261019_place_categories      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.backup_20261019_trip_categories       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.backup_20261019_type_category_weights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.backup_20261019_trip_days             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.backup_20261019_itineraries           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.backup_20261019_poi_scores            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.backup_20261019_place_types           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.backup_20261019_admin_place_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.backup_20261019_pipeline_jobs         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.backup_20261019_pipeline_job_items    ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 1) categories.category_id (int) → uuid · ถูกอ้างโดย place_categories, trip_categories, type_category_weights
--    สร้าง uuid ใหม่ให้แม่ แล้วเติมให้ลูกด้วยการ join ก่อนลบคอลัมน์เดิม
-- ---------------------------------------------------------------------------
ALTER TABLE public.categories            ADD COLUMN category_uuid uuid NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE public.place_categories      ADD COLUMN category_uuid uuid;
ALTER TABLE public.trip_categories       ADD COLUMN category_uuid uuid;
ALTER TABLE public.type_category_weights ADD COLUMN category_uuid uuid;

UPDATE public.place_categories t      SET category_uuid = c.category_uuid FROM public.categories c WHERE c.category_id = t.category_id;
UPDATE public.trip_categories t       SET category_uuid = c.category_uuid FROM public.categories c WHERE c.category_id = t.category_id;
UPDATE public.type_category_weights t SET category_uuid = c.category_uuid FROM public.categories c WHERE c.category_id = t.category_id;

ALTER TABLE public.place_categories      DROP CONSTRAINT place_categories_category_id_fkey;
ALTER TABLE public.place_categories      DROP CONSTRAINT place_categories_place_id_category_id_key;
ALTER TABLE public.trip_categories       DROP CONSTRAINT trip_categories_category_id_fkey;
ALTER TABLE public.type_category_weights DROP CONSTRAINT type_category_weights_category_id_fkey;
ALTER TABLE public.type_category_weights DROP CONSTRAINT type_category_weights_api_type_id_category_id_key;

ALTER TABLE public.categories DROP COLUMN category_id;               -- ลบ categories_pkey ไปด้วย
ALTER TABLE public.categories RENAME COLUMN category_uuid TO category_id;
ALTER TABLE public.categories ADD PRIMARY KEY (category_id);

ALTER TABLE public.place_categories DROP COLUMN category_id;
ALTER TABLE public.place_categories RENAME COLUMN category_uuid TO category_id;
ALTER TABLE public.place_categories ALTER COLUMN category_id SET NOT NULL;
ALTER TABLE public.place_categories ADD CONSTRAINT place_categories_category_id_fkey
  FOREIGN KEY (category_id) REFERENCES public.categories(category_id) ON DELETE CASCADE;
ALTER TABLE public.place_categories ADD CONSTRAINT place_categories_place_id_category_id_key UNIQUE (place_id, category_id);

ALTER TABLE public.trip_categories DROP COLUMN category_id;
ALTER TABLE public.trip_categories RENAME COLUMN category_uuid TO category_id;   -- เดิม nullable คงไว้
ALTER TABLE public.trip_categories ADD CONSTRAINT trip_categories_category_id_fkey
  FOREIGN KEY (category_id) REFERENCES public.categories(category_id);            -- เดิมไม่มี ON DELETE

ALTER TABLE public.type_category_weights DROP COLUMN category_id;
ALTER TABLE public.type_category_weights RENAME COLUMN category_uuid TO category_id;
ALTER TABLE public.type_category_weights ALTER COLUMN category_id SET NOT NULL;
ALTER TABLE public.type_category_weights ADD CONSTRAINT type_category_weights_category_id_fkey
  FOREIGN KEY (category_id) REFERENCES public.categories(category_id) ON DELETE CASCADE;
ALTER TABLE public.type_category_weights ADD CONSTRAINT type_category_weights_api_type_id_category_id_key UNIQUE (api_type_id, category_id);

-- ---------------------------------------------------------------------------
-- 2) trip_days.trip_day_id (int) → uuid · ถูกอ้างโดย itineraries.trip_day_id
-- ---------------------------------------------------------------------------
ALTER TABLE public.trip_days   ADD COLUMN trip_day_uuid uuid NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE public.itineraries ADD COLUMN trip_day_uuid uuid;
UPDATE public.itineraries t SET trip_day_uuid = d.trip_day_uuid FROM public.trip_days d WHERE d.trip_day_id = t.trip_day_id;

ALTER TABLE public.itineraries DROP CONSTRAINT itineraries_trip_day_id_fkey;
ALTER TABLE public.itineraries DROP CONSTRAINT itineraries_trip_day_id_visit_order_key;

ALTER TABLE public.trip_days DROP COLUMN trip_day_id;                 -- ลบ trip_days_pkey ไปด้วย
ALTER TABLE public.trip_days RENAME COLUMN trip_day_uuid TO trip_day_id;
ALTER TABLE public.trip_days ADD PRIMARY KEY (trip_day_id);

ALTER TABLE public.itineraries DROP COLUMN trip_day_id;
ALTER TABLE public.itineraries RENAME COLUMN trip_day_uuid TO trip_day_id;
ALTER TABLE public.itineraries ALTER COLUMN trip_day_id SET NOT NULL;
ALTER TABLE public.itineraries ADD CONSTRAINT itineraries_trip_day_id_fkey
  FOREIGN KEY (trip_day_id) REFERENCES public.trip_days(trip_day_id) ON DELETE CASCADE;
ALTER TABLE public.itineraries ADD CONSTRAINT itineraries_trip_day_id_visit_order_key UNIQUE (trip_day_id, visit_order);

-- ---------------------------------------------------------------------------
-- 3) pipeline_jobs.job_id (bigint) → uuid · ถูกอ้างโดย pipeline_job_items.job_id
-- ---------------------------------------------------------------------------
ALTER TABLE public.pipeline_jobs      ADD COLUMN job_uuid uuid NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE public.pipeline_job_items ADD COLUMN job_uuid uuid;
UPDATE public.pipeline_job_items t SET job_uuid = j.job_uuid FROM public.pipeline_jobs j WHERE j.job_id = t.job_id;

ALTER TABLE public.pipeline_job_items DROP CONSTRAINT pipeline_job_items_job_id_fkey;
DROP INDEX public.pipeline_job_items_job_idx;

ALTER TABLE public.pipeline_jobs DROP COLUMN job_id;
ALTER TABLE public.pipeline_jobs RENAME COLUMN job_uuid TO job_id;
ALTER TABLE public.pipeline_jobs ADD PRIMARY KEY (job_id);

ALTER TABLE public.pipeline_job_items DROP COLUMN job_id;
ALTER TABLE public.pipeline_job_items RENAME COLUMN job_uuid TO job_id;
ALTER TABLE public.pipeline_job_items ALTER COLUMN job_id SET NOT NULL;
ALTER TABLE public.pipeline_job_items ADD CONSTRAINT pipeline_job_items_job_id_fkey
  FOREIGN KEY (job_id) REFERENCES public.pipeline_jobs(job_id) ON DELETE CASCADE;
CREATE INDEX pipeline_job_items_job_idx ON public.pipeline_job_items (job_id);

-- ---------------------------------------------------------------------------
-- 4) PK ที่ไม่มีตารางอื่นอ้าง → ลบคอลัมน์เดิม (PK หายไปด้วย) แล้วเพิ่ม uuid เป็น PK ใหม่
--    ลำดับ "ล่าสุด" ต้องใช้ decided_at / created_at แทน (uuid เรียงตามเวลาไม่ได้)
-- ---------------------------------------------------------------------------
ALTER TABLE public.itineraries           DROP COLUMN itinerary_id;
ALTER TABLE public.itineraries           ADD COLUMN itinerary_id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY;

ALTER TABLE public.poi_scores            DROP COLUMN poi_id;
ALTER TABLE public.poi_scores            ADD COLUMN poi_id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY;

ALTER TABLE public.place_categories      DROP COLUMN place_categories_id;
ALTER TABLE public.place_categories      ADD COLUMN place_categories_id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY;

ALTER TABLE public.trip_categories       DROP COLUMN trip_category_id;
ALTER TABLE public.trip_categories       ADD COLUMN trip_category_id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY;

ALTER TABLE public.type_category_weights DROP COLUMN id;
ALTER TABLE public.type_category_weights ADD COLUMN id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY;

ALTER TABLE public.place_types           DROP COLUMN place_type_id;
ALTER TABLE public.place_types           ADD COLUMN place_type_id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY;

ALTER TABLE public.admin_place_decisions DROP COLUMN decision_id;
ALTER TABLE public.admin_place_decisions ADD COLUMN decision_id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY;

ALTER TABLE public.pipeline_job_items    DROP COLUMN item_id;
ALTER TABLE public.pipeline_job_items    ADD COLUMN item_id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY;

COMMIT;

-- ---------------------------------------------------------------------------
-- ตรวจผล (อ่านอย่างเดียว): ทุกคอลัมน์ต้องเป็น uuid และจำนวนแถวต้องเท่ากับ backup
-- ---------------------------------------------------------------------------
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND (table_name, column_name) IN (
    ('categories', 'category_id'), ('place_categories', 'category_id'), ('trip_categories', 'category_id'),
    ('type_category_weights', 'category_id'), ('trip_days', 'trip_day_id'), ('itineraries', 'trip_day_id'),
    ('itineraries', 'itinerary_id'), ('poi_scores', 'poi_id'), ('place_categories', 'place_categories_id'),
    ('trip_categories', 'trip_category_id'), ('type_category_weights', 'id'), ('place_types', 'place_type_id'),
    ('admin_place_decisions', 'decision_id'), ('pipeline_jobs', 'job_id'), ('pipeline_job_items', 'job_id'),
    ('pipeline_job_items', 'item_id'))
ORDER BY table_name, column_name;

SELECT 'categories' AS t, (SELECT count(*) FROM public.categories) AS now, (SELECT count(*) FROM public.backup_20261019_categories) AS backup
UNION ALL SELECT 'place_categories', (SELECT count(*) FROM public.place_categories), (SELECT count(*) FROM public.backup_20261019_place_categories)
UNION ALL SELECT 'trip_categories', (SELECT count(*) FROM public.trip_categories), (SELECT count(*) FROM public.backup_20261019_trip_categories)
UNION ALL SELECT 'type_category_weights', (SELECT count(*) FROM public.type_category_weights), (SELECT count(*) FROM public.backup_20261019_type_category_weights)
UNION ALL SELECT 'trip_days', (SELECT count(*) FROM public.trip_days), (SELECT count(*) FROM public.backup_20261019_trip_days)
UNION ALL SELECT 'itineraries', (SELECT count(*) FROM public.itineraries), (SELECT count(*) FROM public.backup_20261019_itineraries)
UNION ALL SELECT 'poi_scores', (SELECT count(*) FROM public.poi_scores), (SELECT count(*) FROM public.backup_20261019_poi_scores)
UNION ALL SELECT 'place_types', (SELECT count(*) FROM public.place_types), (SELECT count(*) FROM public.backup_20261019_place_types)
UNION ALL SELECT 'admin_place_decisions', (SELECT count(*) FROM public.admin_place_decisions), (SELECT count(*) FROM public.backup_20261019_admin_place_decisions);
-- FK ที่ว่างต้องเท่ากับก่อนแก้ (now = backup ทุกแถว · place_categories / itineraries ต้องเป็น 0)
SELECT 'place_categories null category' AS check,
       (SELECT count(*) FROM public.place_categories WHERE category_id IS NULL) AS now,
       (SELECT count(*) FROM public.backup_20261019_place_categories WHERE category_id IS NULL) AS backup
UNION ALL SELECT 'trip_categories null category',
       (SELECT count(*) FROM public.trip_categories WHERE category_id IS NULL),
       (SELECT count(*) FROM public.backup_20261019_trip_categories WHERE category_id IS NULL)
UNION ALL SELECT 'itineraries null trip_day',
       (SELECT count(*) FROM public.itineraries WHERE trip_day_id IS NULL),
       (SELECT count(*) FROM public.backup_20261019_itineraries WHERE trip_day_id IS NULL);
