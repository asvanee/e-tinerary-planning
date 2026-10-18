# DEVELOPMENT_PLAN

> **กลุ่ม 0 (R1–R5) คือ requirement ของทีม** มาจาก [README.md](../README.md) ซึ่งเป็นแผนงานหลัก — เอกสารนี้แค่โยงไปที่โค้ด ถ้าขัดกันให้ยึด README
> กลุ่ม 1–6 (T1–T21) มาจากหลักฐานใน [DEVELOPMENT_STATUS.md](DEVELOPMENT_STATUS.md) **เป็นข้อเสนอของ Claude** ไม่ได้มาจาก requirement ของเจ้าของโปรเจกต์ ยกเว้นงานที่อ้างถึง comment/commit ในโค้ด
> ลำดับความสำคัญ: P0 = ต้องทำก่อน · P1 = จำเป็นต่อฟีเจอร์หลัก · P2 = ควรทำ · P3 = ทำเมื่อมีเวลา
> ทุกงานทำบน branch `dev` เท่านั้น (ห้ามสร้าง branch ใหม่ ห้ามแตะ `main` — ดู D-21) 1 งาน = 1 commit เมื่อผู้ใช้สั่ง แล้วอัปเดต DEVELOPMENT_STATUS.md เมื่อเสร็จ

---

## กลุ่ม 0 — งานของทีม (จาก README.md)
> ขอบเขต เกณฑ์ตรวจ และ Definition of Done ให้ยึดตาม README.md ส่วนนี้บันทึกแค่ไฟล์ที่เกี่ยวข้อง (ตรวจจากโค้ดจริงเมื่อ 2026-10-16) และงาน T ที่ซ้อนกัน

### R1. ตรวจสอบและแก้ไข POI Score — เร่งด่วน (README 1.1, ลำดับ 1)
- **สถานะใน README:** ยังไม่เริ่มยืนยัน
- **ไฟล์:** `backend/src/features/poi/poiScoreCalculator.ts` (`calculatePoiScore`, `WEIGHTS`, `computeWeights`), `backend/src/features/poi/poiController.ts` (เรียงคะแนนแล้วตัด `RESULT_LIMIT = 50` = Top 50), `backend/src/features/poi/poiPlaceQueries.ts` (`getFilteredPlaces`, `queryPlacesWithCategoryInfo` — ข้อมูลที่ป้อนเข้าสูตร)
- **ข้อเท็จจริง:** weight ฐาน category 0.35 / rating 0.25 / distance 0.15 / budget 0.15 / weather 0.1 (renormalize เมื่อ `useBudget=false`)
- **งาน T ที่ซ้อน:** T13 (unit test `poiScoreCalculator.ts`) · T5 (ความหมายของงบ มีผลกับ budget filter/score) · T7 (ถ้าโดน limit 1000 แถว สถานที่จะหายไปก่อนจัดอันดับ) · T8 (`explainWeatherScore`/debug log ใช้ช่วยตรวจได้ก่อนจะเก็บกวาด) · กลุ่ม 6 (sensitivity ของค่า MIXED)
- ⚠️ เปลี่ยนสูตรคะแนนเป็นงานเสี่ยงตาม CLAUDE.md กฎข้อ 4 ต้องเสนอแนวทางก่อน

