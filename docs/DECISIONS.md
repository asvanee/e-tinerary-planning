# DECISIONS — ข้อสรุปทางเทคนิคที่ตัดสินใจแล้ว

> รวบรวมจาก comment "✅ มติ…" ในโค้ด (เอกสารต้นทาง เช่น `PRICE_SCORE_REDESIGN.md`, `itineraries_feature_status.md` ไม่มีใน ZIP) ห้ามเปลี่ยนโดยไม่ถามเจ้าของโปรเจกต์ ถ้าเปลี่ยนต้องเพิ่ม entry ใหม่ไว้ด้านล่าง (ห้ามลบของเดิม)
> รูปแบบ: **D-xx** · ข้อสรุป · เหตุผล · ที่อยู่ในโค้ด

| ID | ข้อสรุป | เหตุผล (ตาม comment) | ที่อยู่ |
|---|---|---|---|
| D-01 | Business logic ของงบคำนวณที่ **frontend จุดเดียว** (`daily_budget` เป็นค่าสำเร็จรูป) backend ห้ามหารจำนวนคนซ้ำ | กันการคำนวณซ้ำซ้อน/ไม่ตรงกัน | `poiPlaceQueries.ts` ขั้น 3, `itineraryPlaceQueries.ts` |
| D-02 | Backend `itineraryBuilder.ts` คือ **source of truth** ส่วน frontend เก็บ copy แบบ mirror ไว้ recompute ทันที และ backend ต้อง re-validate ซ้ำก่อน save เสมอ | ลากวางแล้วเห็นผลทันทีโดยไม่ต้องรอ network | หัวไฟล์ `backend/.../itineraryBuilder.ts` |
| D-03 | Itinerary editor เป็นแบบ **manual drag เท่านั้น** draft แรกไม่จัดลงวันให้ (`buildInitialDraft` คืน `[]`) และไม่มีปุ่ม "จัดลำดับอัตโนมัติ" ในหน้านี้ | final design | `itineraryBuilder.ts` |
| D-04 | เก็บ `buildNearestNeighborOrder` ไว้ แม้ตอนนี้ไม่มีที่เรียกใช้ | อาจนำไปใช้กับ Auto Trip | `itineraryBuilder.ts` |
| D-05 | ราคา v2: **ไม่เดาราคา** เมื่อไม่มี `price_level` จริง ยกเว้น category `free` (ให้ประมาณเป็น 0) ถ้าเป็น paid ที่ไม่มีราคา ให้ `placeCost=null`, ปล่อยผ่าน hard filter, ไม่นับเข้ายอดสะสม และให้ price weight = 0 | การเดาราคาซ่อนความไม่รู้ไว้และลงโทษผิด | `poiScoreCalculator.ts`, `poiPlaceQueries.ts`, `itineraryBuilder.ts` |
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
| D-17 | POI weights: category .35, rating .25, distance .15, budget .15, weather .10 และ renormalize เมื่อ budget weight < .15 | | `poiScoreCalculator.ts` |
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
  - พักงานสูตร POI และส่วนที่เกี่ยวข้อง (R1, R3) จนกว่าเพื่อนจะ research เสร็จ แล้วทำ R5 ก่อน
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
