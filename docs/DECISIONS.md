# DECISIONS — ข้อสรุปทางเทคนิคที่ตัดสินใจแล้ว

> รวบรวมจาก comment "✅ มติ…" ในโค้ด (เอกสารต้นทาง เช่น `PRICE_SCORE_REDESIGN.md`, `itineraries_feature_status.md` ไม่มีใน ZIP) ห้ามเปลี่ยนโดยไม่ถามเจ้าของโปรเจกต์ ถ้าเปลี่ยนต้องเพิ่ม entry ใหม่ไว้ด้านล่าง (ห้ามลบของเดิม)
> รูปแบบ: **D-xx** · ข้อสรุป · เหตุผล · ที่อยู่ในโค้ด

| ID | ข้อสรุป | เหตุผล (ตาม comment) | ที่อยู่ |
|---|---|---|---|
| D-01 | Business logic ของงบคำนวณที่ **frontend จุดเดียว** (`daily_budget` เป็นค่าสำเร็จรูป — งบต่อคนต่อวันตาม D-51) backend ห้ามหารจำนวนคนซ้ำ | กันการคำนวณซ้ำซ้อน/ไม่ตรงกัน | `poiPlaceQueries.ts` ขั้น 3, `itineraryPlaceQueries.ts` |
| D-02 | Backend `itineraryBuilder.ts` คือ **source of truth** ส่วน frontend เก็บ copy แบบ mirror ไว้ recompute ทันที และ backend ต้อง re-validate ซ้ำก่อน save เสมอ | ลากวางแล้วเห็นผลทันทีโดยไม่ต้องรอ network | หัวไฟล์ `backend/.../itineraryBuilder.ts` |
| D-03 | Itinerary editor เป็นแบบ **manual drag เท่านั้น** draft แรกไม่จัดลงวันให้ (`buildInitialDraft` คืน `[]`) และไม่มีปุ่ม "จัดลำดับอัตโนมัติ" ในหน้านี้ | final design | `itineraryBuilder.ts` |
| D-04 | เก็บ `buildNearestNeighborOrder` ไว้ แม้ตอนนี้ไม่มีที่เรียกใช้ | อาจนำไปใช้กับ Auto Trip | `itineraryBuilder.ts` |
| D-05 | ราคา v2 (ตั้งแต่ D-52 ใช้ priceRange แทน price_level — หลักไม่เดาราคาเหมือนเดิม): **ไม่เดาราคา** เมื่อไม่มี `price_level` จริง ยกเว้น category `free` (ให้ประมาณเป็น 0) ถ้าเป็น paid ที่ไม่มีราคา ให้ `placeCost=null`, ปล่อยผ่าน hard filter, ไม่นับเข้ายอดสะสม และให้ price weight = 0 | การเดาราคาซ่อนความไม่รู้ไว้และลงโทษผิด | `poiScoreCalculator.ts`, `poiPlaceQueries.ts`, `itineraryBuilder.ts` |
| D-06 | `price_nature` เหลือแค่ `free` / `paid` (ยุบ food + paid_other) และ DB migrate แล้ว | logic ของสองหมวดเหมือนกันทุกกรณี | `poiPlaceQueries.ts` |
| D-07 | เลิกใช้ `categories.default_price_level` ("column กำลังจะ drop") | ดู D-05 | หลายไฟล์ |
| D-08 | Multi-category: เลือกแถว `confidence_score` สูงสุดต่อ place (MAX) ห้าม sum/average และต้องใช้เกณฑ์เดียวกันในทุก query | ค่าที่เห็นตอน POI list และตอน confirm ต้องตรงกัน | `poiPlaceQueries`, `itineraryPlaceQueries`, `placesController` |
| D-09 | ไม่รองรับทริปที่ข้ามเที่ยงคืน: validate ตอนสร้าง/แก้ทริป (`start_time + available_time_per_day ≤ 24:00`) | Postgres `time` ไม่รู้ว่าเวลาข้ามวัน | `tripController.validateNoMidnightCrossing` |
| D-10 | ถ้าไม่มีข้อมูลเวลาเปิด-ปิด ให้ **flag `is_hours_unknown`** ไม่ถือว่าปิด (ไม่ block) | 21% ของสถานที่ไม่มีข้อมูล | `utils/openingHoursChecker.ts` |
| D-11 | ห้าม confirm แผนที่ยังมี closed/time/budget conflict (unknown hours/cost ไม่นับ) และต้องเช็คก่อนลบแผนเดิม | กันแผนเก่าหาย | `confirmItinerary` |
| D-12 | `province` บังคับกรอก ส่วน `district` ไม่บังคับ ถ้ามีให้กรองแบบ AND | แก้ bug ที่ district ไม่ถูกกรอง | `tripController`, `poiPlaceQueries` |
| D-13 | Dropdown จังหวัด/อำเภอดึงจากข้อมูลจริงใน `places` ไม่ hardcode | กันการเลือกจังหวัดที่ไม่มีข้อมูลแล้วได้ผลลัพธ์ 0 แบบเงียบๆ | `placeDropdownController.ts` |
| D-14 | ใช้ ORS แทน Google Distance Matrix และ fallback เป็น haversine **ต่อคู่** (ห้าม throw) · fallback speed 25 km/h · เวลาเดินทางขั้นต่ำ 1 นาที | เกิน free tier ของ Google และระบบต้องไม่ล่มเมื่อ ORS ล่ม | `utils/orsTravelMatrix.ts`, `orsDistance.ts` |
| D-15 | ORS base URL = `https://api.heigit.org/openrouteservice` (โดเมนเก่าปิดแล้วตาม comment) | | `config/ors.ts` |
| D-16 | Weather v1 ใช้แค่โอกาสฝน เฉลี่ยทั้งช่วงทริป ใช้ grid 0.1° ถ้าไม่มีพยากรณ์ให้ score 1.0 ทุกที่ และค่า exposure INDOOR/MIXED/OUTDOOR = 0/0.5/1 | POI คำนวณก่อนจะรู้ว่าแต่ละที่ลงวันไหน | `weatherForecast.ts`, `poiScoreCalculator.ts` |
| D-17 | POI weights: category .35, rating .25, distance .15, budget .15, weather .10 และ renormalize เมื่อ budget weight < .15 (D-52: budget = price score จาก priceRange เทียบงบต่อคน · ตัดออกเมื่อไม่ได้ตั้งงบหรือไม่ทราบราคา) | | `poiScoreCalculator.ts` |
| D-18 | Insert `trip_categories` แบบ best-effort ไม่ rollback ทริปหลัก แต่คืน `categoryWarning` | ระบบเรียบง่าย ไม่ทำ fallback ซับซ้อน | `tripController.ts` |
| D-19 | `trip_days` สร้างแบบ lazy ตอนเรียก draft/confirm/saved ครั้งแรก | | `getOrCreateTripDays` |
| D-20 | `/api/place-dropdown` แยกจาก `/api/places` โดยตั้งใจ | กัน path ชนกัน | `server.ts` |

## Decision log ใหม่ (เพิ่มต่อจากนี้)

<!-- ตัวอย่าง:
### D-21 · 2026-10-20 · <หัวข้อ>
- บริบท:
- ทางเลือกที่พิจารณา:
- ข้อสรุป:
- ผู้ตัดสินใจ:
- ไฟล์ที่กระทบ:
-->

### D-21 · 2026-10-16 · Git workflow: ทำงานบน `dev` อย่างเดียว
- บริบท: `main` คือ production และยังไม่ deploy จริง จึงต้องกันไม่ให้ Claude แตะ `main` หรือสร้าง branch/commit เอง
- ทางเลือกที่พิจารณา: 1 งาน = 1 branch (`fix/`, `feat/`, …) ตามที่เขียนไว้เดิมใน `CLAUDE_CODE_MIGRATION.md` §7 → ยกเลิก
- ข้อสรุป:
  - ทำงานบน branch `dev` เท่านั้น ห้ามสร้าง branch ใหม่
  - ห้าม checkout, merge, commit หรือ push เข้า `main` เด็ดขาด (`main` = production)
  - ยังไม่ deploy จริง รันเฉพาะ local
  - ก่อนเริ่มงาน `git status` ต้องว่าง ถ้าไม่ว่างให้หยุดถามผู้ใช้
  - 1 งาน = 1 commit และห้าม commit เองจนกว่าผู้ใช้จะสั่ง
  - ห้าม push ทุก branch จนกว่าผู้ใช้จะสั่งชัดเจน
  - ย้อนกลับด้วย `git restore` (ยังไม่ commit) หรือ `git revert` (commit แล้ว)
- ผู้ตัดสินใจ: เจ้าของโปรเจกต์
- ไฟล์ที่กระทบ: `CLAUDE.md`, `docs/CLAUDE_CODE_MIGRATION.md`, `docs/DEVELOPMENT_PLAN.md`, `.claude/skills/update-project-docs/SKILL.md`, `.claude/settings.json`