### R2. แก้ไขพิกัดผิดและข้อมูลผิดจังหวัด — เร่งด่วน (README 1.2, ลำดับ 2)
- **สถานะใน README:** ยังไม่เริ่มยืนยัน
- **ไฟล์:** `data-pipeline/src/manualOverrides.ts` (`locationOverrides`), `data-pipeline/src/dedupe.ts` (`applyLocationOverrides`), script ที่เรียกใช้: `uploadProvinceGooglePlaces.ts`, `testProvinceSample.ts`, `testDedupe.ts`, `findGoogleCollisionCandidates.ts`
- **ข้อเท็จจริง:** commit `44d26dd` ลบพิกัดเชียงใหม่ 4 รายการที่ verify แล้ว (ATT_ID `20241223132512001`, `20241220140642001`, `20241220134044001`, `20241220125313001` พร้อม source) และใส่ comment `// ของเดิมทั้งหมด` แทน ตอนนี้ `locationOverrides` จึงว่าง กู้คืนได้จาก `git show 44d26dd^:data-pipeline/src/manualOverrides.ts` (Known Issue #20) · ยังไม่มีโค้ดตรวจพิกัดนอกประเทศไทยหรือพิกัดไม่ตรงจังหวัด
- **ข้อสันนิษฐาน:** การแก้ `locationOverrides` จะมีผลเฉพาะตอน upload ใหม่ ส่วนข้อมูลที่อยู่ใน Supabase แล้วอาจต้องแก้ที่ตาราง `places` โดยตรง (ต้องถามวิธีกับผู้ใช้ เพราะ script upload เขียนลง DB จริงและเรียก Google API ที่มีค่าใช้จ่าย)
- **ตรวจจริง 2026-10-18 (query อ่านอย่างเดียว เทียบ `places` 1116 แถวกับ `ATT_LOCATION` ใน CSV ด้วย `att_id`):** พิกัดใน DB **มาจาก Google** (`toPlaceRecord` ใช้ `details.geometry ?? found.geometry ?? CSV`) · ห่างจาก CSV < 0.5 km 807 แถว, 0.5–2 km 100, 2–10 km 99, 10–50 km 52, > 50 km 54 · DB อยู่นอกประเทศไทย 13 แถว (เช่น "มิวเซียมออฟเจด" → "Museo del Jade" คอสตาริกา, "พิพิธภัณฑ์มหัศจรรย์แห่งศิลป์กรุงเทพ" → "Magic Art 3D Museum Jakarta") · สาเหตุหลัก: Find Place ใช้ `locationbias` (แค่ให้น้ำหนัก ไม่จำกัดพื้นที่) + ค้นด้วยชื่ออังกฤษก่อน แล้วเชื่อ candidate แรกโดยไม่เช็คระยะ (Known Issue #30) · ส่วนน้อยผิดตั้งแต่ CSV: พิกัด CSV ห่างศูนย์กลางจังหวัด > 150 km 10 แถว (เช่น "พีทีที สปีดเวย์", "ชีวา สปา") และพิกัด CSV พัง 4 แถว (เชียงใหม่ ที่เคยแก้ด้วย `locationOverrides`)
- **แนวทาง (R5, D-26):** พิกัดยึด CSV เป็นหลัก · P3 ตรวจพิกัด CSV ก่อนนำเข้า · P4 ค้นด้วยชื่อไทยก่อนและรับข้อมูล Google เฉพาะเมื่อระยะ Google ↔ CSV ≤ 2 km · ข้อมูลเดิมใน DB **ยังไม่แก้** — นำเข้าใหม่ทุกจังหวัดด้วยระบบใหม่แล้วลบของเก่า (⚠️ CASCADE ลบ `itineraries`/`poi_scores` ของผู้ใช้ ต้องสำรองและยืนยันก่อน)
- **งาน T ที่ซ้อน:** T12 (ข้อมูลจังหวัดอื่น / Stage 3) · Known Issue #15 (`.gitignore` ของ data-pipeline — ปิดใน R5 P6) · R5 P2/P4 (ตาม D-24 โค้ดนี้จะย้ายไป `backend/src/admin/pipeline/` และใช้หน้า admin แก้พิกัด)

### R3. ตรวจสอบและแก้ไข Distance Cap — เร่งด่วน (README 1.3, ลำดับ 3)
- **สถานะใน README:** ค้างอยู่
- **ไฟล์:** `backend/src/features/poi/poiScoreCalculator.ts` (`calculateDistanceScore` = `1 / (1 + distanceKm)`), `backend/src/utils/orsDistance.ts` (`getRoadDistancesKm` ระยะทางถนนจาก ORS, fallback เป็น haversine), `backend/src/features/poi/poiController.ts` (ส่ง `distanceKm` เข้าสูตร)
- **ข้อเท็จจริง:** ยังไม่มี cap ในโค้ด สูตรได้ 0.5 ที่ 1 km, ≈0.09 ที่ 10 km, ≈0.05 ที่ 20 km จึงแบนตั้งแต่ราว 10 km ตามที่ README บอก (README ห้ามใช้ 10 km เป็นค่า cap สุดท้ายโดยไม่ทดสอบก่อน)
- **งาน T ที่ซ้อน:** T13 (unit test `calculateDistanceScore`) · R2 (พิกัดผิดทำให้ระยะทางผิด ต้องแยกผลของสองงานตาม README หัวข้อ 4)
- ⚠️ เปลี่ยนสูตรคะแนนเป็นงานเสี่ยงตาม CLAUDE.md กฎข้อ 4

### R4. ตรวจสอบ Category Mapping ทั้งระบบ — ปกติ (README 2.1, ลำดับ 4)
- **สถานะใน README:** รอตรวจสอบ
- **ไฟล์:** `data-pipeline/src/fetchGmapsCategories.ts` (เติม `places.gmaps_types` จาก Google Places), `backend/src/features/poi/poiPlaceQueries.ts` (`queryPlacesWithCategoryInfo` อ่าน `place_categories` แล้ว dedupe เลือก `confidence_score` สูงสุด, category fallback ใน `getFilteredPlaces`), `poiScoreCalculator.calculateCategoryScore`, ตาราง `categories` / `place_categories` / `trip_categories`
- **ข้อเท็จจริง:** ใน repo **ไม่มีโค้ด** ที่แปลง `gmaps_types` → `place_categories.confidence_score` (เป็นส่วนเดียวกับ Stage 3 ที่ T12 ระบุว่าหาไม่เจอ) ต้องขอโค้ดหรือกฎจากทีมก่อน · **พบ 2026-10-18 (`DATABASE_SCHEMA.md`):** DB มีตาราง `place_types` (`place_id`, `api_type_id`, `source`, ~1417 แถว) และ `type_category_weights` (`api_type_id` → `category_id` + `weight`, ~108 แถว) ที่โค้ดใน repo ไม่ได้ใช้ — สันนิษฐานว่าเป็นข้อมูลของ Stage 3 (ยังไม่ยืนยัน)
- **งาน T ที่ซ้อน:** T12 (โค้ด Stage 3) · T7 (`place_categories` อาจโดน limit 1000 แถว) · กฎ multi-category dedupe ใน CLAUDE.md

### R5. ออกแบบและพัฒนา Admin Panel — ต้องทำ (README 3.1, ลำดับ 5) · **งานถัดไป (วางแผนใหม่ 2026-10-18 ตาม D-24)**
- **สถานะใน README:** รอดำเนินการ · **requirement ที่ผู้ใช้ยืนยัน (D-23):** admin ที่ login ด้วย role `admin` ใช้หน้า UI เพื่อ (1) เลือกเพิ่มจังหวัดจาก `attraction.csv` (2) จัดการสถานที่ซ้ำ (3) จัดการ category mapping แทนการรัน `npm run upload:*` / `fetch-gmaps-categories:*` เอง
- **สถาปัตยกรรม (D-24 — ยืนยันแล้ว, ยังไม่มีโค้ด):**
  ```text
  frontend/src/features/*  (หน้า user)  ──/api/*────────┐
  frontend/src/admin/*     (หน้า admin) ──/api/admin/*──┼─► backend :5000 ─► Supabase (service role)
  frontend/src/system/*    (ใช้ร่วม: auth, LoginForm)   ┘     ├─ src/features/*  API ของ user (เดิม)
                                                              └─ src/admin/*     API ของ admin: requireAuth + requireAdmin
                                                                   └─ pipeline/  โค้ดที่ย้ายมาจาก data-pipeline (P2–P3) → Google Places, data/attraction.csv
  ```
  - `requireAdmin` อ่าน `users.role` จาก DB ทุก request (ห้ามเชื่อ `localStorage` — #22)
  - login ใช้ `/api/auth/login` เดิม มี 2 หน้า `/login` และ `/admin/login` (ใช้ `system/auth/LoginForm` ร่วมกัน) · role `admin` login จากหน้าไหนก็ไป `/admin`
  - งานยาว (นำเข้าจังหวัด) รันเป็น job ใน process ของ backend ทีละงาน (ตาราง `pipeline_jobs`: สถานะ/progress/log/ผู้สั่ง) — รับได้เพราะรันแค่ local
  - โค้ด data-pipeline ย้ายแบบ **copy แล้วปรับ** ให้เป็นฟังก์ชันที่รับพารามิเตอร์ (`importProvince({ province, limit, dryRun })` ฯลฯ) ใช้ `fetch` แทน `axios` (dependency ใหม่ที่คาดว่าต้องใช้: `csv-parse`) · ก่อนถึง P6 ไม่แก้การทำงานของ data-pipeline
- **Flow ของงานข้อมูล (D-26):** ① admin เลือกจังหวัด (รายชื่อจาก CSV + สถานะนำเข้า) → ② backend อ่านสถานที่จาก CSV อย่างเดียว (ไม่เรียก Google) → ③ ตรวจอัตโนมัติแล้วจัดหมวด (น่าจะซ้ำ / ต้องตรวจสอบ / สถานที่มีปัญหา — รายละเอียดเป็นข้อเสนอ รอยืนยันใน P3) → ④ admin ตัดสินใจทีละกลุ่ม/แถว: merge (เลือกค่าได้ทีละช่อง), ไม่ merge, ตัดทิ้ง, แก้พิกัด, ไว้ทีหลัง → ⑤ บันทึกการตัดสินใจลง DB (ใคร/อะไร/เมื่อไร, รันซ้ำแล้วยังอยู่) → ⑥ สรุปผล + ยืนยันนำเข้า → job เรียก Google (Find Place + Details ดึง `gmaps_types` พร้อมกัน) → เช็คระยะ Google ↔ CSV ก่อนบันทึก (#30) → upsert `places` → ⑦ category mapping (P5)
- **Phase (1 commit ต่อข้อ เมื่อผู้ใช้สั่ง):**
  - **P1 — admin login + หน้าหลัก** (ไม่แตะ data-pipeline) · **สถานะ 2026-10-18:** ข้อ 1 ✅ `c006b0f` · ข้อ 2 ✅ `03e01ae` · ข้อ 3 ✅ — tsc/build ผ่าน, lint เท่า baseline (29/4), `GET /api/admin/me` ไม่มี token/token ผิด → 401 · ✅ ผู้ใช้ทดสอบ manual ผ่านครบ 8 กรณีตามรายการด้านล่าง (2026-10-18)
    1. commit docs: D-24 + แผนนี้
    2. commit refactor: `git mv` `AuthContext.tsx`, `useAuth.ts`, `ProtectedRoute.tsx` → `frontend/src/system/auth/` แล้วแก้ import (พฤติกรรมไม่เปลี่ยน)
    3. commit feature: backend `src/admin/requireAdmin.ts`, `adminController.ts` (`getAdminMe`), `adminRoutes.ts` (`GET /api/admin/me`), mount ใน `server.ts` · frontend `system/auth/LoginForm.tsx` (แยกจาก `login.tsx`, คง logic ล้าง hash ของ #26 ไว้ที่ `login.tsx`), `admin/login/AdminLogin.tsx`, `admin/AdminRoute.tsx` (401 → `/admin/login`, 403 → `/home`), `admin/AdminLayout.tsx`, `admin/dashboard/AdminDashboard.tsx` (การ์ด 3 ใบ "เร็วๆ นี้"), route `/admin/login` + `/admin` ใน `App.tsx`
    - ผู้ใช้เตรียม: ตั้ง `users.role = 'admin'` ให้บัญชีทดสอบ + บัญชี user ธรรมดา 1 บัญชี
    - ทดสอบ manual: admin login ทั้ง 2 หน้า → `/admin` · user ธรรมดา → `/home` และเข้า `/admin` ไม่ได้ · user login ที่ `/admin/login` → ข้อความไม่มีสิทธิ์และไม่ค้าง login · แก้ `role` ใน localStorage แล้วยังเข้าไม่ได้ · ไม่ login → `/admin/login` · logout · hash ของลิงก์ยืนยันอีเมลยังถูกล้าง (#26)
  - **P2 — dedupe ใน backend + test** (D-25: เขียนใหม่ได้ ต้องมี characterization test)
    - **P2a ✅ (2026-10-18):** `backend/src/admin/pipeline/` — `attractionCsv.ts` (อ่าน `backend/data/attraction.csv` ด้วย `csv-parse` + cache), `dedupe/normalize.ts`, `dedupe/dedupeRows.ts`, `dedupe/applyRules.ts`, `dedupe/runDedupe.ts` (จุดเรียกจุดเดียว), `dedupeRules.ts` (เนื้อหาเท่า `manualOverrides.ts` ปัจจุบัน) · jest 25 tests: unit + characterization เทียบ fixture จาก `testDedupe.ts` จริง 3 จังหวัด — เชียงใหม่ 551 → 489 (override 0, merge 42, review 23/149), ชลบุรี 188 → 178 (9, 12/43), กรุงเทพฯ 626 → 598 (16, 17/103) ตรงทุก ATT_ID และลำดับ · ไม่ได้ย้าย: `testDedupe.ts`/`testProvinceSample.ts` (แทนด้วย test + dry-run P3), `findGoogleCollisionCandidates.ts` (เสนอเป็นคำเตือนใน dry-run P3), Google/upload (P3)
    - ~~**P2b:** กู้ #20 ลง `dedupeRules.ts`~~ — **ยกเลิก (D-26)**: ทิ้งกฎ hard code แล้วให้ admin ตัดสินใจใหม่ผ่านหน้าเว็บ
  - **P3 — เลือกจังหวัด + ตรวจสถานที่ซ้ำ/มีปัญหา + บันทึกการตัดสินใจ (①–⑤):** endpoint รายชื่อจังหวัดจาก CSV · endpoint วิเคราะห์จังหวัด (ใช้ `runDedupe` ของ P2a + ตัวตรวจใหม่: ชื่อซ้ำ, พิกัดพัง/นอกไทย/ห่างจังหวัด, ชื่อขยะ, พิกัดใกล้กันมากแต่ชื่อต่าง) · ตารางเก็บการตัดสินใจ (ผู้ใช้สร้าง, Claude เขียน SQL) · หน้า `admin/provinces/` + หน้ารีวิวกลุ่ม (merge เลือกค่าทีละช่อง) · แทน `dedupeRules.ts` ด้วยการตัดสินใจจาก DB
  - **P4 — นำเข้า (⑥):** job เรียก Google (`fetch` แทน `axios`) ตามการตัดสินใจ · พิกัดยึด CSV · ค้นชื่อไทยก่อน · รับข้อมูล Google เฉพาะเมื่อระยะ ≤ 2 km และ `google_place_id` ไม่ซ้ำ (#30) · ผลที่ไม่ผ่านกลับไปให้ admin ตัดสิน · เพิ่ม `gmaps_types` ใน record · แก้ type `opening_hours.periods` (#28) · env Google key ใน `backend/.env` (อัปเดต `.env.example` + PROJECT_OVERVIEW หัวข้อ 9) · หลังเสร็จ: นำเข้าใหม่ทุกจังหวัด (กรุงเทพฯ, ชลบุรี, เชียงใหม่) แทนข้อมูลเดิม (R2) — สำรอง `places` ก่อน และตัดสินตอนนั้นว่าจะลบแล้วนำเข้าใหม่ หรืออัปเดตตาม `att_id` เพื่อไม่ให้ทริปของผู้ใช้หาย
  - **P5 — category mapping (⑤):** หน้า `admin/categories/` (ต้องได้กฎ Stage 3 — Q3, และอาจรอ research POI — Q5) = R4
  - **P6 — ลบ `data-pipeline/`:** หลังตรวจว่าย้ายครบและ test ผ่าน (**ขอยืนยันผู้ใช้อีกครั้งก่อนลบ**) · เอาบรรทัด `data-pipeline/` ออกจาก `.gitignore` · ผู้ใช้ย้ายค่า key จาก `data-pipeline/.env` ไป `backend/.env` เอง · อัปเดต CLAUDE.md, skills และ docs ที่อ้าง data-pipeline · ไฟล์ที่ track ไว้กู้จาก git history ได้
- **ผู้ใช้ทำใน Supabase (Claude เขียน SQL ให้):** ตั้ง `users.role = 'admin'` (P1) · สำรอง `places` ก่อน P3 · สร้างตาราง `pipeline_jobs` (P3), ตารางกฎ merge/override (P4), `gmaps_type_category_map` (P5)
- **คำถามที่ยังเปิด:** ~~Q1~~ (D-24: เรียก backend `/api/admin/*`) · Q3 โค้ด/กฎ Stage 3 อยู่ที่ใคร · ~~Q4~~ (D-26: ไม่กู้ ให้ admin ตัดสินใจใหม่) · ~~Q2~~ (D-26: เก็บการตัดสินใจใน DB) · Q5 apply category mapping ก่อน research สูตร POI เสร็จได้ไหม (มีผลกับ POI score) · ~~Q6~~ (D-24: ใช้ jest ของ backend)
- **ความเสี่ยง:** job นำเข้า **ลบ** แถวใน `places` จริง (ต้องสำรองก่อน) · Google API มีค่าใช้จ่าย (dry-run + ยืนยัน + limit ต่อ job) · job ยาวรันใน process เดียวกับ API ของ user (จำกัดทีละ job) · RLS ปิดทุกตาราง (#27) ควรเปิด RLS ที่ `places` และ `pipeline_*` หลังเลิกใช้ data-pipeline
- **งาน T/R ที่เกี่ยวข้อง:** T22 ✅ (เงื่อนไขหลัก) · R2 (P3 ตรวจพิกัด CSV, P4 ตรวจการจับคู่ Google + นำเข้าใหม่แทนข้อมูลเดิม) · R4 (= P5) · T12 (Stage 3) · T7 (list `places` ต้องใช้ `.range()` ตั้งแต่แรก) · T19 (หน้า admin ใช้ pattern fetch เดิม ไม่ต้องรอ T19)

## กลุ่ม 1 — ปัญหาที่ทำให้ระบบใช้งานไม่ได้หรือมีความเสี่ยงสูง

### ✅ T1. ทำให้ frontend build ผ่าน และ build ได้บน OS ที่แยกตัวพิมพ์ — P0 (เสร็จ 2026-10-17)
- **สถานะ:** ✅ เสร็จ 2026-10-17 (commit "fix(frontend): make build pass (T1)") — แก้ Known Issues #2, #3, #4 · `loading` ใน auto.tsx เลือก **แสดง** โดยกู้บล็อก loading ที่ถูกลบใน `f5e6304` กลับมา (ไม่มีบล็อกนี้ หน้าจะโชว์ error ระหว่าง fetch) · ผลบน Windows: `npm run build` ผ่าน และ `git ls-files` แสดง `navbar.tsx` · ✅ ผู้ใช้ทดสอบ loading ของหน้า auto ใน UI จริงผ่าน (2026-10-17) · ไม่ทดสอบบน Linux/CI ตาม D-22
- **ไฟล์:** `frontend/src/features/auth/confirmEmail/confirmEmail.tsx`, `frontend/src/components/navbar.tsx` (ชื่อใน git index), `frontend/src/features/trip/e-tinerary/auto/auto.tsx`
- **สิ่งที่ต้องทำ:** แก้ import CSS ให้ตรงกับชื่อไฟล์จริง · rename ใน git ด้วย `git mv` สองขั้น (`Navbar.tsx` → ชื่อชั่วคราว → `navbar.tsx`) · ใช้หรือลบตัวแปร `loading` ที่ไม่ถูกใช้ใน auto.tsx (ต้องดูก่อนว่าตั้งใจจะแสดง loading state หรือไม่)
- **เสร็จเมื่อ:** `npm run build` ผ่านบน Windows และ `git ls-files frontend/src/components` แสดง `navbar.tsx`
- **ความเสี่ยง:** ต่ำ

### ✅ T2. ปิดช่องโหว่ ownership ของ `/auto-places` — P0 (เสร็จ 2026-10-17)
- **สถานะ:** ✅ เสร็จ 2026-10-17 (commit `381dc8d`) — เลือก **เพิ่มการเช็คเจ้าของ** (ไม่ลบ endpoint เพราะส่วน Auto Trip เพื่อนในทีมดูแลอยู่) แก้ Known Issue #5 · backend tsc ผ่าน · ✅ ผู้ใช้ทดสอบกับ Supabase จริงผ่าน (2026-10-17): 200 / 403 / 404 / 401
- **ไฟล์:** `backend/src/features/itinerary/itineraryController.ts` (`getAutoTripPlacesTest`)
- **สิ่งที่ต้องทำ:** เพิ่ม `getTripOwnerAndStart` + เช็ค `userId` แบบเดียวกับ endpoint อื่น หรือพิจารณาลบ endpoint นี้ (frontend ใช้แค่เป็น pre-check ใน `TripRecommendations.handleAutoTrip`)
- **เสร็จเมื่อ:** ถ้าเรียกทริปของคนอื่นต้องได้ 403
- **ความเสี่ยง:** ถ้าลบ endpoint ต้องแก้ `TripRecommendations.tsx` ไปพร้อมกัน

### ✅ T22. แยก Supabase client ของ auth ออกจาก client ที่ใช้ query ข้อมูล — P0 (เสร็จ 2026-10-17)
- **สถานะ:** ✅ เสร็จ 2026-10-17 — แก้ Known Issue #21 · เพิ่ม `createAuthClient()` ใน `config/db.ts` (สร้าง client ใหม่ทุกครั้ง, `persistSession`/`autoRefreshToken`/`detectSessionInUrl: false`) แล้วให้ `register`/`login` เรียก `signUp`/`signInWithPassword` ผ่านตัวนี้ · client หลัก, query `users`, `admin.signOut` และ `requireAuth` ไม่เปลี่ยน · ผู้ใช้แจ้งว่า RLS ของ `trips`/`itineraries`/`poi_scores`/`users` ปิดอยู่ · backend tsc ผ่าน · script offline (URL/key ปลอม + mock fetch) ยืนยันว่าพฤติกรรมเดิมทำให้ query ใช้ JWT ของผู้ใช้จริง และหลังแก้ query ใช้ service key (7/7) · ✅ ผู้ใช้ทดสอบกับ Supabase จริงผ่าน (2026-10-17): login/logout/login ซ้ำ, login X แล้ว Y เห็น MyTrips ของตัวเองครบ, register/ยืนยันอีเมล
- **หมายเหตุ:** ตั้ง `persistSession: false` ที่ client หลักอย่างเดียวไม่พอ เพราะ auth-js ยังเก็บ session ไว้ใน memory (`GoTrueClient.js` กรณี `persistSession` เป็น false) จึงต้องใช้ client แยกที่ทิ้งหลังใช้
- **ไฟล์:** `backend/src/config/db.ts`, `backend/src/features/auth/authController.ts` (`register`, `login`)
- **สิ่งที่ต้องทำ (ข้อเสนอ):** ให้ `signUp`/`signInWithPassword` ใช้ client แยกที่ไม่แชร์ session กับ client หลัก (เช่น สร้าง client ใหม่ต่อ request ด้วย `auth: { persistSession: false, autoRefreshToken: false }`) ส่วน client service role หลักต้องไม่มี session ติดอยู่เลย
- **ก่อนเริ่ม:** เป็นงาน auth ต้องให้ผู้ใช้ยืนยันแนวทางตาม CLAUDE.md กฎข้อ 4 · ควรรู้ก่อนว่าตาราง `trips`/`itineraries`/`poi_scores`/`users` เปิด RLS ไว้หรือไม่ (เพื่อประเมินผลกระทบ)
- **เสร็จเมื่อ:** login ด้วยบัญชี X แล้วบัญชี Y ยังเห็นทริปของตัวเองครบ (MyTrips) และ query ของ backend ใช้ service role เสมอ
- **ความเสี่ยง:** กลาง — ถ้า RLS ปิดอยู่จะไม่เห็นความต่าง ถ้า RLS เปิดอยู่ ผลของบาง query อาจเปลี่ยนจาก "ว่าง" เป็น "ครบ"

### T3. กันแผนเดิมหายตอน confirm — P1
- **ไฟล์:** `itineraryController.confirmItinerary`
- **ทางเลือก (ต้องให้เจ้าของโปรเจกต์ตัดสินใจ):** (ก) ย้ายไปทำใน Postgres function/RPC ให้ delete+insert อยู่ใน transaction เดียว (ต้องแก้ DB) (ข) insert ก่อนแล้วค่อยลบแถวเก่า (ต้องรู้ unique constraint ของ `itineraries`)
- **ก่อนเริ่ม:** ต้องรู้ schema ของ `itineraries`
- **เสร็จเมื่อ:** ถ้าจำลองให้ insert fail แผนเดิมยังอยู่

### T4. Sync `trip_days` เมื่อแก้ไขทริป — P1
- **สถานะ:** Known Issue #6
- **ไฟล์:** `tripController.updateTrip`, `itineraryPlaceQueries.getOrCreateTripDays`
- **ต้องตัดสินใจก่อน:** ถ้าวันที่เปลี่ยน แผนที่ยืนยันไว้แล้วควร (ก) ลบทิ้ง (ข) เก็บวันที่ยังซ้อนทับอยู่ หรือ (ค) ไม่อนุญาตให้แก้วันที่เมื่อมีแผนแล้ว
- **เสร็จเมื่อ:** แก้เวลาเริ่มหรืองบแล้วสร้าง draft ใหม่ ต้องเห็นค่าใหม่ใน editor

## กลุ่ม 2 — งานที่จำเป็นต่อฟีเจอร์หลัก

### T5. ยืนยันความหมายของงบ (กลุ่ม vs ต่อคน) — P1
- **สถานะ:** Needs Verification #3
- **ไฟล์:** `createTrip.tsx` (คำนวณ `daily_budget`), `poiPlaceQueries.getFilteredPlaces` (ขั้น 3), `itineraryBuilder.ts` ทั้งสองฝั่ง (`cumulativeCost`), `utils/priceLevel.ts`
- **สิ่งที่ต้องทำ:** เจ้าของโปรเจกต์ต้องตอบว่า `PRICE_LEVEL_TO_BAHT` เป็นราคาต่อคนหรือไม่ ถ้าใช่ ต้องคูณ `number_of_people` หรือเทียบกับ `daily_budget / people` ให้ตรงกันทุกจุด และต้องบันทึกเป็น decision ใน DECISIONS.md
- **ความเสี่ยง:** กระทบผลแนะนำ และทำให้ conflict ของแผนที่บันทึกไว้แล้วเปลี่ยนไป

### T6. ทำ Auto Trip ให้เสร็จ — P1 (commit `44d26dd` ระบุว่า "not done yet")
- **ไฟล์:** `autoTripBuilder.ts`, `itineraryController.buildAutoTripController`, `itineraryPlaceQueries.getAutoTripPlaces`, `auto.tsx`, `App.tsx`
- **สิ่งที่ต้องทำ (ข้อเสนอ):**
  1. ใช้ `checkOpeningStatus()` จาก `utils/openingHoursChecker.ts` แทน `isOpenAt`/`isPlaceOpen` (Known Issue #9)
  2. ตัดสินใจว่าจะเลือกกี่ที่ต่อวัน/ต่อ category (ตอนนี้ได้ 1 ที่ต่อ category ทั้งทริป)
  3. ใช้ `buildTravelMatrix` + `buildItinerary` ตัวเดียวกับ manual flow เพื่อให้ผลตรงกับตอน confirm
  4. เพิ่ม `price_level` ใน select (Known Issue #11)
  5. ครอบ `/trip/:id/auto` ด้วย `ProtectedRoute` (Known Issue #12)
  6. แก้ปุ่ม "แก้ไข" ให้สร้าง draft + places state ที่ editor ต้องการ (Known Issue #10) โดยดูวิธีใน `TripDetail.tsx` ที่ทำเรื่องเดียวกันอยู่แล้ว
- **ก่อนเริ่ม:** T1, T2 · ต้องคุยเรื่อง requirement ของ Auto Trip
- **เสร็จเมื่อ:** auto trip ไม่เลือกที่ที่ปิดในวันนั้น, กดยืนยันแล้วไม่มี conflict จาก backend, และกดแก้ไขแล้วเปิด editor ได้

### T7. ตรวจข้อจำกัด 1000 แถวของ Supabase — P1
- **ไฟล์:** `placeDropdownController.ts`, `poiPlaceQueries.queryPlacesWithCategoryInfo`
- **สิ่งที่ต้องทำ:** ตรวจ count จริงใน Supabase ถ้าเกิน max rows ให้ paginate ด้วย `.range()` (data-pipeline ใช้วิธีนี้อยู่แล้ว) หรือใช้ RPC `select distinct`
- **เสร็จเมื่อ:** จำนวนผลลัพธ์เท่ากับ count จาก SQL

## กลุ่ม 3 — งานที่ยังไม่เสร็จตามหลักฐาน
- **T8 (P2)** เก็บกวาด weather debug: ลบหรือครอบ `debugOpenMeteo`/`debugRainGrid`/`explainWeatherScore` ด้วย env flag (`poiController.ts`)
- **T9 (P2)** เตรียม config สำหรับ production: ใช้ `FRONTEND_URL` สำหรับ CORS และ `emailRedirectTo`, เพิ่ม script `build`/`start` ใน backend · **ต้องรู้ปลายทาง deploy ก่อน**
- **T10 (P2)** ย้ายการเรียก ORS directions ไปทำผ่าน backend proxy (Known Issue #8)
- **T11 (P2)** จัดการ token หมดอายุ: ถ้า API ตอบ 401 ให้ logout แล้วพาไป `/login` หรือใช้ refresh token (ตัดสินใจก่อนลงมือ) · พิจารณาที่เก็บ session ไปพร้อมกัน (Known Issue #23)
- **T23 (P2)** ลดข้อมูลที่หลุดใน error response: ตอบ 500 ด้วยข้อความภาษาไทยทั่วไปแล้ว `console.error` รายละเอียดไว้ฝั่ง server (Known Issue #24) · เพิ่ม validation ที่ขาด (Known Issue #25): จำกัดจำนวน `ids` ใน `/api/places`, validate field ของ `register` และพิจารณาว่า `place_ids` ต้องอยู่ใน `poi_scores` ของทริปหรือไม่ (ต้องถามทีมก่อน เพราะกระทบ flow ของ editor/Auto Trip)
- **T12 (P3)** ข้อมูลจังหวัดอื่น / Stage 3 สำหรับกรุงเทพฯ และชลบุรี — ต้องหาโค้ด Stage 3 ก่อน (ไม่มีใน repo)

## กลุ่ม 4 — การทดสอบและการตรวจสอบความถูกต้อง
- **T13 (P1)** Unit test ของ pure functions ที่เป็นหัวใจของระบบ (ไม่ต้องใช้ DB): `poiScoreCalculator.ts`, `itineraryBuilder.buildDayItems`, `openingHoursChecker.checkOpeningStatus` (เคสข้ามเที่ยงคืน, หลายช่วงต่อวัน, 24 ชม.), `tripController.validateNoMidnightCrossing` (ต้อง export ก่อน), `autoTripBuilder` (ส่วน `poiScoreCalculator.ts` ช่วย R1/R3 ให้ทำคู่กัน)
- **T14 (P1)** **Parity test** ระหว่าง backend และ frontend mirror: ใช้ input ชุดเดียวกันต้องได้ผล `buildDayItems` และ `checkOpeningStatus` ตรงกัน (ใช้ vitest import ไฟล์ backend โดยตรงผ่าน relative path หรือใช้ JSON fixture ร่วมกัน)
- ✅ **T15 (P2)** แก้ jest/ts-jest ให้ major version ตรงกัน แล้วยืนยันว่า `npm test` รันได้ — **เสร็จ 2026-10-17 โดยไม่ต้องเปลี่ยน version:** ts-jest 29.4.11 มี peerDependencies `jest ^29.0.0 || ^30.0.0` (ts-jest ไม่ออก major ตาม jest, `latest` บน npm = 29.4.15), `npm ls` ไม่มี peer warning และ test ชั่วคราว (นอก repo) ที่ใช้ jest/ts-jest/tsconfig ของ backend import `src/utils/haversine.ts` ผ่าน 2/2 · `npm test` ยัง exit 1 เพราะ "No tests found" จนกว่าจะมีไฟล์ test (T13/T14)
- **T16 (P2)** ทำ ESLint errors ให้เป็นศูนย์ (เริ่มจาก `react-hooks/refs` ใน `RecommendationMap.tsx:209` ซึ่งอาจเป็น bug จริง) · **ความคืบหน้า 2026-10-17 (commit `caba1a9`):** ตั้ง `argsIgnorePattern: "^_"` ใน `frontend/eslint.config.js` แก้ `no-unused-vars` 4 ตัว (พารามิเตอร์ `_` ของ `buildInitialDraft` ที่ตั้งใจไม่ใช้ ไม่ได้แตะไฟล์ mirror) เหลือ 29 errors / 4 warnings: `no-explicit-any` 24, `react-hooks/*` 7, `react-refresh/only-export-components` 2
- ✅ **T17 (P2)** checklist manual E2E — ผู้ใช้ตัดสินใจ (2026-10-17) ให้ใช้ checklist ในข้อ 7 ของ skill `verify-changes` ไม่ทำไฟล์แยก

## กลุ่ม 5 — คุณภาพและประสิทธิภาพ
- ✅ **T18 (P3)** ลบ dead code (Known Issue #16) — ยืนยันกับเจ้าของก่อน เพราะ comment ระบุว่า `buildNearestNeighborOrder` ตั้งใจเก็บไว้ · **ส่วนไฟล์เสร็จ 2026-10-17 (commit `7395d54`):** ผู้ใช้ยืนยันให้ลบ `backend/src/app.ts`, `backend/src/features/itinerary/routeCalculator.ts`, `frontend/src/config/db.ts`, `frontend/src/features/auth/authAPI.ts` (grep แล้วไม่มีที่ import) · backend/frontend tsc ผ่าน, lint เท่า baseline (29/4), build ผ่าน · ไม่แตะ `buildNearestNeighborOrder` · **ส่วน dependency เสร็จ 2026-10-17 (ผู้ใช้ยืนยัน):** ถอด `pg`/`postgres`/`@types/pg`/`axios` ของ backend และ `@supabase/supabase-js` ของ frontend, ลบ `VITE_SUPABASE_*` ออกจาก `.env.example` · backend tsc + โหลด module offline 30/30, frontend tsc/build ผ่าน, lint 29/4 · หลัง pull ต้อง `npm install` ทั้งสองฝั่ง · ✅ ผู้ใช้รัน `npm run dev` ทั้งสองฝั่งกับ Supabase จริงหลังแก้แล้ว
- **T19 (P3)** รวม fetch helper ของ frontend (ใส่ base URL + Authorization ให้อัตโนมัติ) ปัจจุบันบางไฟล์ใช้ `VITE_API_URL` บางไฟล์ใช้ `/api` ตรงๆ
- **T20 (P3)** แตกไฟล์ขนาดใหญ่ (`auto.tsx` 1,613 บรรทัด, `createTrip.tsx` 1,110, `ItineraryEditor.tsx` 1,050) — ทำหลังจากมี test แล้วเท่านั้น
- **T21 (P3)** ทำให้ `.gitattributes` กำหนด line ending ให้ชัดเจน

## กลุ่ม 6 — งานเพิ่มเติมที่ไม่เร่งด่วน
- Weather มิติอื่น (ความร้อน/UV/PM2.5) ตามที่ comment ใน `poiScoreCalculator.ts` ระบุว่าเป็นแนวทางพัฒนาต่อ
- Sensitivity analysis ของค่า MIXED (0.3/0.5/0.7) ตามที่ comment ใน `poiScoreCalculator.ts` แนะนำ
- ~~เขียน README จริง~~ — README.md เป็นแผนงานของทีมแล้ว (ดูกลุ่ม 0)

## ลำดับที่แนะนำ
**อัปเดต 2026-10-17:** ผู้ใช้สั่งพักงานสูตร POI และส่วนที่เกี่ยวข้อง (R1, R3, T13 ส่วน POI, T5, กลุ่ม 6) จนกว่าเพื่อนจะ research เสร็จ และเลือกเริ่ม R5 ก่อน · B4 (T13 ส่วนที่ไม่ใช่ POI + T14) และ B3 (`no-explicit-any`) พักไว้ ไม่ขวาง R
`T1 ✅ → T2 ✅ → T22 ✅ → T15 ✅ → T18 ✅ → R5 (D-24): P1 admin login → P2 ย้าย dedupe + กู้ #20 + test → P3 นำเข้าจังหวัด → P4 สถานที่ซ้ำ (ครอบคลุม R2) → P5 category mapping (= R4, รอ Stage 3/research) → P6 ลบ data-pipeline → R1/R3 เมื่อ research เสร็จ (T7 + T13 ส่วน POI ก่อนเทียบ Top 50) → B4 → B3 → T5 → T4 → T3 → T6 → ที่เหลือ`
> ลำดับ R ใน README หัวข้อ 4 คือ R1 → R2 → R3 → R4 → R5 — ลำดับนี้สลับเอา R5 ขึ้นก่อนตามคำสั่งผู้ใช้ (R1/R3 ติด research)
