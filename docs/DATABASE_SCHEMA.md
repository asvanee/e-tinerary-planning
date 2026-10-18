# DATABASE_SCHEMA — โครงสร้างฐานข้อมูล Supabase (schema `public`)

> **Snapshot 2026-10-18** — ผู้ใช้รัน SQL ท้ายไฟล์นี้ใน Supabase SQL Editor แล้ว export เป็น CSV (เฉพาะโครงสร้าง ไม่มีข้อมูลจริง)
> ถ้าไม่แน่ใจว่ายังตรงกับของจริง หรือต้องรู้สิ่งที่ไม่มีในไฟล์นี้ ให้ถามผู้ใช้ · **สร้างหรือแก้ตารางเมื่อไร ต้องอัปเดตไฟล์นี้** (รัน SQL ท้ายไฟล์ใหม่)
> "ใช้ในโค้ด" = ไฟล์ที่เรียก `.from("<table>")` หรือ embed ตารางนั้น (grep 2026-10-18)

## สรุปภาพรวม
- **RLS ปิดทุกตาราง** (`rls=false` ครบ 11 ตาราง) · ไม่มี policy · ไม่มี enum · ไม่มี trigger ใน schema `public` (Known Issue #27)
- ไม่มี trigger สร้างแถว `users` จาก `auth.users` — แถว `users` ถูก insert โดย `authController.register` เท่านั้น (ถ้า insert ไม่สำเร็จ login จะได้ `user: null` — Known Issue #29)
- FK ส่วนใหญ่เป็น `ON DELETE CASCADE` (รายละเอียดในหัวข้อ "ความสัมพันธ์")
- จำนวนแถว `places` (~1116) และ `place_types` (~1417) **เกิน 1000** แล้ว — query ที่ select ทั้งตารางเสี่ยงถูกตัด (T7)
- ตารางที่มีใน DB แต่ **ไม่มีโค้ดใน repo ใช้**: `place_types`, `type_category_weights` (ดูหมายเหตุ Stage 3)

## ความสัมพันธ์ (FK)
```text
auth.users.id ──CASCADE──► users.user_id
users.user_id ──CASCADE──► trips.user_id
trips.trip_id ──CASCADE──► trip_days.trip_id · poi_scores.trip_id · trip_categories.trip_id
trip_days.trip_day_id ──CASCADE──► itineraries.trip_day_id
places.place_id ──CASCADE──► itineraries.place_id · poi_scores.place_id · place_categories.place_id · place_types.place_id
categories.category_id ──CASCADE──► place_categories.category_id · type_category_weights.category_id
categories.category_id ──(ไม่มี ON DELETE = NO ACTION)──► trip_categories.category_id
```
- ⚠️ **ลบแถวใน `places` = ลบ `itineraries` และ `poi_scores` ของทริปผู้ใช้ที่อ้างสถานที่นั้นไปด้วย** (รวม `place_categories`, `place_types`) — สำคัญกับการนำเข้าใหม่แทนข้อมูลเดิม (D-26: ผู้ใช้เลือกลบแล้วนำเข้าใหม่ ต้องทำหลัง category mapping พร้อม)
- ลบ `trips` → `trip_days`, `itineraries`, `poi_scores`, `trip_categories` ถูกลบตาม (ตอบคำถามใน comment ของ `tripController.deleteTrip`)
- ลบ `categories` ที่ยังมี `trip_categories` อ้างอยู่จะ error

## ตาราง

### `users` · rows ~6 · ใช้ในโค้ด: `authController.ts`
| คอลัมน์ | type | null | default |
|---|---|---|---|
| `user_id` | uuid | NOT NULL | — (PK, FK → `auth.users.id` CASCADE) |
| `username` | text | NOT NULL | |
| `email` | text | NOT NULL | UNIQUE |
| `role` | text | NOT NULL | `'user'` · CHECK `admin` \| `user` |
| `is_active` | bool | NOT NULL | `true` |
| `email_verified` | bool | NOT NULL | `false` |
| `age` | int4 | | |
| `gender` | text | | CHECK `male` \| `female` \| `other` \| `unspecified` |
| `created_at` | timestamptz | | `now()` |
| `last_login` | timestamptz | | |

### `trips` · rows ~13 · ใช้ในโค้ด: `tripController.ts`, `itineraryController.ts`, `itineraryPlaceQueries.ts`, `poiPlaceQueries.ts`
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

### `trip_days` · rows ~28 · ใช้ในโค้ด: `itineraryPlaceQueries.ts`
| คอลัมน์ | type | null | default / constraint |
|---|---|---|---|
| `trip_day_id` | int4 | NOT NULL | serial (PK) |
| `trip_id` | uuid | NOT NULL | FK → `trips` CASCADE |
| `day_number` | int4 | NOT NULL | UNIQUE (`trip_id`, `day_number`) |
| `visit_date` | date | NOT NULL | |
| `start_time` / `end_time` | time | | |
| `daily_budget` | numeric | | |
| `created_at` / `updated_at` | timestamptz | | `now()` |

### `trip_categories` · rows ~11 · ใช้ในโค้ด: `tripController.ts`, `poiPlaceQueries.ts`
| คอลัมน์ | type | null | default / constraint |
|---|---|---|---|
| `trip_category_id` | int4 | NOT NULL | serial (PK) |
| `trip_id` | uuid | | FK → `trips` CASCADE |
| `category_id` | int4 | | FK → `categories` (NO ACTION) |
| `created_at` | timestamptz | | `now()` |

ไม่มี UNIQUE (`trip_id`, `category_id`) — ซ้ำได้ในระดับ DB

### `itineraries` · rows ~20 · ใช้ในโค้ด: `itineraryController.ts`
| คอลัมน์ | type | null | default / constraint |
|---|---|---|---|
| `itinerary_id` | int4 | NOT NULL | serial (PK) |
| `trip_day_id` | int4 | NOT NULL | FK → `trip_days` CASCADE |
| `place_id` | uuid | NOT NULL | FK → `places` CASCADE |
| `visit_order` | int4 | NOT NULL | UNIQUE (`trip_day_id`, `visit_order`) |
| `start_time` / `end_time` | time | | |
| `travel_time_from_prev` | int4 | | |
| `distance_from_prev` | numeric | | |
| `place_cost` | numeric | | |
| `is_time_conflict` | bool | | `false` |
| `is_closed_conflict` / `is_budget_conflict` / `is_hours_unknown` | bool | | |
| `is_budget_unknown` | bool | NOT NULL | `false` |
| `created_at` / `updated_at` | timestamptz | | `now()` |

### `poi_scores` · rows ~394 · ใช้ในโค้ด: `poiController.ts`, `itineraryPlaceQueries.ts`
| คอลัมน์ | type | null | default / constraint |
|---|---|---|---|
| `poi_id` | int4 | NOT NULL | serial (PK) |
| `trip_id` | uuid | NOT NULL | FK → `trips` CASCADE · UNIQUE (`trip_id`, `place_id`) |
| `place_id` | uuid | NOT NULL | FK → `places` CASCADE |
| `category_score` / `rating_score` / `distance_score` / `poi_score` | numeric | NOT NULL | `0` |
| `budget_score` | numeric | | |
| `weather_score` | numeric | NOT NULL | `1` |
| `created_at` / `updated_at` | timestamptz | | `now()` |

### `places` · rows ~1116 · ใช้ในโค้ด: `placeDropdownController.ts`, `config/db.ts` (ทดสอบการเชื่อมต่อ), embed ใน `placesController.ts` / `itineraryPlaceQueries.ts` · เขียนโดย `data-pipeline/src/upload*.ts`, `fetchGmapsCategories.ts`
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
| `att_id`, `att_type_label`, `att_category_label`, `att_detail_th` | text | | มาจาก `attraction.csv` |
| `att_facebook`, `att_instagram`, `att_tiktok`, `att_youtube`, `att_line` | text | | มาจาก `attraction.csv` |
| `gmaps_types` | text[] | | เติมโดย `fetchGmapsCategories.ts` |
| `created_at` | timestamptz | | `now()` |

ไม่มี index ที่ `province` (query dropdown/POI กรองด้วย `province`)

### `categories` · rows ไม่ทราบ (`reltuples = -1` ยังไม่เคย analyze) · ใช้ในโค้ด: `categoriesController.ts`, embed ใน `poiPlaceQueries.ts` / `itineraryPlaceQueries.ts`
| คอลัมน์ | type | null | default / constraint |
|---|---|---|---|
| `category_id` | int4 | NOT NULL | serial (PK) |
| `category_name` | text | NOT NULL | UNIQUE |
| `environment_type` | text | NOT NULL | CHECK `INDOOR` \| `OUTDOOR` \| `MIXED` |
| `price_nature` | text | NOT NULL | CHECK `free` \| `paid` |
| `default_duration_min` | int4 | | `60` |
| `created_at` | timestamptz | | `now()` |

### `place_categories` · rows ~486 · ใช้ในโค้ด: `poiPlaceQueries.ts`, `itineraryPlaceQueries.ts`, `placesController.ts`
| คอลัมน์ | type | null | default / constraint |
|---|---|---|---|
| `place_categories_id` | int4 | NOT NULL | serial (PK) |
| `place_id` | uuid | NOT NULL | FK → `places` CASCADE · UNIQUE (`place_id`, `category_id`) |
| `category_id` | int4 | NOT NULL | FK → `categories` CASCADE |
| `confidence_score` | numeric | NOT NULL | `1.0` |
| `created_at` | timestamptz | | `now()` |

1 สถานที่มีได้หลาย category — โค้ดเลือก `confidence_score` สูงสุด (กฎ multi-category dedupe ใน CLAUDE.md)

### `place_types` · rows ~1417 · **ไม่มีโค้ดใน repo ใช้**
| คอลัมน์ | type | null | default / constraint |
|---|---|---|---|
| `place_id` | uuid | NOT NULL | FK → `places` CASCADE · PK (`place_id`, `api_type_id`) |
| `api_type_id` | text | NOT NULL | index `idx_place_types_api_type` |
| `source` | text | NOT NULL | `'google'` · CHECK `google` \| `csv` |
| `created_at` | timestamptz | | `now()` |

### `type_category_weights` · rows ~108 · **ไม่มีโค้ดใน repo ใช้**
| คอลัมน์ | type | null | default / constraint |
|---|---|---|---|
| `id` | int4 | NOT NULL | serial (PK) |
| `api_type_id` | text | NOT NULL | UNIQUE (`api_type_id`, `category_id`) · index `idx_type_category_weights_api_type` |
| `category_id` | int4 | NOT NULL | FK → `categories` CASCADE |
| `weight` | numeric | NOT NULL | CHECK `> 0` |
| `created_at` | timestamptz | | `now()` |

**ข้อสันนิษฐาน (ยังไม่ยืนยัน):** `place_types` (type ของสถานที่) + `type_category_weights` (type → category + weight) น่าจะเป็นข้อมูลของ "Stage 3" ที่สร้าง `place_categories.confidence_score` ซึ่งไม่พบโค้ดใน repo (R4, T12, D-23 Q3) — ต้องถามทีมว่าสร้างด้วยอะไรและสูตรเป็นอย่างไร

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
