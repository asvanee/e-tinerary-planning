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