### D-22 · 2026-10-17 · ไม่ทดสอบ build บน Linux/CI
- บริบท: หลัง T1 build ผ่านบน Windows แต่ยังไม่เคยรันบน Linux/CI (Needs Verification #6)
- ข้อสรุป: ไม่ต้องทดสอบ build บน Linux/CI เพราะเป็นโปรเจกต์ส่งงานที่ไม่ใช้ Linux/CI · ยังคงตั้งชื่อไฟล์และ import ให้ตรงกันทุกตัวอักษรตาม convention ใน CLAUDE.md
- ผู้ตัดสินใจ: เจ้าของโปรเจกต์
- ไฟล์ที่กระทบ: `CLAUDE.md`, `docs/DEVELOPMENT_STATUS.md`, `docs/DEVELOPMENT_PLAN.md`, `.claude/skills/verify-changes/SKILL.md`

### D-23 · 2026-10-17 · ทิศทางของ Admin Panel (R5) และการพักงานสูตร POI
- บริบท: README R5 ระบุขอบเขตเป็นข้อเสนอเบื้องต้น · เดิมการเพิ่มจังหวัดทำโดยรัน `npm run upload:*` / `fetch-gmaps-categories:*` ใน data-pipeline และแก้กฎ dedupe ในโค้ด `manualOverrides.ts`
- ข้อสรุป (ผู้ใช้ยืนยันแล้ว):
  - พักงานสูตร POI และส่วนที่เกี่ยวข้อง (R1, R3) จนกว่ากิ่งจะ research เสร็จ แล้วทำ R5 ก่อน
  - R5 = หน้า UI ที่ login ด้วย role `admin` ใช้ (1) เลือกเพิ่มจังหวัด (2) จัดการสถานที่ซ้ำ (3) จัดการ category mapping
  - logic ฝั่งหลังทั้งหมดอยู่ใน `data-pipeline/` (เปลี่ยนจากรัน script เองเป็นสั่งผ่านหน้าเว็บ)
  - ตอนนำเข้าจังหวัด ให้ดึง `gmaps_types` มาพร้อมข้อมูลสถานที่ในการเรียก Google Details ครั้งเดียว
  - เก็บ `data-pipeline/chiangmai_*.txt` ไว้จนกู้ #20 และเขียน test ของ dedupe เสร็จ แล้วค่อยลบและ ignore `data-pipeline/*.txt`
- ยังไม่ได้ตัดสินใจ (ดู DEVELOPMENT_PLAN R5 Q1–Q6): ทางที่ frontend เรียก service, ที่เก็บกฎ merge/override, กฎ Stage 3, การกู้ #20, เวลาที่ apply category mapping, test runner ของ data-pipeline
- ผู้ตัดสินใจ: เจ้าของโปรเจกต์
- ไฟล์ที่กระทบ: `docs/DEVELOPMENT_PLAN.md`, `docs/DEVELOPMENT_STATUS.md`

### D-24 · 2026-10-18 · โครงสร้างของ Admin Panel: ย้ายงาน admin เข้า backend และเลิกใช้ data-pipeline (แทนที่ D-23 ข้อ "logic ฝั่งหลังทั้งหมดอยู่ใน `data-pipeline/`")
- บริบท: ถ้า backend ตรวจสิทธิ์ admin แต่ action ของ admin อยู่ใน service แยกของ data-pipeline ต้องตรวจสิทธิ์ 2 ที่และ API แตก 2 server · repo ไม่มี workspace รวม การ import โค้ดข้าม package จึงทำไม่ได้ดี · backend มี Express, `requireAuth`, service role client (`config/db.ts`) และ jest อยู่แล้ว
- ข้อสรุป (ผู้ใช้ยืนยันแล้ว):
  - API ของ admin ทั้งหมดอยู่ใน `backend/src/admin/` mount ที่ `/api/admin` ตรวจสิทธิ์ด้วย `requireAuth` + `requireAdmin` (อ่าน `users.role` จาก DB ทุก request ตาม Known Issue #22)
  - โค้ดจาก `data-pipeline/` (dedupe, อ่าน CSV, Google Places) ย้ายเข้า `backend/src/admin/pipeline/` แบบ **copy แล้วปรับ** (ไม่เขียนใหม่จากศูนย์) และต้องมี jest test ยืนยันผลเท่าเดิมก่อนลบ
  - ลบ `data-pipeline/` ใน phase สุดท้าย (P6) หลังย้ายและตรวจครบ — ต้องขอยืนยันจากผู้ใช้อีกครั้งก่อนลบ · ก่อนถึง P6 ไม่แก้การทำงานของ data-pipeline
  - frontend: `src/features/` = หน้าของ user (ไม่เปลี่ยนชื่อ) · `src/admin/` = หน้าของ admin · `src/system/` = ของที่ใช้ร่วมกัน (ย้าย `AuthContext`, `useAuth`, `ProtectedRoute` มาไว้ที่ `src/system/auth/` และเพิ่ม `LoginForm`)
  - login มี 2 หน้า: `/login` (user) และ `/admin/login` (admin) ใช้ `LoginForm` ร่วมกันและเรียก `/api/auth/login` เดิม · บัญชีที่ role เป็น `admin` login จากหน้าไหนก็ไป `/admin` (redirect เป็นแค่ UX สิทธิ์จริงตรวจที่ backend)
  - ตอบ D-23 Q1 = frontend เรียก backend `/api/admin/*` (ไม่มี service แยก) · Q6 = ใช้ jest ของ backend ที่มีอยู่ (ไม่ต้องเพิ่ม test runner)
  - Known Issue #15 (`.gitignore` ของ data-pipeline) ไม่ต้องแก้แยก เพราะโค้ดใหม่อยู่ใน backend — เอาบรรทัด ignore ออกตอนลบ data-pipeline ใน P6 · `data-pipeline/chiangmai_*.txt` เก็บไว้จนถึง P6 (ใช้เทียบผลใน P2)
- ยังไม่ได้ตัดสินใจ: D-23 Q2 (ที่เก็บกฎ merge/override — แนะนำตาราง Supabase), Q3 (กฎ Stage 3), Q4 (กู้ #20 ทั้งหมดไหม), Q5 (apply category mapping ก่อน research POI เสร็จได้ไหม)
- ผู้ตัดสินใจ: เจ้าของโปรเจกต์
- ไฟล์ที่กระทบ: `CLAUDE.md`, `docs/DEVELOPMENT_PLAN.md`, `docs/DEVELOPMENT_STATUS.md`, `docs/ARCHITECTURE.md`, `docs/PROJECT_OVERVIEW.md`, `.claude/skills/feature-development/SKILL.md`

### D-25 · 2026-10-18 · เขียนโค้ด pipeline ใหม่ใน backend ได้ (แทนที่ D-24 ข้อ "copy แล้วปรับ (ไม่เขียนใหม่จากศูนย์)")
- บริบท: ผู้ใช้ต้องการโค้ดหลังบ้านของ admin ที่สะอาด แก้ logic ได้ และเอามาเฉพาะส่วนที่ใช้ ไม่ต้องคงโครงของ data-pipeline
- ข้อสรุป (ผู้ใช้ยืนยันแล้ว):
  - เขียนโค้ดใหม่ใน `backend/src/admin/pipeline/` ได้ทั้งหมด ไฟล์/script/type ใน data-pipeline ที่ไม่ใช้ไม่ต้องย้ายมา
  - ต้องมี characterization test (jest) ยืนยันว่าผลเท่ากับ data-pipeline เดิม (fixture จากการรัน `testDedupe.ts` จริง) · การเปลี่ยนพฤติกรรม (เช่นกู้ #20) ต้องแยก commit และอัปเดต fixture/ตัวเลขใน test ให้เห็นชัด
  - เพิ่ม `csv-parse@^6.1.0` เป็น dependency ของ backend (ตัวเดียวกับ data-pipeline เพื่อให้ parse CSV เหมือนเดิม)
  - `attraction.csv` copy ไป `backend/data/` (เนื้อหาเหมือนกันทุก byte — git ใช้ blob เดียวกัน) ส่วนของ data-pipeline เก็บไว้จนถึง P6
- ผู้ตัดสินใจ: เจ้าของโปรเจกต์
- ไฟล์ที่กระทบ: `backend/src/admin/pipeline/*`, `backend/package.json`, `backend/data/attraction.csv`, `docs/DEVELOPMENT_PLAN.md`, `docs/DEVELOPMENT_STATUS.md`, `docs/PROJECT_OVERVIEW.md`, `CLAUDE.md`, `.claude/skills/verify-changes/SKILL.md`

### D-26 · 2026-10-18 · การจัดการสถานที่ซ้ำ/มีปัญหาให้ admin ตัดสินใจผ่านหน้าเว็บ (แทนที่กฎ hard code ใน `dedupeRules.ts`)
- บริบท: เดิมกฎ merge/ห้าม merge/แก้พิกัด/ตัดทิ้ง เขียนตายตัวในโค้ด (`manualOverrides.ts` → `dedupeRules.ts`) และบางส่วนหายไปใน `44d26dd` (#20) · ผู้ใช้ต้องการให้ admin เป็นคนตัดสินใจทีละกลุ่มผ่านหน้าเว็บ
- ข้อสรุป (ผู้ใช้ยืนยันแล้ว):
  - flow: admin เลือกจังหวัด → backend อ่านสถานที่จาก `attraction.csv` **อย่างเดียว** → หาสถานที่ซ้ำ/มีปัญหาแล้วแสดงให้ admin → admin ตัดสินใจทีละกลุ่ม/แถว → บันทึกการตัดสินใจลง DB → ยืนยันนำเข้าแล้ว **ค่อยเรียก Google** (ก่อนหน้านั้นไม่มีค่าใช้จ่าย)
  - merge เลือกค่าได้ **ทีละช่อง** (เช่น ชื่อจากแถว A พิกัดจากแถว B) ไม่ใช่แค่เลือกแถวหลัก
  - หาสถานที่ซ้ำจาก **ชื่อ** ด้วย (นอกจาก website/phone) และเพิ่มการตรวจให้ครอบคลุมได้
  - **ทิ้งกฎ hard code เดิม** (`locationOverrides`, `blockedMergePairs`, `forceMergeGroups`, `excludeIds` รวมของที่หายใน #20) ให้ admin ตัดสินใจใหม่ผ่านหน้าเว็บ — ยกเลิก R5 P2b (กู้ #20)
  - **พิกัดยึด CSV เป็นหลัก** (เมื่อผ่านการตรวจ: ไม่พัง, อยู่ในไทย, ไม่ห่างจังหวัดผิดปกติ) · ใช้พิกัด Google เฉพาะเมื่อ CSV พังและจับคู่ผ่านแล้ว หรือ admin กรอกเอง
  - **ตรวจการจับคู่กับ Google ก่อนรับข้อมูล** (Known Issue #30): ค้นด้วยชื่อไทยก่อน · ระยะพิกัด Google ↔ CSV ≤ 2 km ถือว่าตรง · > 2 km / ไม่เจอ / `google_place_id` ซ้ำกับแถวอื่น → ไม่รับข้อมูล Google (rating, เวลาเปิด, ราคา, ที่อยู่, `gmaps_types`) แล้วส่งให้ admin เลือก: ค้นใหม่ / ใส่ place ID เอง / นำเข้าแบบ CSV อย่างเดียว / ตัดทิ้ง — เพราะถ้าจับคู่ผิด ข้อมูล Google ทุกช่องผิดตาม ไม่ใช่แค่พิกัด
  - **ข้อมูลเดิมใน `places` ยังไม่แก้** — เมื่อระบบใหม่เสร็จจะนำเข้าทุกจังหวัดใหม่แล้วลบข้อมูลเก่า · ⚠️ ลบ `places` จะ CASCADE ลบ `itineraries`/`poi_scores` ของทริปผู้ใช้ (`DATABASE_SCHEMA.md`) ต้องสำรองข้อมูลและให้ผู้ใช้ยืนยันอีกครั้งตอนลงมือ · **ผู้ใช้เลือก (2026-10-18): ลบแล้วนำเข้าใหม่** ยอมให้แผนเที่ยวของทริปเดิมหาย · ต้องทำหลัง category mapping (P5) พร้อมแล้ว เพราะ CASCADE ลบ `place_categories` ด้วย และ POI query เริ่มจาก `place_categories` (`poiPlaceQueries.ts`) สถานที่ที่ไม่มี category จะไม่ถูกแนะนำเลย
  - โค้ด dedupe ของ P2a ยังใช้เป็นตัว **เสนอ** กลุ่ม · `dedupeRules.ts` จะถูกแทนด้วยการตัดสินใจใน DB · characterization test ของ P2a เก็บไว้ยืนยันว่าอัลกอริทึมไม่เปลี่ยนโดยไม่ตั้งใจ
- ยังเป็นข้อเสนอ (รอผู้ใช้ยืนยันตอนวางแผน P3): หมวดของปัญหา, schema ตารางเก็บการตัดสินใจ
- ผู้ตัดสินใจ: เจ้าของโปรเจกต์
- ไฟล์ที่กระทบ: `docs/DEVELOPMENT_PLAN.md`, `docs/DEVELOPMENT_STATUS.md`, `docs/ARCHITECTURE.md`, `backend/src/admin/pipeline/dedupeRules.ts` (comment)

### D-27 · 2026-10-18 · กติกาการนำเข้า (R5 P4) — แทนที่ D-26 ข้อ "ระยะ Google ↔ CSV ≤ 2 km ถือว่าตรง" และข้อ "ชื่อ/เบอร์/เว็บใช้ CSV ก่อน" ที่เสนอไว้
- บริบท: ตรวจข้อมูลเดิม (อ่านอย่างเดียว 2026-10-18) พบ Google คืนสถานที่ผิดได้แม้ห่างจาก CSV ไม่ถึง 1 km (เช่น "พิพิธภัณฑ์ท้องถิ่นเมืองมีนบุรี" → "ไทวัสดุ" 1.02 km) แต่ก็มีที่ถูกต้องแม้ห่างเกิน 1 km (เอเชียทีค 1.24 km) — ใช้ระยะอย่างเดียวไม่พอ
- ข้อสรุป (ผู้ใช้ยืนยันแล้ว):
  - **เกณฑ์จับคู่ Google:** ระยะ ≤ 100 m รับอัตโนมัติ · 100 m–1 km รับเมื่อชื่อคล้ายกัน · นอกนั้น (ชื่อไม่คล้าย, > 1 km, ไม่เจอ, `google_place_id` ซ้ำ) ส่งให้ admin ตัดสิน
  - **ต้องตัดสินใจในหน้ารีวิวให้ครบก่อน** (กลุ่มและแถวที่มีปัญหาที่ค้างต้องเป็น 0) จึงจะเริ่มนำเข้าได้
  - **ชื่อ, เบอร์, เว็บใช้ Google ก่อน** แล้วใช้ CSV เมื่อ Google ไม่มี (แบบเดิม) · พิกัดยังยึด CSV ตาม D-26
  - **เขียน type จาก Google ลงตาราง `place_types`** (`source = 'google'`, เพิ่มเฉพาะคู่ `place_id`+`api_type_id` ที่ยังไม่มี — เช็คในโค้ด) นอกจาก `places.gmaps_types` · **`type_category_weights` ยังไม่แตะ** ผู้ใช้จะคุยหลักการ mapping ใหม่ก่อน (P5)
  - **`place_types` ใช้ PK เดียว** (`place_type_id` identity) ไม่ใช้ composite key — ผู้ใช้รัน SQL แก้แล้ว 2026-10-18 (สำรองไว้ที่ `place_types_backup_20261018`) · หลักเดียวกับตารางใหม่ของ R5 ทุกตาราง
  - ไม่เพิ่มตัวตรวจพิกัดหยาบ (ทศนิยม < 3 ตำแหน่ง, 34 แถวทั้งประเทศ) และไม่ทำปุ่มดึงพิกัดจาก short link ในหน้ารีวิว
- ผู้ตัดสินใจ: เจ้าของโปรเจกต์
- ไฟล์ที่กระทบ: `docs/DEVELOPMENT_PLAN.md`, `docs/DEVELOPMENT_STATUS.md`

### D-28 · 2026-10-18 · primary key ทุกตารางเป็น uuid (ขยาย D-27 ข้อ "PK เดียว")
- บริบท: `users`, `trips`, `places` ใช้ uuid อยู่แล้ว แต่ตารางอื่นยังเป็น int/bigint (`categories`, `trip_days`, `itineraries`, `poi_scores`, `place_categories`, `trip_categories`, `type_category_weights`, `place_types`, `admin_place_decisions`, `pipeline_jobs`, `pipeline_job_items`)
- ข้อสรุป (ผู้ใช้ยืนยันแล้ว): ทุกตารางใช้ PK เดียวเป็น `uuid DEFAULT gen_random_uuid()` · ตารางใหม่ต่อจากนี้ก็เช่นกัน
- การทำ: งาน **T23** — SQL อยู่ที่ `docs/sql/2026-10-19_uuid_primary_keys.sql` (สำรองทุกตารางก่อน, transaction เดียว, FK และ UNIQUE หลายคอลัมน์ที่โค้ดใช้อยู่สร้างกลับเหมือนเดิม) · **ต้องแก้โค้ดให้เสร็จก่อนรัน SQL** (type ของ id เป็น string และการเลือก "ล่าสุด" ต้องใช้ `decided_at`/`created_at` แทนลำดับเลข)
- ข้อควรระวัง: เครื่องมือนอก repo ที่อ้าง id เป็นตัวเลข (เช่นของ Stage 3 ที่ใช้ `category_id` ใน `type_category_weights`) จะใช้ค่าเดิมไม่ได้ · ข้อมูลที่ export ไว้ก่อนหน้า (ถ้ามี) จะอ้าง id เก่า
- ผู้ตัดสินใจ: เจ้าของโปรเจกต์
- ไฟล์ที่กระทบ: `docs/sql/2026-10-19_uuid_primary_keys.sql`, `docs/DEVELOPMENT_PLAN.md` (T23), `docs/DATABASE_SCHEMA.md`, `docs/DEVELOPMENT_STATUS.md`

### D-29 · 2026-10-18 · แก้วัน/เวลา/งบต่อวันของทริป = ล้างแผนเดิม (แก้ Known Issue #6)
- บริบท: `trip_days` ถูกสร้างครั้งเดียวใน `getOrCreateTripDays` แล้วไม่อัปเดตเมื่อแก้ทริป · ทางที่ sync ทีละวัน (update/insert/delete) ซับซ้อนและต้องตัดสินว่าสถานที่ในวันที่ถูกตัดไปอยู่ไหน
- ข้อสรุป (ผู้ใช้เลือกทางที่ง่ายที่สุด): ถ้า `start_date`, `end_date`, `start_time`, `available_time_per_day` หรือ `daily_budget` เปลี่ยน `updateTrip` จะลบ `trip_days` ของทริปนั้น (CASCADE ลบ `itineraries` = แผนเดิม) แล้วครั้งหน้าที่จัดแผนจะสร้างวันใหม่จากข้อมูลล่าสุด · frontend ถามยืนยันก่อนบันทึก · ช่องอื่น (จังหวัด หมวดหมู่ จุดเริ่ม ฯลฯ) แผนเดิมยังอยู่ · หลังบันทึกไปหน้า recommendations เหมือนเดิม
- ผู้ตัดสินใจ: เจ้าของโปรเจกต์
- ไฟล์ที่กระทบ: `backend/src/features/trip/tripController.ts` (`updateTrip`), `backend/src/features/trip/tripDayStructure.ts`, `frontend/src/features/trip/create/createTrip.tsx`

### D-30 · 2026-10-21 · รายละเอียดการนำเข้า R5 P4a (ขยาย D-26/D-27)
- บริบท: ระหว่างวางแผน P4a พบว่า (1) โค้ดยังไม่ได้ใช้ `primary_att_id`/`field_sources` ของ merge (2) แผนเดิมใช้ upsert `onConflict google_place_id` ซึ่งอาจเขียนทับสถานที่ของจังหวัดอื่นเงียบๆ (3) เงื่อนไข "จังหวัดต้องยังไม่มีแถวใน `places`" ทำให้นำเข้าส่วนที่เหลือหลัง "ทดลอง N แถวแรก" ไม่ได้
- ข้อสรุป (ผู้ใช้เลือกตามข้อเสนอทุกข้อ):
  - **merge:** ใช้ `primary_att_id` เป็นแถวหลัก (= `places.att_id`) และเอาค่าแต่ละช่องตาม `field_sources` ช่องที่ไม่ได้เลือกใช้ค่าแถวหลัก
  - **`google_place_id` ซ้ำ** (ใน job เดียวกัน หรือมีใน `places` อยู่แล้ว) → `needs_review_duplicate` ให้ admin ตัดสิน · บันทึก `places` ด้วย insert เท่านั้น (ไม่ upsert)
  - **รันต่อได้:** เริ่ม job ได้ถ้าแถวของจังหวัดใน `places` มาจาก job ของระบบนี้ทั้งหมด · ข้าม ATT_ID ที่มีผลแล้ว (ทุกสถานะยกเว้น `error` ซึ่งลองใหม่ได้)
  - **ชื่อคล้าย:** normalize แล้วชื่อหนึ่งอยู่ในอีกชื่อ หรือ `1 − Levenshtein / ความยาวที่ยาวกว่า ≥ 0.6` เทียบกับชื่อไทยและอังกฤษ (ไม่นับว่าง/"ไม่มี")
  - **Google:** Places API (Legacy) — key เดิมใช้ได้ และรูปแบบ `opening_hours` ตรงกับ `openingHoursChecker.ts`
  - **ค้นหา:** "ชื่อไทย อำเภอ จังหวัด" (ไม่มีชื่อไทยใช้ชื่ออังกฤษ) + `locationbias=circle:1000@พิกัด CSV` · ไม่เจอไม่ค้นซ้ำ (ส่งให้ admin, P4c มีปุ่มค้นใหม่) · หน่วง 200 ms หลังทุก request เป็นค่าคงที่ ไม่เพิ่ม env
- ผู้ตัดสินใจ: เจ้าของโปรเจกต์
- ไฟล์ที่กระทบ: `backend/src/admin/pipeline/import/`, `backend/src/admin/imports/`, `docs/DEVELOPMENT_PLAN.md`

### D-31 · 2026-10-21 · merge เลือกค่าได้เฉพาะช่องที่ใช้ตอนนำเข้า (แทนที่ D-26 ข้อ "merge เลือกค่าได้ทีละช่อง" ส่วนที่ให้เลือกได้ทุกคอลัมน์)
- บริบท: หน้า merge (P3b) ให้เลือกค่าได้ทุกคอลัมน์ของ CSV แต่การนำเข้า (P4a) อ่านแค่บางคอลัมน์ — เลือกช่องอื่น (เช่น ค่าเข้า, อีเมล, วันที่อัปเดต) ไม่มีผลกับ `places` และทำให้หน้ารีวิวรก
- ข้อสรุป (ผู้ใช้สั่ง): เลือกค่าทีละช่องได้เฉพาะ 19 คอลัมน์ที่นำเข้าจริง — ชื่อไทย/อังกฤษ, พิกัด, เบอร์, เว็บ, ที่อยู่ (ATT_ADDRESS, ATT_ADDRESS_ALLEY, ATT_ADDRESS_ROAD, SUBDISTRICT_NAME_TH, DISTRICT_NAME_TH, ATT_POSTCODE), ATT_TYPE_LABEL, ATT_CATEGORY_LABEL, ATT_DETAIL_TH, Facebook/Instagram/TikTok/YouTube/LINE · หน้า merge เอาปุ่ม "แสดงทุกช่อง" ออก (แสดงช่องสำคัญ + ช่องที่นำเข้าซึ่งค่าต่างกันเท่านั้น) · backend ปฏิเสธ `fieldSources` ของช่องอื่น (400) · การตัดสินใจเก่าที่เลือกช่องอื่นไว้ไม่มีผลตอนนำเข้า (ไม่ต้องแก้ข้อมูลใน DB)
- ผู้ตัดสินใจ: เจ้าของโปรเจกต์
- ไฟล์ที่กระทบ: `backend/src/admin/pipeline/import/placeRecord.ts` (`IMPORT_FIELDS`), `review/decisionInput.ts`, `import/importRows.ts`, `frontend/src/admin/lib/placeFields.ts` (`MERGE_FIELDS` ต้องตรงกัน), `frontend/src/admin/provinces/components/GroupCard.tsx`

### D-32 · 2026-10-21 · merge พิมพ์ค่าเองได้ทุกช่องที่นำเข้า (ขยาย D-31)
- บริบท: ตอน merge บางช่องว่างทุกแถว หรือมีค่าแต่ผิด (เช่นเบอร์โทร) — เดิมเลือกได้แค่ค่าจากแถวที่มีอยู่ ส่วนพิกัดพิมพ์เองได้ผ่าน `lat`/`lng`
- ข้อสรุป (ผู้ใช้เลือก): ตอน merge ทุกช่องใน 19 ช่องที่นำเข้า (D-31) มีตัวเลือก "พิมพ์เอง" แม้แถวจะมีค่าอยู่แล้ว · ยกเว้นพิกัด (ใช้ช่อง "กรอกพิกัดเอง" เดิม) · เว้นว่าง = ไม่มีข้อมูลช่องนั้น · ใช้เฉพาะการ์ดกลุ่มที่รวม ≥ 2 แถว (แถวเดี่ยวยังแก้ได้แค่พิกัดในแท็บ "มีปัญหา") · ตอนนำเข้า ค่าที่พิมพ์เองทับค่าจากแถวหลัก/`field_sources`
- การเก็บข้อมูล: คอลัมน์ใหม่ `admin_place_decisions.field_values jsonb` (ผู้ใช้รัน `ALTER TABLE` ใน `DATABASE_SCHEMA.md`) · backend ตรวจว่าเป็นช่องใน `IMPORT_FIELDS` ไม่ใช่พิกัด ไม่ซ้ำกับ `field_sources` และยาวไม่เกิน 1000 ตัวอักษร
- ผู้ตัดสินใจ: เจ้าของโปรเจกต์
- ไฟล์ที่กระทบ: `backend/src/admin/pipeline/review/decisionInput.ts`, `reviewTypes.ts`, `import/importRows.ts`, `frontend/src/admin/lib/reviewTypes.ts`, `frontend/src/admin/provinces/components/GroupCard.tsx`

### D-33 · 2026-10-21 · รับผล Google เมื่อห่างไม่เกิน 1 km **และ** ชื่อคล้ายเท่านั้น (แทนที่ D-27 ข้อ "≤ 100 m รับอัตโนมัติ")
- บริบท: ทดลองนำเข้าน่าน 5 แถวกับ Google จริง (job `44434e91-be17-46db-b71d-1b79dca93664`) — "เวียงภูเพียงแช่แห้ง" (ชุมชนโบราณ) ได้ "วงเรียนพระธาตุแช่แห้ง" (วงเวียน) ที่ระยะ 0 m และถูกรับอัตโนมัติ เพราะพิกัด CSV บางแถวคัดลอกมาจากหมุดของสิ่งที่อยู่ใกล้ๆ · ความคล้ายชื่อ 0.41 · อีก 4 แถวผลเท่าเดิมเมื่อเช็คชื่อทุกระยะ
- ข้อสรุป (ผู้ใช้เลือก): ห่างไม่เกิน 1 km และชื่อคล้าย (เกณฑ์ชื่อตาม D-30) → รับ · ชื่อไม่คล้ายแม้ห่าง 0 m, ห่างเกิน 1 km หรือไม่มีพิกัด → `needs_review_mismatch` · แถวที่นำเข้าผิด (`20250620144750001`) ผู้ใช้ลบออกจาก `places` และตั้ง item เป็น `error` ให้ job ถัดไปลองใหม่ด้วยเกณฑ์นี้
- ผู้ตัดสินใจ: เจ้าของโปรเจกต์
- ไฟล์ที่กระทบ: `backend/src/admin/pipeline/import/matchCandidate.ts`, `importJob.ts`

### D-34 · 2026-10-21 · เทียบชื่อกับ Google โดยแปลงเลขไทยก่อน · ไม่ลดเกณฑ์ความคล้าย (ขยาย D-33)
- บริบท: ทดลองน่านรอบ 3 (10 แถว ผ่านหน้า P4b) — รับเอง 5 แถวถูกทั้งหมด แต่ส่งรีวิว 5 แถวที่ 4 แถวเป็นที่เดียวกันจริง (ตลาดน้ำ 4000 ปี ↔ ตลาดน้ำ ๔,๐๐๐ ปี, จุดชมวิว 1715, ถนนโค้งพับผ้า, วัดพระบรมธาตุแช่แห้ง) · ลองวัดความคล้ายแบบ Levenshtein และ LCS กับกรณีจริงทั้งถูกและผิด พบว่าช่วงคะแนนซ้อนกัน (LCS: ถูก 0.33–1.00, ผิด 0.64–0.75) — ลดเกณฑ์แล้วจะรับตลาดชุมชน/ร้านกาแฟที่ผิดเข้ามาด้วย
- ข้อสรุป (ผู้ใช้เลือก): แปลงเลขไทย ๐–๙ เป็น 0–9 ก่อนเทียบชื่อ (เฉพาะการจับคู่ Google — `normalizeName` ของ dedupe ไม่เปลี่ยน) · เกณฑ์ความคล้ายคงเดิม · แถวที่ถูกแต่ระบบไม่กล้ารับให้ admin ยอมรับใน P4c (ข้อมูลผิดใน `places` เสียหายมากกว่าการกดยอมรับเพิ่ม)
- ผู้ตัดสินใจ: เจ้าของโปรเจกต์
- ไฟล์ที่กระทบ: `backend/src/admin/pipeline/import/matchCandidate.ts`

### D-35 · 2026-10-21 · ใช้ป้ายประเภทของ ททท. (`ATT_TYPE_LABEL`) เป็นหมวดของระบบ (แทนที่แนวทาง P5 เดิมที่ map type ของ Google → `categories` ด้วย weight / Stage 3)
- บริบท: สถานที่หนึ่งใน Google มีหลาย type การเลือกให้เหลือ 1 หมวดต้องใช้ weight / `confidence_score` ซึ่งต้องมีงานวิจัยอ้างอิง (อาจารย์ไม่ให้ใช้ตัวเลขที่ทีมคิดเอง) · `attraction.csv` มีป้ายประเภท 1 ป้ายต่อสถานที่ (53 ป้ายใน `ATT_CATEGORY_LABEL` 3 กลุ่ม: ประวัติศาสตร์และวัฒนธรรม 4,302 แถว / ธรรมชาติ 2,634 / กิจกรรมพิเศษและนันทนาการ 1,686) และ `places` เก็บป้ายนี้ไว้แล้วใน `att_type_label` / `att_category_label`
- ข้อสรุป (ผู้ใช้เลือก):
  - หมวดของระบบมาจากป้ายของ ททท. โดยตรง: 1 สถานที่ = 1 หมวด จึงไม่ต้องเลือกด้วย confidence · ไม่ใช้ `place_types` / `type_category_weights` / `gmaps_types` ในการจัดหมวด
  - ป้ายที่มีความหมายเดียวกันให้รวมเป็นหมวดเดียว ผู้ใช้จะตัดสินว่ารวมป้ายไหนบ้างใน P5 (คาดว่าเหลือไม่ถึงราว 35 หมวด) · หน้าสร้างทริปแสดงหมวดแยกตาม 3 กลุ่มใหญ่ของ ททท.
  - คง `environment_type` / `price_nature` ไว้ใน `categories` (ผู้ใช้ยืนยันว่าสองค่านี้ไม่ติดเรื่องงานวิจัย)
  - แก้โครงสร้าง DB และย้ายข้อมูลเดิมได้ (`categories`, `place_categories`, `trip_categories`) โดย Claude เขียน SQL ให้ และผู้ใช้เป็นคนรันเอง
- ยังต้องตัดสินใน P5:
  - รายการป้ายที่จะรวมกัน
  - ป้าย "ประวัติความเป็นมา" (366 แถว) ซึ่งไม่ใช่ประเภทสถานที่
  - ป้ายที่อยู่หลายกลุ่มใหญ่ (ส่วนใหญ่มีแค่ 1–6 แถวในกลุ่มที่สอง — เสนอให้ใช้กลุ่มที่มีแถวมากที่สุด)
  - ป้ายที่มีน้อยมาก (เช่น งานประเพณี 4, โรงหนังเก่า 2)
  - ค่า `category_score` ในสูตร POI (สูตรพักไว้ตาม D-23 — ต้องคุยกับทีม)
- ผู้ตัดสินใจ: เจ้าของโปรเจกต์
- ไฟล์ที่กระทบ (คาดการณ์): ตาราง `categories` / `place_categories` / `trip_categories`, `backend/src/features/poi/poiPlaceQueries.ts`, `features/categories/categoriesController.ts`, `frontend/src/features/trip/create/createTrip.tsx`, `backend/src/admin/pipeline/import/` (ใส่หมวดตอนนำเข้า), หน้า admin Category Mapping

### D-36 · 2026-10-21 · ผู้ใช้กรอกเวลาที่จะอยู่แต่ละสถานที่เอง และเลิกใช้ `categories.default_duration_min`
- บริบท: `default_duration_min` (ค่าเริ่มต้น 60 นาที และค่าต่อหมวด) เป็นตัวเลขที่ทีมกำหนดเองโดยไม่มีงานวิจัยรองรับ (เหตุผลเดียวกับ D-35)
- ข้อสรุป (ผู้ใช้เลือก): ในหน้าจัดแผน (`ItineraryEditor`) ผู้ใช้กรอกเวลาที่จะอยู่ (นาที) ของแต่ละสถานที่ · ไม่มีค่าเริ่มต้น และยืนยันแผนไม่ได้จนกว่าจะกรอกครบ · เก็บค่าที่กรอกใน `itineraries` (เพิ่มคอลัมน์ใหม่ ผู้ใช้รัน SQL) · ค่านี้เป็น input ของผู้ใช้ backend จึงรับจาก client ได้ แต่ต้อง validate แล้วคำนวณเวลาเริ่ม/จบและ conflict ซ้ำเองเหมือนเดิม
- ยังต้องตัดสินใน P5:
  - POI filter ขั้นที่ 4 (ตัดสถานที่ที่ `default_duration_min` เกินเวลาต่อวัน) จะเอาออกหรือไม่ เพราะเป็นการเปลี่ยนลำดับ filter ที่ CLAUDE.md กำหนดไว้
  - Auto Trip ยังใช้ `default_duration_min` อยู่ (`autoTripBuilder.ts`, `itineraryController.ts` ส่วน auto) ซึ่งเป็นงานของกิ่ง — ต้องแจ้งกิ่งก่อนลบคอลัมน์
- ผู้ตัดสินใจ: เจ้าของโปรเจกต์
- ไฟล์ที่กระทบ (คาดการณ์): mirror `itineraryBuilder.ts` / `openingHoursChecker.ts` (ทั้งสองฝั่ง), `itineraryController.ts` / `itineraryPlaceQueries.ts`, `placesController.ts`, `poiPlaceQueries.ts`, `ItineraryEditor.tsx`, `TripDetail.tsx`, `TripRecommendations.tsx` (type), ตาราง `itineraries`

### D-37 · 2026-10-22 · ลบ `data-pipeline/` ก่อน P5 (R5 P6 — ขยาย D-24)
- บริบท: D-24 วางแผนลบ `data-pipeline/` หลังระบบ admin ใช้แทนได้ (P6 ต่อจาก P5) · backend/frontend ไม่ได้ import หรือเรียกโค้ดใน `data-pipeline/` ตอนรัน (มีแค่ comment และ fixture ของ characterization test ที่ copy มาไว้ใน backend แล้ว) · D-35 ไม่ใช้ `fetchGmapsCategories.ts` จัดหมวดแล้ว
- ข้อสรุป (ผู้ใช้เลือก): ลบเลยโดยไม่รอ P5 เพราะ (1) ผู้ใช้ทดสอบการนำเข้าผ่านหน้า admin กับน่านแล้ว (2) `data-pipeline/.env` มีตัวที่ backend ไม่มีแค่ `SUPABASE_ANON_KEY` ซึ่ง backend ไม่ใช้ · `data-pipeline/data/attraction.csv` เหมือน `backend/data/attraction.csv` ทุก byte · เอาบรรทัด `data-pipeline/` ออกจาก `.gitignore` (ปิด Known Issue #15)
- ผลที่ยอมรับ: ไม่มีสคริปต์สำรองถ้าการนำเข้าใหม่แทนข้อมูล เชียงใหม่/ชลบุรี/กรุงเทพฯ มีปัญหา · ไฟล์ที่ track ไว้ 13 ไฟล์กู้ได้ด้วย `git show d73808f:data-pipeline/<ไฟล์>`
- ผู้ตัดสินใจ: เจ้าของโปรเจกต์
- ไฟล์ที่กระทบ: `data-pipeline/` (ลบ), `.gitignore`, `CLAUDE.md`, `.claude/skills/*`, `docs/*`

### D-38 · 2026-10-22 · รายละเอียด P5: fallback หมวด, ตัด POI filter ขั้นที่ 4, เวลาของ Auto Trip ต่อหมวด และลบ `confidence_score` / `default_duration_min` (ขยาย D-35, D-36)
- บริบท: หลัง D-35 สถานที่มี 1 หมวด `confidence_score` (มาจาก weight ของ Stage 3) จึงไม่มีความหมาย · หลัง D-36 ไม่มี `default_duration_min` ให้ POI filter ขั้นที่ 4 ใช้ · ผู้ใช้คุยกับกิ่ง (ผู้ทำ Auto Trip) แล้ว 2026-10-22
- ข้อสรุป (ผู้ใช้เลือก):
  - เลือกหมวดแต่ในพื้นที่ไม่มีสถานที่หมวดนั้น → ใช้ fallback เดิม (ตัดเงื่อนไขหมวด แสดงทั้งพื้นที่ + ข้อความแจ้ง `categoryFallbackUsed`) ไม่เปลี่ยน
  - `category_score` ในสูตร POI จะเป็น 1.0 ทุกที่ · การเอาออกจากสูตรรอทีม (D-23) — P5 ไม่แก้โค้ดสูตร
  - ตัด POI filter ขั้นที่ 4 (เวลา) ออก ลำดับเหลือ province → category+fallback → budget · เวลาและเวลาเปิด-ปิดตรวจใน `ItineraryEditor` จากเวลาที่ผู้ใช้กรอก · แนวคิด "ตัดสถานที่ที่ปิดตลอดช่วงเวลาของทุกวันในทริป" (จาก `trip_days` + `opening_hours`) เป็นงานแยก คุยตอน R1/R3
  - เวลาที่จะอยู่: เลือกสถานที่เอง = ผู้ใช้กรอกต่อสถานที่ใน `ItineraryEditor` (D-36) · Auto Trip = ผู้ใช้กรอกนาทีต่อหมวดตอนสร้าง: ทริปที่เลือกหมวดไว้ (`trip_categories`) → หน้า Auto Trip ให้กรอกเวลาของหมวดเหล่านั้นอย่างเดียว · ทริปที่ไม่ได้เลือกหมวด → กดปุ่ม Auto Trip แล้วเด้ง popup ให้เลือกหมวด + กรอกเวลา (ไม่ต้องไปหน้าแก้ทริป) → บันทึกหมวดลง `trip_categories` แล้วคำนวณ POI ใหม่ก่อนจัดทริป หน้าแนะนำจึงเปลี่ยนตาม · หน้าสร้างทริปเลือกหมวดหรือไม่ก็ได้เหมือนเดิม · ทุกหน้า (แนะนำ / Auto Trip) ใช้ `trip_categories` ชุดเดียวกัน · **Auto Trip ทั้งหมด (โค้ด, input, ผลลัพธ์) กิ่งรับผิดชอบ** Claude ไม่แก้
  - ลบ `place_categories.confidence_score` และ `categories.default_duration_min` (กิ่งรับทราบแล้วว่าห้ามใช้) — ลบเป็นขั้นสุดท้ายหลังงานส่วนของเราใน P5 เสร็จ · `pickBestCategoryRows` ลบตาม · โครงสร้าง `place_categories` หลังลบคอลัมน์ (คงตาราง 1 แถวต่อสถานที่ / ย้ายเป็น `places.category_id` / หาจาก `att_type_label` → ตาราง ป้าย → หมวด) ตัดสินใน P5b
  - endpoint ใหม่สำหรับ popup ของ Auto Trip: บันทึกเฉพาะหมวดของทริป (เช่น `PUT /api/trips/:tripId/categories` รับ `category_ids` · `requireAuth` + ตรวจเจ้าของ) — **ฝั่งเราทำ** ใน P5 · popup และการเรียกใช้เป็นของกิ่ง
  - ลบตาราง `type_category_weights` (ไม่มีโค้ดใช้) และ `place_types` ใน P5 (แทนที่ D-27 ข้อ "เขียน type จาก Google ลง `place_types`") · type จาก Google ยังเก็บใน `places.gmaps_types` · ต้องเอา `insertPlaceTypes` ออกจากการนำเข้า (`importQueries.ts`, `importJob.ts`, `resolveItem.ts` + test) ก่อนลบตาราง · สำรองก่อนลบ
- ผลที่ยอมรับ: query ของ Auto Trip ที่ยังอ่านสองคอลัมน์นี้ (`itineraryPlaceQueries.ts`, `autoTripBuilder.ts`, `itineraryController.ts` ส่วน auto) จะใช้ไม่ได้หลังรัน SQL ลบ จนกว่ากิ่งแก้
- ผู้ตัดสินใจ: เจ้าของโปรเจกต์ (ตกลงกับกิ่ง (ผู้ทำ Auto Trip))
- ไฟล์ที่กระทบ (คาดการณ์): `backend/src/features/poi/poiPlaceQueries.ts`, `itineraryPlaceQueries.ts`, `placesController.ts`, `utils/bestCategoryRow.ts`, ตาราง `categories` / `place_categories` · หลังโค้ดเปลี่ยนต้องแก้ CLAUDE.md (ลำดับ filter ของ POI, กฎ multi-category dedupe)

### D-39 · 2026-10-22 · ตาราง ป้าย ททท. → หมวด (R5 P5a — ขยาย D-35)
- บริบท: ข้อมูลจริงจาก P5-0 — CSV มี 53 ป้ายใน 3 กลุ่มใหญ่ · `places` 1,230 แถวมี `att_type_label` ครบทุกแถว · หมวดเดิม 15 หมวดชื่ออังกฤษ · ป้าย "ประวัติความเป็นมา" ไม่ใช่ประเภทสถานที่ (สุ่มดูแล้วมีทั้งวัด พิพิธภัณฑ์ ตลาด ธีมปาร์ค สปา)
- ข้อสรุป (ผู้ใช้เลือก หลังดูร่าง 32 หมวด และร่าง 15 หมวด):
  - **29 หมวด ชื่อภาษาไทย** แทนหมวดอังกฤษเดิมทั้ง 15 หมวด · **1 ป้าย = 1 หมวด** (ป้ายอยู่ได้หมวดเดียว) · กลุ่มใหญ่ของหมวดกำหนดในตาราง mapping ไม่อ่านจาก `places.att_category_label` (ป้ายเดียวกันใน CSV อยู่หลายกลุ่มได้)
  - ป้ายที่อยู่หลายกลุ่มใน CSV → ใช้กลุ่มของหมวดที่ป้ายนั้นอยู่ · "ประวัติความเป็นมา" รวมเข้าหมวด "โบราณสถานและสถานที่ทางประวัติศาสตร์" · ป้ายที่มีน้อยรวมเข้าหมวดใกล้เคียง (ศูนย์ประชุม / จุดผ่านแดน คงเป็นหมวดของตัวเอง)
  - `environment_type` / `price_nature` ตามตาราง (ค่าจากหมวดเดิมที่ตรงกันถ้ามี) · พิพิธภัณฑ์ และอุทยานแห่งชาติ = `paid` เพราะส่วนใหญ่เก็บค่าเข้า
- ตาราง (จำนวน = แถวใน `attraction.csv`, รวม 8,622):

| กลุ่มใหญ่ | หมวด | ป้าย ททท. (`ATT_TYPE_LABEL`) | env | price |
|---|---|---|---|---|
| ประวัติศาสตร์และวัฒนธรรม | วัดและศาสนสถาน | ศาสนสถาน (วัด/โบสถ์/มัสยิด ฯลฯ) · สถานปฏิบัติธรรม | MIXED | free |
| ประวัติศาสตร์และวัฒนธรรม | โบราณสถานและสถานที่ทางประวัติศาสตร์ | ชุมชนโบราณ/โบราณสถาน/โบราณวัตถุ · อุทยานประวัติศาสตร์ · กำแพงเมือง/คูเมือง · อนุสาวรีย์/อนุสรณ์สถาน · พระตำหนัก/วัง/พระราชวัง · ประวัติความเป็นมา | MIXED | free |
| ประวัติศาสตร์และวัฒนธรรม | พิพิธภัณฑ์ | พิพิธภัณฑ์ · เหมือง/ประวัติศาสตร์การทำเหมือง | INDOOR | paid |
| ประวัติศาสตร์และวัฒนธรรม | ศูนย์วัฒนธรรมและประวัติศาสตร์ | ศูนย์วัฒนธรรม · ศูนย์ศึกษาประวัติศาสตร์ | MIXED | free |
| ประวัติศาสตร์และวัฒนธรรม | วิถีชีวิตชุมชน | วิถีชีวิตความเป็นอยู่ (ชุมชน) · หมู่บ้าน · งานประเพณี | OUTDOOR | free |
| ประวัติศาสตร์และวัฒนธรรม | ศูนย์เรียนรู้และหัตถกรรม | ศูนย์การเรียนรู้ฯ (เกี่ยวกับกิจกรรม ผลิตภัณฑ์ และภูมิปัญญาในท้องถิ่น) · ศูนย์หัตถกรรม | MIXED | free |
| ประวัติศาสตร์และวัฒนธรรม | ตลาดน้ำและตลาดโบราณ | ตลาดน้ำ/ตลาดโบราณ | OUTDOOR | free |
| ธรรมชาติ | จุดชมวิว | จุดชมวิว | OUTDOOR | free |
| ธรรมชาติ | น้ำตก | น้ำตก | OUTDOOR | free |
| ธรรมชาติ | ถ้ำ | ถ้ำ | OUTDOOR | free |
| ธรรมชาติ | ภูเขาและธรณีวิทยา | ภูเขา/ธรณีสัณฐานเฉพาะ · ซากฟอสซิล | OUTDOOR | free |
| ธรรมชาติ | ทะเลและหมู่เกาะ | อ่าว/หาดทราย/ชายทะเล · หมู่เกาะ · แหล่งปะการังน้ำลึก/น้ำตื้น | OUTDOOR | free |
| ธรรมชาติ | อุทยานแห่งชาติและวนอุทยาน | อุทยานแห่งชาติ · วนอุทยาน | OUTDOOR | paid |
| ธรรมชาติ | เขตรักษาพันธุ์สัตว์ป่า | เขตรักษาพันธุ์สัตว์ป่า · เขตห้ามล่าสัตว์ป่า | OUTDOOR | free |
| ธรรมชาติ | สวนพฤกษศาสตร์และศูนย์ศึกษาธรรมชาติ | สวนพฤกษศาสตร์ · สวนรุกชาติ · ศูนย์ศึกษาธรรมชาติ/พิพิธภัณธ์ธรรมชาติ (พืชพันธุ์) | OUTDOOR | free |
| ธรรมชาติ | ทุ่งดอกไม้ | ทุ่งดอกไม้และพืชพันธุ์ | OUTDOOR | free |
| ธรรมชาติ | แม่น้ำ ทะเลสาบ และเขื่อน | แม่น้ำ/ลำคลอง/แก่ง · เขื่อน/อ่างเก็บน้ำ · ทะเลสาบ/หนอง/บึง | OUTDOOR | free |
| ธรรมชาติ | ป่าชายเลนและพื้นที่ชุ่มน้ำ | พรุ/ป่าชายเลน/พื้นที่ชุ่มน้ำ | OUTDOOR | free |
| ธรรมชาติ | น้ำพุร้อน | น้ำพุร้อน/บ่อน้ำร้อน/ธารน้ำ | OUTDOOR | free |
| กิจกรรมพิเศษและนันทนาการ | เกษตรและโครงการหลวง | ไร่/สวนเกษตร (ฟาร์มสัตว์/ประมง) · ศูนย์วิจัย (เกษตร)/สถานีทดลอง (เกษตร) · โครงการหลวง/โครงการพระราชดำริ | OUTDOOR | free |
| กิจกรรมพิเศษและนันทนาการ | แหล่งช้อปปิ้งและตลาด | ห้างสรรพสินค้า/แหล่งช้อปปิ้ง/ตลาดสด/ตลาดนัด/ถนนคนเดิน | MIXED | paid |
| กิจกรรมพิเศษและนันทนาการ | สวนสาธารณะ | สวนสาธารณะ/สวนหย่อม | OUTDOOR | free |
| กิจกรรมพิเศษและนันทนาการ | กีฬาและกิจกรรมผจญภัย | ศูนย์กีฬา/สนามกีฬาสถานที่ทางการกีฬาทางบก/ทางน้ำ/ทางอากาศ | OUTDOOR | paid |
| กิจกรรมพิเศษและนันทนาการ | สวนสัตว์ | สวนสัตว์/ศูนย์ฝึกสัตว์/พิพิธภัณฑ์สัตว์ | OUTDOOR | paid |
| กิจกรรมพิเศษและนันทนาการ | สวนสนุกและธีมปาร์ค | สวนสนุก/สวนน้ำ · ธีมปาร์ค (Theme Park) | MIXED | paid |
| กิจกรรมพิเศษและนันทนาการ | สุขภาพและความงาม | สุขภาพและความงาม | INDOOR | paid |
| กิจกรรมพิเศษและนันทนาการ | การแสดงและโรงละคร | โรงละคร/โรงมหรสพ (โชว์) · โรงภาพยนต์โบราณ (โรงหนังเก่า) | INDOOR | paid |
| กิจกรรมพิเศษและนันทนาการ | ศูนย์ประชุม | ศูนย์ประชุมฯ | INDOOR | paid |
| กิจกรรมพิเศษและนันทนาการ | จุดผ่านแดน | จุดผ่านแดน/ชายแดน | OUTDOOR | paid |

- ผลที่ยอมรับ: ค่า env / price ใช้ได้ชุดเดียวต่อหมวด บางป้ายในหมวดจึงไม่ตรง (เช่น วังส่วนใหญ่เก็บค่าเข้าแต่หมวดเป็น `free`) · `trip_categories` 24 แถวที่อ้างหมวดเดิมต้องย้ายหรือล้างใน P5b
- ผู้ตัดสินใจ: เจ้าของโปรเจกต์
- ไฟล์ที่กระทบ (คาดการณ์): ตาราง `categories`, `place_categories`, `trip_categories` + ตาราง mapping ใหม่ (P5b) · `categoriesController.ts`, `createTrip.tsx` (P5c/P5d)

### D-40 · 2026-10-22 · ขอบเขตหน้า admin Category Mapping (R5 P5e — ขยาย D-39)
- บริบท: ค่าใน D-39 (หมวดของป้าย, env, price) เป็นค่ากลางต่อหมวด บางป้ายไม่ตรง · ผู้ใช้อยากให้ admin ปรับเองได้โดยไม่ต้องรัน SQL หรือแก้โค้ด
- ข้อสรุป (ผู้ใช้เลือก):
  - หน้า Category Mapping ทำได้ 2 อย่าง: (ก) ย้ายป้ายไปหมวดอื่น (ข) แก้ชื่อหมวด กลุ่มใหญ่ `environment_type` และ `price_nature`
  - **ไม่ทำ** เพิ่ม / ลบ / รวมหมวดในหน้านี้ (ลบหมวดที่ `trip_categories` อ้างอยู่ไม่ได้เพราะ FK เป็น NO ACTION — ถ้าต้องทำใช้ SQL)
  - กลุ่มใหญ่เลือกได้จาก 3 กลุ่มของ ททท. เท่านั้น (หน้าสร้างทริปแสดง chip ตาม 3 กลุ่มนี้)
  - endpoint ใต้ `/api/admin` (`requireAuth` + `requireAdmin`)
- ผลต่อ P5b (ข้อเสนอ ตัดสินใน P5b): โครงสร้างควรให้การแก้มีผลทันที — หาหมวดของสถานที่ผ่าน `places.att_type_label` → ตาราง mapping → `categories` แทนการ copy หมวดเก็บไว้ต่อสถานที่ (ไม่งั้นทุกการแก้ต้องเขียน `place_categories` ใหม่ทั้งหมด)
- ผลที่ยอมรับ: การแก้ไม่ย้อนไปเปลี่ยนทริปเดิมทันที — `poi_scores` เปลี่ยนเมื่อคำนวณ POI ใหม่ · `itineraries.place_cost` ของแผนที่ยืนยันแล้วไม่เปลี่ยน
- ผู้ตัดสินใจ: เจ้าของโปรเจกต์
- ไฟล์ที่กระทบ (คาดการณ์): `backend/src/admin/` (route ใหม่), `frontend/src/admin/` (หน้าใหม่), `AdminDashboard.tsx` (เปิดการ์ด), ตาราง mapping + `categories`

### D-41 · 2026-10-22 · ล้างของเก่า P5g ก่อนกิ่งแก้ Auto Trip (ขยาย D-38)
- บริบท: D-38 ให้ลบ `confidence_score` / `default_duration_min` / `type_category_weights` / `place_types` หลังกิ่งเลิกใช้ · ผู้ใช้แจ้งกิ่งแล้วผ่าน `P5-Auto-Trip-brief.pdf` (ฉบับ 2) แต่กิ่งยังไม่ได้แก้ · ระหว่าง P5b ตาราง `place_categories` ว่างไปแล้ว (Auto Trip ได้ผลว่างตั้งแต่ตอนนั้น)
- ข้อสรุป (ผู้ใช้เลือก):
  - ลบเลยโดยไม่รอกิ่ง: คอลัมน์ `categories.default_duration_min` และตาราง `place_categories`, `type_category_weights`, `place_types` (SQL `docs/sql/2026-10-22_p5g_drop_legacy.sql` — สำรอง `place_types` ไว้)
  - **ไม่แตะโค้ด Auto Trip** (ตาม D-38) → Auto Trip ตอบ 500 จนกว่ากิ่งแก้ · เก็บ `backend/src/utils/bestCategoryRow.ts` ไว้เพราะ `getAutoTripPlaces` import อยู่ (ลบแล้ว compile ไม่ผ่าน) ให้กิ่งลบตอนแก้
  - การนำเข้าเลิกเขียน `place_types` (type จาก Google ยังอยู่ใน `places.gmaps_types`) — แทนที่ D-27 ข้อเขียน `place_types`
  - เก็บตาราง `backup_20261022_*` ไว้ก่อน (Claude เสนอ ผู้ใช้ไม่ได้คัดค้าน) — ลบเมื่อมั่นใจ
- ผู้ตัดสินใจ: เจ้าของโปรเจกต์
- ไฟล์ที่กระทบ: `backend/src/admin/imports/importQueries.ts`, `admin/pipeline/import/importJob.ts`, `resolveItem.ts` (+ test), `features/categories/categoriesController.ts`, ตาราง `categories`, `place_categories`, `type_category_weights`, `place_types`

### D-42 · 2026-10-22 · ทำเท่าที่จำเป็น — ตัดงานที่ไม่ทำให้ระบบพัง
- บริบท: ผู้ใช้อยากทำให้ง่าย แก้เฉพาะสิ่งที่ถ้าไม่แก้แล้วงานพัง ไม่แก้เผื่ออนาคต
- ข้อสรุป (ผู้ใช้เลือก):
  - ตัดออก — ยังไม่ deploy รันแค่ local (D-21): T9, T10 (#8), security #22 #23 #24 #26 #27 · ⚠️ ถ้าจะ deploy จริง ต้องกลับมาดู #27 ก่อนอย่างอื่น
  - ตัดออก — เผื่ออนาคต/ทำให้โค้ดสวย: B4 (T13, T14), T16 (ยกเว้น `RecommendationMap.tsx:209` ที่อาจเป็น bug จริง — ลองก่อน), T19, T20, T21, กลุ่ม 6
  - ตัดออก — เกิดยาก: T3 (#7), T11, #25
  - ไม่ใช่งานของเรา: T6 และ #9–12, #32–34 (Auto Trip ของกิ่ง)
  - เก็บไว้: #35 และ `RecommendationMap.tsx:209` (ลองใน browser ก่อน พังจริงค่อยแก้) · R1/R3/T5 (requirement ทีม รอ research) · T7 ทำคู่กับการนำเข้า 3 จังหวัด
  - B3 และ T8 เสร็จแล้ว แค่อัปเดตแผน
- ผู้ตัดสินใจ: เจ้าของโปรเจกต์
- ไฟล์ที่กระทบ: `docs/DEVELOPMENT_PLAN.md` (ไม่แตะโค้ด)

### D-43 · 2026-10-23 · ข้อยกเว้นขอบเขต Auto Trip สำหรับเวลาต่อหมวด
- บริบท: D-38/D-42 ระบุให้กิ่งรับผิดชอบ Auto Trip และไม่แก้โค้ดส่วนนี้ · กิ่งแก้เฉพาะ flow เวลาต่อหมวดที่ยังต่อไม่ครบ
- ข้อสรุป:
  - หน้า Auto Trip โหลดหมวดจากชุดสถานที่ที่มีคะแนน POI ของทริป แล้วให้กรอกเวลาเที่ยวต่อหมวดเป็นจำนวนเต็ม 1–1440 นาที
  - Backend ตรวจเจ้าของทริปและตรวจค่าเวลา ก่อนนำเวลาเดียวกันไปใช้จัดตารางและกรองเวลาเปิด · ตอนยืนยันแผนส่ง `visit_durations` ตามเวลาที่จัดไว้ให้ `confirmItinerary` ตรวจซ้ำ
  - ข้อยกเว้นนี้ไม่ครอบคลุมการปรับสูตร POI, จำนวนสถานที่ต่อหมวด, การใช้ ORS แทน haversine, flow แก้ไขแผน หรือการคำนวณ POI ใหม่/เลือกหมวดเมื่อไม่มีสถานที่
  - ไม่เปลี่ยน schema ฐานข้อมูล
- ผู้ตัดสินใจ: กิ่ง
- ไฟล์ที่กระทบ: `backend/src/features/itinerary/`, `frontend/src/components/AutoTripDurationForm.tsx`, `frontend/src/features/trip/e-tinerary/auto/`, `frontend/src/App.tsx`

### D-44 · 2026-10-23 · ตัวเลือกเวลาเที่ยวของ Auto Trip
- บริบท: ฟอร์ม Auto Trip ใช้ได้ง่ายขึ้นเมื่อจำกัดเวลาต่อหมวดเป็นตัวเลือกมาตรฐาน
- ข้อสรุป:
  - แทนที่ช่วงเวลา 1–1440 นาทีของ Auto Trip ใน D-43 ด้วยตัวเลือก 30, 60, 90, 120, 150 หรือ 180 นาทีเท่านั้น
  - Frontend แสดงตัวเลือกเหล่านี้ และ backend ปฏิเสธค่าอื่น แม้เรียก API โดยตรง
  - ไม่เปลี่ยนช่วง 1–1440 นาทีของ Itinerary Editor และ `itineraries.visit_duration_min` ตาม D-36
  - ไม่เปลี่ยน schema ฐานข้อมูลหรือ response shape
- ผู้ตัดสินใจ: กิ่ง
- ไฟล์ที่กระทบ: `backend/src/features/itinerary/autoTripDurations.ts`, `frontend/src/features/trip/recommendations/AutoTripDurationForm.tsx`

### D-45 · 2026-10-23 · ใช้หมวดที่เลือกจากทริปสำหรับฟอร์มเวลา Auto Trip
- บริบท: ผู้ใช้เลือกหมวดไว้แล้วตอนสร้างทริป จึงควรกรอกเวลาให้ครบตามหมวดที่เลือก ไม่ใช่เฉพาะหมวดที่บังเอิญมีแถวใน `poi_scores`
- ข้อสรุป:
  - โหลดรายการหมวดจาก `trip_categories` → `categories` และให้กรอกเวลาของทุกหมวดที่เลือกตามตัวเลือกใน D-44
  - ตอนจับคู่สถานที่กับหมวด ยังคงใช้ `places.att_type_label` → `category_labels` → `categories` ตาม schema ปัจจุบัน; ห้ามถือว่า `categories` เชื่อมกับ `places` โดยตรง เพราะไม่มีคอลัมน์/ตารางนั้นแล้ว (D-41)
  - การค้นสถานที่ที่เลือกไม่ใช้ inner join ของหมวดเป็นเงื่อนไขตัดแถวสถานที่; ถ้าหาหมวดไม่พบและไม่มี `price_level` จริง ให้ถือราคาว่าไม่ทราบ ไม่อนุมานว่าเข้าฟรี
  - Backend ตรวจเวลาโดยอิงหมวดที่ผูกกับทริป และจัดเฉพาะสถานที่ POI ที่จับคู่กับหมวดที่เลือก
  - ไม่เปลี่ยน schema หรือ response shape
- ผู้ตัดสินใจ: กิ่ง
- ไฟล์ที่กระทบ: `backend/src/features/itinerary/itineraryPlaceQueries.ts`, `backend/src/features/itinerary/itineraryController.ts`, `frontend/src/features/trip/recommendations/AutoTripDurationForm.tsx`

### D-46 · 2026-10-23 · ตรวจเวลาเปิด Auto Trip ณ เวลาถึงจริง
- บริบท: การกรองเวลาเปิดที่เวลาเริ่มทริปไม่ตรงกับเวลาที่ไปถึงสถานที่จริง และไม่ควรเลือกสถานที่ที่ทราบว่าปิด
- ข้อสรุป:
  - สถานที่ที่ไม่มีข้อมูล `opening_hours.periods` ถือว่าไม่ทราบเวลาเปิดและยังเลือกได้ (ตรงกับ D-10)
  - ถ้ามีข้อมูลเวลาเปิด ต้องเปิดครอบคลุมเวลาถึงจริงและเวลาที่ผู้ใช้กำหนดเที่ยวทั้งหมด จึงเลือกได้
  - ตรวจตามวันเดินทางและเวลาไปถึงที่คำนวณจากจุดก่อนหน้า; ถ้าตัวเลือกคะแนนสูงสุดปิด ให้ลองตัวเลือกคะแนนถัดไปในหมวดเดียวกัน
  - ถ้าหมวดนั้นไม่มีสถานที่เปิดในเวลาที่จัดได้ จะไม่เลือกสถานที่ที่ทราบว่าปิด และลองจัดในวันถัดไปภายในช่วงทริป
  - คงพฤติกรรมสูงสุดหนึ่งสถานที่ต่อหมวดต่อทริป; ไม่เปลี่ยน API contract หรือ schema
- ผู้ตัดสินใจ: กิ่ง
- ไฟล์ที่กระทบ: `backend/src/features/itinerary/autoTripBuilder.ts`, `backend/src/features/itinerary/itineraryController.ts`

### D-47 · 2026-10-25 · เลิกเก็บอายุและเพศของผู้ใช้
- บริบท: ระบบไม่ได้ใช้อายุ/เพศในส่วนไหน (ไม่มีโค้ดอ่านค่า) และผู้ใช้ไม่อยากเก็บข้อมูลที่ไม่จำเป็น
- ข้อสรุป (ผู้ใช้เลือก): หน้าสมัครสมาชิกเหลือ ชื่อผู้ใช้ / อีเมล / รหัสผ่าน · `register` เลิกรับและ insert `age`, `gender` · ลบคอลัมน์ `users.age`, `users.gender` ด้วย SQL ที่ผู้ใช้รันเอง ไม่สำรองข้อมูล (มีแต่บัญชีทดสอบ)
- ผู้ตัดสินใจ: เจ้าของโปรเจกต์
- ไฟล์ที่กระทบ: `backend/src/features/auth/authController.ts`, `frontend/src/features/auth/register/register.tsx`, `frontend/src/system/auth/AuthContext.tsx`, `docs/sql/2026-10-25_drop_users_age_gender.sql`, `docs/DATABASE_SCHEMA.md`

### D-48 · 2026-10-25 · category score: เติมหมวดอื่นเมื่อหมวดที่เลือกมีไม่ถึง 50 ที่ (R1 — แทนที่ D-38 ข้อ fallback หมวด)
- บริบท: หลัง D-35/D-38 สถานที่มี 1 หมวด และ `category_score` เป็น 1.0 ทุกที่ หมวดจึงเป็นแค่ hard filter · ถ้าหมวดที่เลือกมีไม่ถึง Top 50 (เช่น น่าน "จุดชมวิว" 11 แห่ง) หน้าแนะนำแสดงแค่นั้น · วาวิจัยแล้วว่าจุดนี้คือที่ที่ category score ต้องทำงาน
- ข้อสรุป (ผู้ใช้เลือก):
  - `category_score`: ตรงหมวดที่เลือก (หมวดใดหมวดหนึ่ง) = 1 · ไม่ตรง = 0 · ไม่ได้เลือกหมวด = ตัด category ออกจากสูตร (แบ่ง weight 0.35 คืนให้ rating/distance/weather ตามสัดส่วน แบบเดียวกับตอนไม่ใช้งบ) และเก็บ `poi_scores.category_score` เป็น null
  - ลำดับ: province → งบ → หมวด · นับจำนวนที่ตรงหมวด **หลังกรองงบ** — ≥ 50 ที่ เหลือเฉพาะที่ตรงหมวด (เหมือนเดิม) · < 50 ที่ (รวม 0 — แทน `categoryFallbackUsed`) เก็บทุกที่ในพื้นที่ แล้วเรียงทั้งหมดตาม POI Score อย่างเดียว (สถานที่ตรงหมวดที่คะแนนด้านอื่นต่ำอาจหลุด Top 50 ได้)
  - น้ำหนักสูตรคงเดิม (0.35 / 0.25 / 0.15 / 0.15 / 0.10)
  - response เปลี่ยนจาก `categoryFallbackUsed` เป็น `categoryMatchCount` + `categoryFilled` · หน้าแนะนำแสดง "ตรง/นอกหมวดหมู่ที่เลือก" และข้อความแจ้งเมื่อมีการเติม
  - แก้พร้อมกัน: หลัง upsert Top 50 ลบแถว `poi_scores` ของทริปที่หลุดจากผลรอบนี้ (เดิมค้างอยู่ และ Auto Trip อ่านทุกแถว)
- ผลที่ยอมรับ: `poi_scores` ของทริปที่หมวดไม่ถึง 50 มีสถานที่หมวดอื่นปนอยู่ — Auto Trip (กิ่ง) อ่านทุกแถว ต้องให้กิ่งตรวจว่าจัดเฉพาะหมวดของทริปหรือไม่
- ผู้ตัดสินใจ: เจ้าของโปรเจกต์
- ไฟล์ที่กระทบ: `backend/src/features/poi/poiPlaceQueries.ts`, `poiScoreCalculator.ts`, `poiController.ts`, `__tests__/poiScoreCalculator.test.ts`, `frontend/src/features/trip/recommendations/TripRecommendations.tsx`, `docs/sql/2026-10-25_poi_category_score_nullable.sql`, `CLAUDE.md`, `docs/ARCHITECTURE.md`, `docs/DATABASE_SCHEMA.md`, `docs/DEVELOPMENT_PLAN.md`, skill `supabase-data-access`
### D-49 · 2026-10-26 · เติมสถานที่ Auto Trip ภายในเวลารวมของแต่ละหมวด
- บริบท: Auto Trip เดิมเลือกได้หนึ่งสถานที่ต่อหมวด และใช้เวลาที่กรอกเป็นเวลาเที่ยวต่อสถานที่ ทำให้ไม่สามารถเติมสถานที่เพิ่มภายในเวลาที่ผู้ใช้กำหนดได้
- ข้อสรุป:
  - แทนที่ความหมายเวลาใน D-44: ตัวเลือก 30/60/90/120/150/180 นาทีเป็นเวลาสำหรับเที่ยวสถานที่ต่อหมวดตลอดทริป ไม่รวมเวลาเดินทาง; เวลาเดินทางคิดแยกในกำหนดการรายวัน
  - ใช้เฉพาะสถานที่ที่มี POI score ของทริปและจับคู่กับหมวดที่ผู้ใช้เลือก · สถานที่หนึ่งอาจจับคู่หลายหมวดได้ แต่ `place_id` เดียวกันห้ามถูกจัดซ้ำ
  - เพิ่มสถานที่ตาม POI score จากมากไปน้อย; หลังเพิ่มให้จัดลำดับแบบ nearest neighbor ใหม่และทดลองตำแหน่งแทรกที่เป็นไปได้ พร้อมคำนวณตารางทั้งทริปใหม่ก่อนรับสถานที่ โดยต้องผ่านเพดานเวลาต่อหมวด, เวลาที่เที่ยวได้ต่อวัน และเวลาเปิดตลอดช่วงเที่ยว
  - แบ่งเวลาเที่ยวของหมวดให้สถานที่ในหมวดนั้นโดยเฉลี่ย; ถ้าเวลาเปิดหรือเวลาสิ้นสุดวันจำกัด ให้ลดเวลาของจุดเท่าที่จำเป็น
  - ไม่มีข้อมูลเวลาเปิดยังเลือกได้ตาม D-10/D-46 · คำนวณเวลาและระยะทางจาก ORS Matrix โดย fallback เป็น Haversine เมื่อไม่มีข้อมูล ORS · ไม่เปลี่ยน schema หรือ API contract
- ผู้ตัดสินใจ: กิ่ง
- ไฟล์ที่กระทบ: `backend/src/features/itinerary/autoTripBuilder.ts`, `backend/src/features/itinerary/itineraryPlaceQueries.ts`, `backend/src/features/itinerary/itineraryController.ts`, `backend/src/features/itinerary/__tests__/autoTripBuilder.test.ts`, `frontend/src/features/trip/recommendations/AutoTripDurationForm.tsx`

### D-50 · 2026-10-26 · ใช้เวลาเที่ยวที่กรอกแยกต่อสถานที่ใน Auto Trip
- บริบท: ผู้ใช้ยืนยันว่าเวลาที่กรอกต่อหมวดหมายถึงเวลาเที่ยวต่อสถานที่ ไม่ใช่เวลาเฉลี่ยหรือเพดานรวมของหมวด (แทนที่ D-49)
- ข้อสรุป:
  - ตัวเลือก 30/60/90/120/150/180 นาทีเป็นเวลาเที่ยวต่อสถานที่ของหมวดนั้น; สถานที่ทุกแห่งในหมวดที่จัดได้ใช้เวลาที่เลือกแยกกัน ไม่หารเฉลี่ย และไม่รวมเวลาเดินทาง
  - ใช้เฉพาะสถานที่ที่มี POI score ของทริปและจับคู่กับหมวดที่ผู้ใช้เลือก · สถานที่หนึ่งอาจจับคู่หลายหมวดได้ แต่ `place_id` เดียวกันห้ามถูกจัดซ้ำ
  - เพิ่มสถานที่ตาม POI score จากมากไปน้อย; หลังเพิ่มจะลองจัดลำดับ nearest neighbor ใหม่และตำแหน่งแทรกที่เป็นไปได้ โดยแต่ละสถานที่ต้องพอดีกับเวลาที่เที่ยวได้ต่อวันและเวลาเปิด
  - ถ้าเวลาเปิดหรือเวลาสิ้นสุดวันจำกัด อาจลดเวลาเที่ยวของจุดเท่าที่จำเป็น
  - ไม่มีข้อมูลเวลาเปิดยังเลือกได้ตาม D-10/D-46 · คำนวณเวลาและระยะทางจาก ORS Matrix โดย fallback เป็น Haversine เมื่อไม่มีข้อมูล ORS · ไม่เปลี่ยน schema หรือ API contract
- ผู้ตัดสินใจ: กิ่ง
- ไฟล์ที่กระทบ: `backend/src/features/itinerary/autoTripBuilder.ts`, `backend/src/features/itinerary/itineraryPlaceQueries.ts`, `backend/src/features/itinerary/itineraryController.ts`, `backend/src/features/itinerary/__tests__/autoTripBuilder.test.ts`, `frontend/src/features/trip/recommendations/AutoTripDurationForm.tsx`

### D-51 · 2026-10-26 · daily_budget เป็นงบต่อคนต่อวัน (ปิด Needs Verification #3 / T5 — ขยาย D-01)
- บริบท: `daily_budget` เดิมเป็นงบรวมของทั้งกลุ่มต่อวัน แต่ราคาสถานที่ (`PRICE_LEVEL_TO_BAHT`) เป็นค่าเดียวไม่คูณจำนวนคน ไปหลายคนจึงดูเหมือนงบพอทั้งที่ไม่พอ · Google ระบุว่าช่วงราคาบน Maps คือ "the average price that people spend per head" (https://support.google.com/local-listings/answer/9851099)
- ข้อสรุป (ผู้ใช้เลือก):
  - `trips.daily_budget` / `trip_days.daily_budget` = **งบต่อคนต่อวัน** · `createTrip.tsx` แปลง 4 กรณี: ทั้งกลุ่ม/ตลอดทริป = งบ ÷ วัน ÷ คน · ทั้งกลุ่ม/ต่อวัน = งบ ÷ คน · ต่อคน/ตลอดทริป = งบ ÷ วัน · ต่อคน/ต่อวัน = งบ
  - ราคาสถานที่ถือเป็นราคาต่อคน เทียบกับ `daily_budget` ตรงๆ — logic ใน `poiPlaceQueries` (กรองงบ) และ `itineraryBuilder` ทั้งสองฝั่ง (`cumulativeCost`) ไม่เปลี่ยน · backend ยังห้ามคูณ/หารจำนวนคนตาม D-01
  - คำเตือนงบต่ำ (< 300 บาท) เทียบกับงบต่อคนต่อวัน · หน้าจอแสดงงบเป็น "/คน"
  - `trips.total_budget` เก็บตัวเลขที่ผู้ใช้กรอกตาม scope/period ตรงๆ (เดิมเก็บยอดที่แปลงแล้ว ทำให้หน้าแก้ไขโหลดกลับผิดและบันทึกซ้ำแล้วงบพอง · TripDetail แสดงผิด) — ใช้แสดงผลและโหลดกลับเท่านั้น ไม่เข้า logic
  - ข้อมูลเดิม: ลบทริปทดสอบทั้งหมด (`docs/sql/2026-10-26_delete_test_trips.sql`) ไม่แปลงค่า
- ผู้ตัดสินใจ: เจ้าของโปรเจกต์
- ไฟล์ที่กระทบ: `frontend/src/features/trip/create/createTrip.tsx`, `backend/src/features/poi/poiScoreCalculator.ts` (`perPersonDailyBudget` เลิกหารจำนวนคน), `poiPlaceQueries.ts`, `poiController.ts`, `TripDetail.tsx`, `ItineraryEditor.tsx`, `MyTrips.tsx`, `docs/sql/2026-10-26_delete_test_trips.sql`

### D-52 · 2026-10-26 · ราคาสถานที่ใช้ priceRange ของ Google อย่างเดียว และ price score เทียบงบต่อคน
- บริบท: `PRICE_LEVEL_TO_BAHT` (200/450/900/1,500) และตาราง price score เดิม (0.9/0.8/80−20×ระดับ) ไม่มีแหล่งอ้างอิง · Google ไม่ผูก price_level กับจำนวนเงิน ("The exact amount indicated by a specific value will vary from region to region." — https://developers.google.com/maps/documentation/places/web-service/details) · Places API (New) มี `priceRange` เป็นเงินจริง (https://developers.google.com/maps/documentation/places/web-service/reference/rest/v1/places · SKU Enterprise) ซึ่ง Google ระบุว่าเป็นราคาเฉลี่ยต่อคน (https://support.google.com/local-listings/answer/9851099)
- ทดสอบน่าน 2026-10-26 (114 แห่ง, Google ตอบ 107): มี priceRange 6 แห่ง = ชุดเดียวกับที่มี price_level · ทุกแห่ง ฿1–200 · อีก 7 แห่งมี google_place_id แบบ "csv:..." (ไม่มีใน Google)
- ข้อสรุป (ผู้ใช้เลือก):
  - เพิ่ม `places.price_range_start` / `price_range_end` (บาท, THB เท่านั้น) · เลิกใช้ price_level และ `PRICE_LEVEL_TO_BAHT` ในโค้ดของเรา
  - ราคาต่อคน = ขอบบนของ priceRange → ขอบล่าง (ช่วงแบบ "มากกว่า X") → ไม่มีข้อมูล: free = 0 / paid = ไม่ทราบ (`utils/placePrice.ts` `getKnownPrice` / `getPlaceCost` · frontend mirror ใน `lib/itineraryBuilder.ts`) · ใช้ทั้ง filter งบ, ยอดสะสม/งบเกิน, price score และราคาที่แสดงในหน้าแนะนำ
  - price score (แทนตาราง v2 เดิมที่ไม่เทียบงบ) = 1 − ราคาต่อคน ÷ งบต่อคนต่อวัน (cap 0–1) weight 0.15 ตาม D-17 · ไม่ได้ตั้งงบหรือไม่ทราบราคา → ตัดมิติราคาแล้ว renormalize · `budget_score` เป็น null ในกรณีนั้น · เลิก `priceConfidence` (หน้าแนะนำใช้ `priceNature` บอก "หมวดนี้มักไม่มีค่าใช้จ่าย" แทน)
  - น่าน: เติมราคา 6 แห่งจากผลทดสอบด้วย SQL ไม่เรียก Google ซ้ำ
  - จังหวัดใหม่: การนำเข้าใน admin ขอ priceRange จาก Places API (New) ทุกสถานที่ (เพิ่ม 1 request Enterprise ต่อแห่ง) · key ไม่มีสิทธิ์/โควต้าหมด (403/429) หยุดทั้ง job · error อื่นนำเข้าต่อโดยไม่มีราคา
  - คอลัมน์ `price_level` ยังเก็บและนำเข้าต่อ เพราะ Auto Trip (กิ่ง) ยัง select อยู่ — กิ่งต้องย้ายไปคิดราคาผ่าน `getPlaceCost` (export จาก `itineraryBuilder.ts`) แล้วจึงลบคอลัมน์และเลิกนำเข้า
- ผู้ตัดสินใจ: เจ้าของโปรเจกต์
- ไฟล์ที่กระทบ: `backend/src/utils/placePrice.ts` (เดิม `priceLevel.ts`), `itineraryBuilder.ts` (backend + frontend mirror), `itineraryPlaceQueries.ts` (`getSelectedPlaces`), `placesController.ts`, `poiPlaceQueries.ts`, `poiScoreCalculator.ts`, `poiController.ts`, `ItineraryEditor.tsx`, `TripRecommendations.tsx`, `backend/src/admin/pipeline/import/`, `frontend/src/admin/imports/`, `docs/sql/2026-10-26_places_price_range.sql`, skill `itinerary-mirror-sync`

### D-53 · 2026-10-27 · น้ำหนัก POI ตั้งต้นใช้ Test 1 และให้ผู้ใช้ปรับน้ำหนักต่อทริปได้ (แทนที่ค่าน้ำหนักใน D-17) · **ถูกแทนที่โดย D-54 — ไม่ทำ**
- บริบท: กิ่งทดลองน้ำหนัก 4 ชุด (Test 1–4) กับ Museum 14 แห่งในเมืองเชียงใหม่ (รายงาน `E-tinerary (4)/(5)/(6).pdf` นอก repo) และสรุปเสนอ Test 1 · งานวิจัยที่อ้าง (Kesorn et al. 2017, R.-Toubes et al. 2020, Xue & Zhang 2020, Lian 2022) สนับสนุนการเลือกปัจจัย แต่ไม่มีงานไหนให้ค่าน้ำหนัก · ให้ผู้ใช้ปรับเองได้ ค่าตั้งต้นจึงเป็นแค่จุดเริ่ม
- ข้อสรุป (ผู้ใช้เลือก):
  - ค่าตั้งต้น = Test 1: category 0.30 / rating 0.20 / distance 0.15 / budget 0.15 / weather 0.20 (เดิม D-17: .35/.25/.15/.15/.10) · การ renormalize เมื่อไม่ใช้งบ/ไม่ทราบราคา/ไม่เลือกหมวด (D-48, D-52) คงเดิม แต่คิดจากน้ำหนักของทริป
  - UI = มีชุดสำเร็จรูป (preset) + ปรับเองได้
  - เก็บน้ำหนัก**ต่อทริป** (ต้องเพิ่มคอลัมน์ใน `trips` — ผู้ใช้รัน SQL เอง)
  - ปรับได้ทั้งตอนสร้างทริปและในหน้าแนะนำสถานที่ (ปรับแล้วคำนวณ POI ใหม่)
- ยังไม่ได้ตัดสิน: รายการ preset (ข้อเสนอ: Test 1–4 = สมดุล / เน้นหมวด / เน้นอากาศ / เน้นหมวดและรีวิว) · รูปแบบคอลัมน์ (5 คอลัมน์ numeric หรือ jsonb) · ปรับเองแล้วบังคับผลรวม = 100% หรือ normalize ให้
- ข้อควรระวังจากการตรวจรายงาน (Claude, 2026-10-27): ทดลองบนโค้ดก่อน D-48/D-52 (category 0.4 จาก `confidence_score`, price 0.8 จากตารางเดิม) · ภาพผล "Test 1" ใน `E-tinerary (4).pdf` คำนวณด้วยน้ำหนัก D-17 ไม่ใช่ Test 1 · Museum เป็น INDOOR จึงได้ weather 1 เสมอ → ควรรัน Test 1 ใหม่บนโค้ดปัจจุบันด้วยหลายหมวดก่อนใช้ในรายงาน · Lian 2022 (Wireless Communications and Mobile Computing, Hindawi) ต้องตรวจสถานะ retraction ก่อนอ้าง
- ผู้ตัดสินใจ: เจ้าของโปรเจกต์
- ไฟล์ที่จะกระทบ: `backend/src/features/poi/poiScoreCalculator.ts` (`WEIGHTS`, `computeWeights`, test), `poiController.ts`, `poiPlaceQueries.ts` (`getTripInfo`), `features/trip/tripController.ts` (สร้าง/แก้ทริป), `frontend/src/features/trip/create/createTrip.tsx`, `frontend/src/features/trip/recommendations/TripRecommendations.tsx`, `docs/DATABASE_SCHEMA.md`, SQL ใหม่ใน `docs/sql/`

### D-54 · 2026-10-27 · พักการให้ผู้ใช้ปรับน้ำหนัก POI เอง และหาน้ำหนักของระบบด้วย AHP (แทนที่ D-53) · **ตกลงแล้ว — กำลังเตรียม AHP**
- บริบท: ผู้ใช้ต้องการให้ทุกตัวเลขในระบบมาจากงานวิจัย ไม่ใช้ตัวเลขที่ทีมคิดเอง (Test 1 มาจากการทดลองของทีม) · ทบทวนงานวิจัยฉบับเต็ม 6 ฉบับ (Lopes et al. 2016, 2020 · Vansteenwegen et al. 2011 · Souffriau et al. 2008 · R.W. Saaty 1987 · Forman & Peniwati 1998) พบว่ารองรับการเลือก 5 ปัจจัย แต่ไม่มีงานไหนให้ค่าน้ำหนัก
- ข้อสรุป (ผู้ใช้เลือก):
  - พักการให้ผู้ใช้ปรับน้ำหนักเอง (preset + ปรับเองต่อทริปใน D-53) — ไม่ต้องเพิ่มคอลัมน์ใน `trips`
  - น้ำหนักของระบบ (ชุดเดียว) มาจากแบบสอบถาม AHP แทน Test 1 · ระหว่างรอผล โค้ดยังใช้น้ำหนัก D-17 (.35/.25/.15/.15/.10) ไม่เปลี่ยน
  - วิธี: เปรียบเทียบเป็นคู่ 10 คู่ สเกล 1–9 (R.W. Saaty 1987 น. 163) · น้ำหนักจาก principal eigenvector (น. 170–171) · CR < 0.10 โดย RI ของ n = 5 = 1.12 (น. 171) · รวมผลแบบ AIP ด้วยค่าเฉลี่ยเรขาคณิตแล้ว normalize (Forman & Peniwati 1998 น. 167–168) — แผนเต็มอยู่ที่ `AHP-POI-weights-plan.pdf` (นอก repo)
  - การ renormalize เมื่อไม่ใช้งบ/ไม่ทราบราคา/ไม่เลือกหมวด (D-48, D-52) คงเดิม
- รออาจารย์ตัดสิน: กลุ่มและจำนวนผู้ตอบ · วิธีจัดการคำตอบที่ CR ไม่ผ่าน (ให้แก้ หรือตัดออก) · ต้องประเมินผลหลังใช้หรือไม่
- ข้อควรระวัง: ค่าภายในสูตรที่ยังไม่มีแหล่งอ้างอิงและ AHP ไม่ครอบคลุม — `calculateDistanceScore` = `1/(1+km)` (R3), `RAIN_EXPOSURE.MIXED` = 0.5, rating ที่ไม่มีข้อมูล = 0.5
- ผู้ตัดสินใจ: เจ้าของโปรเจกต์
- ไฟล์ที่จะกระทบ (เมื่อได้ผล AHP): `backend/src/features/poi/poiScoreCalculator.ts` (`WEIGHTS`) + test
