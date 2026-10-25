# DATABASE_SCHEMA — โครงสร้างฐานข้อมูล Supabase (schema `public`)

> **Snapshot 2026-10-18** — ผู้ใช้รัน SQL ท้ายไฟล์นี้ใน Supabase SQL Editor แล้ว export เป็น CSV (เฉพาะโครงสร้าง ไม่มีข้อมูลจริง)
> ถ้าไม่แน่ใจว่ายังตรงกับของจริง หรือต้องรู้สิ่งที่ไม่มีในไฟล์นี้ ให้ถามผู้ใช้ · **สร้างหรือแก้ตารางเมื่อไร ต้องอัปเดตไฟล์นี้** (รัน SQL ท้ายไฟล์ใหม่)
> "ใช้ในโค้ด" = ไฟล์ที่เรียก `.from("<table>")` หรือ embed ตารางนั้น (grep 2026-10-18)

## สรุปภาพรวม
- **PK ทุกตารางเป็น uuid** (`gen_random_uuid()`) ตั้งแต่ 2026-10-18 (T23, D-28 — SQL: `docs/sql/2026-10-19_uuid_primary_keys.sql`, ตรวจแล้วว่า id เป็น uuid และจำนวนแถวเท่า backup) · ตาราง backup ที่สร้างตอนแก้ (`backup_20261019_*` 11 ตาราง + `place_types_backup_20261018`) ผู้ใช้สั่งลบแล้ว 2026-10-18 — SQL: `docs/sql/2026-10-18_drop_backup_tables.sql` · ห้ามใช้ลำดับของ id หาค่าล่าสุด ให้ใช้คอลัมน์เวลา
- **RLS ปิดทุกตาราง** (`rls=false` ครบ 11 ตาราง) · ไม่มี policy · ไม่มี enum · ไม่มี trigger ใน schema `public` (Known Issue #27)
- ไม่มี trigger สร้างแถว `users` จาก `auth.users` — แถว `users` ถูก insert โดย `authController.register` เท่านั้น (ถ้า insert ไม่สำเร็จ login จะได้ `user: null` — Known Issue #29)
- FK ส่วนใหญ่เป็น `ON DELETE CASCADE` (รายละเอียดในหัวข้อ "ความสัมพันธ์")
- จำนวนแถว `places` **เกิน 1000** แล้ว (1,230 — 2026-10-22) — query ที่ select ทั้งตารางต้องใช้ `.range()` (T7 · มี `selectAll` ใน `admin/provinces/decisionQueries.ts`)
- **ลบแล้ว 2026-10-22 (R5 P5g — D-41):** ตาราง `place_categories`, `type_category_weights`, `place_types` และคอลัมน์ `categories.default_duration_min` · หมวดของสถานที่หาจาก `places.att_type_label` → `category_labels` → `categories` · ตาราง `backup_20261022_*` (5 ตาราง) ยังเก็บไว้

## ความสัมพันธ์ (FK)
```text
auth.users.id ──CASCADE──► users.user_id
users.user_id ──CASCADE──► trips.user_id
trips.trip_id ──CASCADE──► trip_days.trip_id · poi_scores.trip_id · trip_categories.trip_id
trip_days.trip_day_id ──CASCADE──► itineraries.trip_day_id
places.place_id ──CASCADE──► itineraries.place_id · poi_scores.place_id
places.att_type_label ──(ON UPDATE CASCADE / ON DELETE RESTRICT)──► category_labels.att_type_label (P5b)
category_labels.category_id ──(ON DELETE RESTRICT)──► categories.category_id (P5b)
categories.category_id ──(ไม่มี ON DELETE = NO ACTION)──► trip_categories.category_id
```
- ⚠️ **ลบแถวใน `places` = ลบ `itineraries` และ `poi_scores` ของทริปผู้ใช้ที่อ้างสถานที่นั้นไปด้วย** (รวม `place_categories`, `place_types`) — สำคัญกับการนำเข้าใหม่แทนข้อมูลเดิม (D-26: ผู้ใช้เลือกลบแล้วนำเข้าใหม่ ต้องทำหลัง category mapping พร้อม)
- ลบ `trips` → `trip_days`, `itineraries`, `poi_scores`, `trip_categories` ถูกลบตาม (ตอบคำถามใน comment ของ `tripController.deleteTrip`)
- ลบ `categories` ที่ยังมี `trip_categories` อ้างอยู่จะ error

## ตาราง

### `users` · rows ~6 · ใช้ในโค้ด: `authController.ts` · คอลัมน์ `age` / `gender` เอาออกแล้ว (D-47 — `docs/sql/2026-10-25_drop_users_age_gender.sql`, ผู้ใช้รันเอง)
| คอลัมน์ | type | null | default |
|---|---|---|---|
| `user_id` | uuid | NOT NULL | — (PK, FK → `auth.users.id` CASCADE) |
| `username` | text | NOT NULL | |
| `email` | text | NOT NULL | UNIQUE |
| `role` | text | NOT NULL | `'user'` · CHECK `admin` \| `user` |
| `is_active` | bool | NOT NULL | `true` |
| `email_verified` | bool | NOT NULL | `false` |
| `created_at` | timestamptz | | `now()` |
| `last_login` | timestamptz | | |

### `trips` · rows ~13 (ลบทริปทดสอบทั้งหมดแล้ว → 0 — 2026-10-22) · ใช้ในโค้ด: `tripController.ts`, `itineraryController.ts`, `itineraryPlaceQueries.ts`, `poiPlaceQueries.ts`
| คอลัมน์ | type | null | default / constraint |
|---|---|---|---|
| `trip_id` | uuid | NOT NULL | `gen_random_uuid()` (PK) |
| `user_id` | uuid | NOT NULL | FK → `users` CASCADE |
| `province` | text | NOT NULL | |
| `district` | text | | |
| `start_date` / `end_date` | date | NOT NULL | CHECK `end_date >= start_date` |
| `start_time` | time | NOT NULL | |
| `number_of_people` | int4 | NOT NULL | CHECK `> 0` |
| `total_budget` | numeric | | |
| `available_time_per_day` | int4 | NOT NULL | CHECK `> 0` |
| `created_at` | timestamptz | | `now()` |
| `daily_budget` | numeric | | |
| `start_lat` | float8 | | CHECK −90..90 |
| `start_lng` | float8 | | CHECK −180..180 |
| `start_address` | text | | |
| `budget_scope` | text | | CHECK `GROUP` \| `PER_PERSON` |
| `budget_period` | text | | CHECK `TOTAL_TRIP` \| `PER_DAY` |
| `use_budget` | bool | NOT NULL | `true` |

### `trip_days` · rows ~28 (0 — 2026-10-22 ลบตามทริป) · ใช้ในโค้ด: `itineraryPlaceQueries.ts`
| คอลัมน์ | type | null | default / constraint |
|---|---|---|---|
| `trip_day_id` | uuid | NOT NULL | `gen_random_uuid()` (PK) |
| `trip_id` | uuid | NOT NULL | FK → `trips` CASCADE |
| `day_number` | int4 | NOT NULL | UNIQUE (`trip_id`, `day_number`) |
| `visit_date` | date | NOT NULL | |
| `start_time` / `end_time` | time | | |
| `daily_budget` | numeric | | |
| `created_at` / `updated_at` | timestamptz | | `now()` |

### `trip_categories` · rows ~11 (นับจริง 24 — 2026-10-22, P5-0 · หลัง P5b ชุดที่ 2 เหลือ 3 แถวที่อ้างหมวดใหม่ · 0 — 2026-10-22 ลบตามทริป) · ใช้ในโค้ด: `tripController.ts`, `poiPlaceQueries.ts`
| คอลัมน์ | type | null | default / constraint |
|---|---|---|---|
| `trip_category_id` | uuid | NOT NULL | `gen_random_uuid()` (PK) |
| `trip_id` | uuid | | FK → `trips` CASCADE |
| `category_id` | uuid | | FK → `categories` (NO ACTION) |
| `created_at` | timestamptz | | `now()` |

ไม่มี UNIQUE (`trip_id`, `category_id`) — ซ้ำได้ในระดับ DB

### `itineraries` · rows ~20 (นับจริง 22 — 2026-10-22 · 0 หลังลบทริปทดสอบ) · ใช้ในโค้ด: `itineraryController.ts`
| คอลัมน์ | type | null | default / constraint |
|---|---|---|---|
| `itinerary_id` | uuid | NOT NULL | `gen_random_uuid()` (PK) |
| `trip_day_id` | uuid | NOT NULL | FK → `trip_days` CASCADE |
| `place_id` | uuid | NOT NULL | FK → `places` CASCADE |
| `visit_order` | int4 | NOT NULL | UNIQUE (`trip_day_id`, `visit_order`) |
| `start_time` / `end_time` | time | | |
| `travel_time_from_prev` | int4 | | |
| `distance_from_prev` | numeric | | |
| `place_cost` | numeric | | |
| `visit_duration_min` | int4 | | CHECK 1..1440 · เวลาที่ผู้ใช้กรอก (D-36) · เพิ่ม 2026-10-22 (`docs/sql/2026-10-22_p5f_visit_duration.sql`) · แถวที่บันทึกก่อน P5f เป็น NULL |
| `is_time_conflict` | bool | | `false` |
| `is_closed_conflict` / `is_budget_conflict` / `is_hours_unknown` | bool | | |
| `is_budget_unknown` | bool | NOT NULL | `false` |
| `created_at` / `updated_at` | timestamptz | | `now()` |

### `poi_scores` · rows ~394 (0 — 2026-10-22 ลบตามทริป) · ใช้ในโค้ด: `poiController.ts`, `itineraryPlaceQueries.ts`
| คอลัมน์ | type | null | default / constraint |
|---|---|---|---|
| `poi_id` | uuid | NOT NULL | `gen_random_uuid()` (PK) |
| `trip_id` | uuid | NOT NULL | FK → `trips` CASCADE · UNIQUE (`trip_id`, `place_id`) |
| `place_id` | uuid | NOT NULL | FK → `places` CASCADE |
| `category_score` / `rating_score` / `distance_score` / `poi_score` | numeric | NOT NULL | `0` |
| `budget_score` | numeric | | |
| `weather_score` | numeric | NOT NULL | `1` |
| `created_at` / `updated_at` | timestamptz | | `now()` |

### `places` · rows ~1116 (นับจริง 1,230 หลังนำเข้าน่าน — 2026-10-22 · **114 = น่านอย่างเดียว** หลังลบ กรุงเทพฯ/เชียงใหม่/ชลบุรี 2026-10-22 สำรองที่ `backup_20261022_places`; `att_type_label` ไม่ว่างทุกแถว) · ใช้ในโค้ด: `placeDropdownController.ts`, `config/db.ts` (ทดสอบการเชื่อมต่อ), embed ใน `placesController.ts` / `itineraryPlaceQueries.ts` · ข้อมูลเดิมเขียนโดย `data-pipeline/` (ลบแล้ว — D-37) และการนำเข้าใหม่ `backend/src/admin/imports/importQueries.ts` (insert เท่านั้น — D-30)
| คอลัมน์ | type | null | default / constraint |
|---|---|---|---|
| `place_id` | uuid | NOT NULL | `gen_random_uuid()` (PK) |
| `google_place_id` | text | NOT NULL | UNIQUE (upsert onConflict ของ data-pipeline) |
| `place_name` | text | NOT NULL | |
| `latitude` / `longitude` | float8 | NOT NULL | ไม่มี CHECK ช่วงพิกัด (R2) |
| `rating` | numeric | | CHECK 0..5 |
| `price_level` | int4 | | CHECK 0..4 |
| `user_ratings_total` | int4 | | |
| `opening_hours` | jsonb | | (รูปแบบ Google `periods`/`weekday_text`) |
| `formatted_address`, `province`, `district`, `phone_number`, `website` | text | | |
| `att_id`, `att_type_label`, `att_category_label`, `att_detail_th` | text | | มาจาก `attraction.csv` · `att_type_label` FK → `category_labels.att_type_label` + index `idx_places_att_type_label` (P5b 2026-10-22) |
| `att_facebook`, `att_instagram`, `att_tiktok`, `att_youtube`, `att_line` | text | | มาจาก `attraction.csv` |
| `gmaps_types` | text[] | | เติมโดย `fetchGmapsCategories.ts` |
| `created_at` | timestamptz | | `now()` |

ไม่มี index ที่ `province` (query dropdown/POI กรองด้วย `province`)

### `categories` · rows 29 (หมวดจากป้าย ททท. — D-39 · หมวดอังกฤษเดิม 15 หมวดลบแล้ว 2026-10-22 P5b ชุดที่ 2 · สำรอง `backup_20261022_categories`) · ใช้ในโค้ด: `categoriesController.ts`, embed ใน `poiPlaceQueries.ts` / `itineraryPlaceQueries.ts`
| คอลัมน์ | type | null | default / constraint |
|---|---|---|---|
| `category_id` | uuid | NOT NULL | `gen_random_uuid()` (PK) |
| `category_name` | text | NOT NULL | UNIQUE |
| `environment_type` | text | NOT NULL | CHECK `INDOOR` \| `OUTDOOR` \| `MIXED` |
| `price_nature` | text | NOT NULL | CHECK `free` \| `paid` |
| `parent_group` | text | NOT NULL | CHECK `HISTORY_CULTURE` \| `NATURE` \| `RECREATION` (กลุ่มใหญ่ ททท. — P5b 2026-10-22) |
| ~~`default_duration_min`~~ | — | | **ลบคอลัมน์แล้ว 2026-10-22 (P5g)** — เวลาที่อยู่ผู้ใช้กรอกเอง (`itineraries.visit_duration_min` — D-36) · Auto Trip ของเพื่อนยังอ่านอยู่จนกว่าจะแก้ |
| `created_at` | timestamptz | | `now()` |

### `place_categories` · **🗑️ ลบตารางแล้ว 2026-10-22 (R5 P5g — `docs/sql/2026-10-22_p5g_drop_legacy.sql`)** · ข้อมูลด้านล่างเป็นประวัติ · **ว่าง (0 แถว) ตั้งแต่ 2026-10-22** — ถูกลบตามหมวดเดิม (CASCADE) ใน P5b ชุดที่ 2 · สำรอง `backup_20261022_place_categories` (486) · ไม่ใช้แล้ว ลบตารางใน P5g · โค้ดที่ยังอ่าน: `getAutoTripPlaces` (ของเพื่อน — ได้ผลว่าง) · ใช้ในโค้ด: `poiPlaceQueries.ts`, `itineraryPlaceQueries.ts`, `placesController.ts`
| คอลัมน์ | type | null | default / constraint |
|---|---|---|---|
| `place_categories_id` | uuid | NOT NULL | `gen_random_uuid()` (PK) |
| `place_id` | uuid | NOT NULL | FK → `places` CASCADE · UNIQUE (`place_id`, `category_id`) |
| `category_id` | uuid | NOT NULL | FK → `categories` CASCADE |
| `confidence_score` | numeric | NOT NULL | `1.0` |
| `created_at` | timestamptz | | `now()` |

1 สถานที่มีได้หลาย category — โค้ดเลือก `confidence_score` สูงสุด (กฎ multi-category dedupe ใน CLAUDE.md) · D-35 (R5 P5): จะสร้างใหม่จาก `places.att_type_label` เหลือ 1 หมวดต่อสถานที่ — `categories` / `place_categories` / `trip_categories` จะเปลี่ยนโครงสร้างและย้ายข้อมูล (SQL อยู่ใน P5)

### `place_types` · **🗑️ ลบตารางแล้ว 2026-10-22 (R5 P5g — `docs/sql/2026-10-22_p5g_drop_legacy.sql`)** · ข้อมูลด้านล่างเป็นประวัติ · rows 1605 (นับจริง 2026-10-18) · เขียนโดย `backend/src/admin/imports/importQueries.ts` (R5 P4 — D-27)
| คอลัมน์ | type | null | default / constraint |
|---|---|---|---|
| `place_type_id` | uuid | NOT NULL | `gen_random_uuid()` (PK) — **เปลี่ยนจาก composite PK (`place_id`, `api_type_id`) เมื่อ 2026-10-18** (ผู้ใช้รัน SQL) (เป็น uuid ใน T23) |
| `place_id` | uuid | NOT NULL | FK → `places` CASCADE · index `idx_place_types_place_id` |
| `api_type_id` | text | NOT NULL | index `idx_place_types_api_type` |
| `source` | text | NOT NULL | `'google'` · CHECK `google` \| `csv` |
| `created_at` | timestamptz | | `now()` |

- ไม่มี key ร่วมแล้ว DB จึงไม่กันคู่ (`place_id`, `api_type_id`) ซ้ำ — โค้ดต้องเช็คคู่ที่มีอยู่ก่อน insert · ถ้ามีเครื่องมือนอก repo upsert ด้วย `onConflict: "place_id,api_type_id"` จะ error
- backup ตอนแก้ (`place_types_backup_20261018`) ผู้ใช้สั่งลบแล้ว 2026-10-18 (`docs/sql/2026-10-18_drop_backup_tables.sql`)

### `type_category_weights` · **🗑️ ลบตารางแล้ว 2026-10-22 (R5 P5g — `docs/sql/2026-10-22_p5g_drop_legacy.sql`)** · ข้อมูลด้านล่างเป็นประวัติ · rows 0 (ถูกลบตามหมวดเดิม 2026-10-22 · สำรอง `backup_20261022_type_category_weights` 107 แถว · ลบตารางใน P5g) · **ไม่มีโค้ดใน repo ใช้**
| คอลัมน์ | type | null | default / constraint |
|---|---|---|---|
| `id` | uuid | NOT NULL | `gen_random_uuid()` (PK) |
| `api_type_id` | text | NOT NULL | UNIQUE (`api_type_id`, `category_id`) · index `idx_type_category_weights_api_type` |
| `category_id` | uuid | NOT NULL | FK → `categories` CASCADE |
| `weight` | numeric | NOT NULL | CHECK `> 0` |
| `created_at` | timestamptz | | `now()` |

**D-35 (2026-10-21): ไม่ใช้สองตารางนี้จัดหมวดแล้ว** (`place_types` ยังเขียนตอนนำเข้า) · **ข้อสันนิษฐาน (ยังไม่ยืนยัน):** `place_types` (type ของสถานที่) + `type_category_weights` (type → category + weight) น่าจะเป็นข้อมูลของ "Stage 3" ที่สร้าง `place_categories.confidence_score` ซึ่งไม่พบโค้ดใน repo (R4, T12, D-23 Q3) — ต้องถามทีมว่าสร้างด้วยอะไรและสูตรเป็นอย่างไร

## ตารางที่เพิ่มหลัง snapshot (ผู้ใช้สร้างด้วย SQL ด้านล่าง — Claude ตรวจด้วย select อ่านอย่างเดียวว่ามีครบทุกคอลัมน์ 2026-10-18)

### `admin_place_decisions` (R5 P3, D-26) · ใช้ในโค้ด: `backend/src/admin/provinces/decisionQueries.ts`
การตัดสินใจของ admin ในหน้ารีวิวจังหวัด — แทนกฎ hard code ของ data-pipeline · PK เดียว (`decision_id`) ไม่มี composite key
| คอลัมน์ | type | null | default / constraint |
|---|---|---|---|
| `decision_id` | uuid | NOT NULL | `gen_random_uuid()` (PK) |
| `province` | text | NOT NULL | index |
| `kind` | text | NOT NULL | CHECK `merge` \| `separate` \| `exclude` \| `fix_location` \| `ok` |
| `att_ids` | text[] | NOT NULL | CHECK มีอย่างน้อย 1 ตัว (merge/separate ≥ 2, ที่เหลือ 1 — ตรวจในโค้ด) |
| `primary_att_id` | text | | แถวหลักของ merge |
| `field_sources` | jsonb | | merge: ชื่อคอลัมน์ CSV → ATT_ID ที่ใช้ค่านั้น (ไม่ระบุ = ใช้ค่าของแถวหลัก) |
| `field_values` | jsonb | | merge: ชื่อคอลัมน์ CSV → ค่าที่ admin พิมพ์เอง (D-32 · ⚠️ เพิ่มหลังสร้างตาราง — ผู้ใช้ต้องรัน `ALTER TABLE` ด้านล่าง) |
| `lat` / `lng` | float8 | | CHECK −90..90 / −180..180 · fix_location หรือพิกัดที่กรอกเองตอน merge |
| `note` | text | | |
| `decided_by` | uuid | | FK → `users.user_id` ON DELETE SET NULL |
| `decided_at` | timestamptz | NOT NULL | `now()` |

RLS เปิดและไม่มี policy (เข้าถึงได้เฉพาะ service role ของ backend — ไม่ซ้ำ Known Issue #27)
```sql
CREATE TABLE public.admin_place_decisions (
  decision_id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),   -- เดิม bigint identity (เปลี่ยนใน T23)
  province       text NOT NULL,
  kind           text NOT NULL CHECK (kind IN ('merge', 'separate', 'exclude', 'fix_location', 'ok')),
  att_ids        text[] NOT NULL CHECK (cardinality(att_ids) >= 1),
  primary_att_id text,
  field_sources  jsonb,
  lat            double precision CHECK (lat BETWEEN -90 AND 90),
  lng            double precision CHECK (lng BETWEEN -180 AND 180),
  note           text,
  decided_by     uuid REFERENCES public.users(user_id) ON DELETE SET NULL,
  decided_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX admin_place_decisions_province_idx ON public.admin_place_decisions (province);
ALTER TABLE public.admin_place_decisions ENABLE ROW LEVEL SECURITY;

-- D-32 (2026-10-21): ค่าที่ admin พิมพ์เองตอน merge
ALTER TABLE public.admin_place_decisions ADD COLUMN field_values jsonb;
```

### `category_labels` (R5 P5b, D-39/D-40 — ✅ ผู้ใช้รัน `docs/sql/2026-10-22_p5b_1_category_labels.sql` แล้ว 2026-10-22 · Claude ตรวจด้วย select: 53 แถว, สถานที่ 1,230 แห่งได้หมวดผ่าน embed) · ใช้ในโค้ด: `poiPlaceQueries.ts`, `itineraryPlaceQueries.ts` (`getSelectedPlaces`), `placesController.ts` (embed จาก `places`) · `admin/categories/categoryQueries.ts` (อ่าน + ย้ายป้าย — P5e)
ป้าย ททท. → หมวด · `att_type_label` UNIQUE = 1 ป้ายอยู่ได้ 1 หมวด · admin ย้ายป้ายได้ในหน้า Category Mapping (P5e)
| คอลัมน์ | type | null | default / constraint |
|---|---|---|---|
| `category_label_id` | uuid | NOT NULL | `gen_random_uuid()` (PK) |
| `att_type_label` | text | NOT NULL | UNIQUE · ถูกอ้างโดย `places.att_type_label` (FK `places_att_type_label_fkey` ON UPDATE CASCADE / ON DELETE RESTRICT) |
| `category_id` | uuid | NOT NULL | FK → `categories` ON DELETE RESTRICT · index `idx_category_labels_category_id` |
| `created_at` / `updated_at` | timestamptz | | `now()` |

RLS เปิดและไม่มี policy (เข้าถึงได้เฉพาะ service role ของ backend) · หาหมวดของสถานที่ด้วย embed `places` → `category_labels!inner(categories!inner(...))` (ตรวจแล้วว่าใช้ได้ 2026-10-22) · สำรอง `backup_20261022_categories` (ลบได้เมื่อมั่นใจ)

### `pipeline_jobs` / `pipeline_job_items` (R5 P4 — ✅ ผู้ใช้สร้างแล้ว 2026-10-18 ตาม SQL ด้านล่าง) · ใช้ในโค้ด: `backend/src/admin/imports/importQueries.ts`
job นำเข้าจังหวัด 1 แถวต่อ 1 job · ผลรายสถานที่ 1 แถวต่อ 1 ATT_ID · PK เดียวทั้งคู่ · RLS เปิด ไม่มี policy
```sql
CREATE TABLE public.pipeline_jobs (
  job_id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),   -- เดิม bigint identity (T23)
  province         text NOT NULL,
  status           text NOT NULL DEFAULT 'queued'
                   CHECK (status IN ('queued', 'running', 'done', 'failed', 'cancelled')),
  limit_rows       int CHECK (limit_rows > 0),
  total            int NOT NULL DEFAULT 0,
  processed        int NOT NULL DEFAULT 0,
  imported         int NOT NULL DEFAULT 0,
  needs_review     int NOT NULL DEFAULT 0,
  failed           int NOT NULL DEFAULT 0,
  cancel_requested boolean NOT NULL DEFAULT false,
  error            text,
  started_by       uuid REFERENCES public.users(user_id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  started_at       timestamptz,
  finished_at      timestamptz
);
CREATE INDEX pipeline_jobs_province_idx ON public.pipeline_jobs (province);
ALTER TABLE public.pipeline_jobs ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.pipeline_job_items (
  item_id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),   -- เดิม bigint identity (T23)
  job_id          uuid NOT NULL REFERENCES public.pipeline_jobs(job_id) ON DELETE CASCADE,
  att_id          text NOT NULL,
  status          text NOT NULL CHECK (status IN (
                    'imported', 'needs_review_mismatch', 'needs_review_not_found',
                    'needs_review_duplicate', 'error', 'resolved')),
  google_place_id text,
  place_id        uuid,                 -- places.place_id ที่บันทึกแล้ว (ไม่ทำ FK เพราะ places อาจถูกลบ/นำเข้าใหม่)
  candidate       jsonb,                -- ชื่อ/พิกัด/ที่อยู่ที่ Google เสนอ (ให้ admin ดู)
  distance_m      double precision,
  message         text,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX pipeline_job_items_job_idx ON public.pipeline_job_items (job_id);
ALTER TABLE public.pipeline_job_items ENABLE ROW LEVEL SECURITY;
```

## SQL สำหรับ refresh snapshot (อ่านอย่างเดียว)
รันใน Supabase SQL Editor ครั้งเดียว (ต้องมี `LIMIT` เพราะ editor ตัดผลที่ 100 แถวเป็นค่าเริ่มต้น) แล้ว export CSV
```sql
SELECT section, line FROM (
  SELECT 1 AS s, c.table_name AS t, c.ordinal_position AS o, 'COL' AS section,
         c.table_name || '.' || c.column_name || ' ' || c.udt_name
         || CASE WHEN c.is_nullable = 'NO' THEN ' NOT NULL' ELSE '' END
         || COALESCE(' DEFAULT ' || c.column_default, '') AS line
  FROM information_schema.columns c WHERE c.table_schema = 'public'
  UNION ALL
  SELECT 2, rel.relname, 0, 'CON', rel.relname || ' ' || con.conname || ': ' || pg_get_constraintdef(con.oid)
  FROM pg_constraint con JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_namespace n ON n.oid = rel.relnamespace WHERE n.nspname = 'public'
  UNION ALL
  SELECT 3, tablename, 0, 'IDX', indexdef FROM pg_indexes WHERE schemaname = 'public'
  UNION ALL
  SELECT 4, c.relname, 0, 'RLS', c.relname || ' rls=' || c.relrowsecurity || ' rows~' || c.reltuples::bigint
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r'
  UNION ALL
  SELECT 5, tablename, 0, 'POL', tablename || ' ' || policyname || ' ' || cmd
         || ' roles=' || array_to_string(roles, ',') || ' using=' || COALESCE(qual, '-')
         || ' check=' || COALESCE(with_check, '-')
  FROM pg_policies WHERE schemaname = 'public'
  UNION ALL
  SELECT 6, t.typname, 0, 'ENUM', t.typname || ' = ' || e.enumlabel
  FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
  JOIN pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname = 'public'
  UNION ALL
  SELECT 7, event_object_table, 0, 'TRG', event_object_table || ' ' || trigger_name || ' '
         || action_timing || ' ' || event_manipulation || ' ' || action_statement
  FROM information_schema.triggers WHERE trigger_schema = 'public'
) x ORDER BY s, t, o, line LIMIT 5000;
```
ไฟล์ CSV ที่ export ห้าม commit (ลบหลังอัปเดตเอกสาร)
