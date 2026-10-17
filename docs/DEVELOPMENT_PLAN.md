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
- **งาน T ที่ซ้อน:** T12 (ข้อมูลจังหวัดอื่น / Stage 3) · Known Issue #15 (`.gitignore` ของ data-pipeline)

### R3. ตรวจสอบและแก้ไข Distance Cap — เร่งด่วน (README 1.3, ลำดับ 3)
- **สถานะใน README:** ค้างอยู่
- **ไฟล์:** `backend/src/features/poi/poiScoreCalculator.ts` (`calculateDistanceScore` = `1 / (1 + distanceKm)`), `backend/src/utils/orsDistance.ts` (`getRoadDistancesKm` ระยะทางถนนจาก ORS, fallback เป็น haversine), `backend/src/features/poi/poiController.ts` (ส่ง `distanceKm` เข้าสูตร)
- **ข้อเท็จจริง:** ยังไม่มี cap ในโค้ด สูตรได้ 0.5 ที่ 1 km, ≈0.09 ที่ 10 km, ≈0.05 ที่ 20 km จึงแบนตั้งแต่ราว 10 km ตามที่ README บอก (README ห้ามใช้ 10 km เป็นค่า cap สุดท้ายโดยไม่ทดสอบก่อน)
- **งาน T ที่ซ้อน:** T13 (unit test `calculateDistanceScore`) · R2 (พิกัดผิดทำให้ระยะทางผิด ต้องแยกผลของสองงานตาม README หัวข้อ 4)
- ⚠️ เปลี่ยนสูตรคะแนนเป็นงานเสี่ยงตาม CLAUDE.md กฎข้อ 4

### R4. ตรวจสอบ Category Mapping ทั้งระบบ — ปกติ (README 2.1, ลำดับ 4)
- **สถานะใน README:** รอตรวจสอบ
- **ไฟล์:** `data-pipeline/src/fetchGmapsCategories.ts` (เติม `places.gmaps_types` จาก Google Places), `backend/src/features/poi/poiPlaceQueries.ts` (`queryPlacesWithCategoryInfo` อ่าน `place_categories` แล้ว dedupe เลือก `confidence_score` สูงสุด, category fallback ใน `getFilteredPlaces`), `poiScoreCalculator.calculateCategoryScore`, ตาราง `categories` / `place_categories` / `trip_categories`
- **ข้อเท็จจริง:** ใน repo **ไม่มีโค้ด** ที่แปลง `gmaps_types` → `place_categories.confidence_score` (เป็นส่วนเดียวกับ Stage 3 ที่ T12 ระบุว่าหาไม่เจอ) ต้องขอโค้ดหรือกฎจากทีมก่อน
- **งาน T ที่ซ้อน:** T12 (โค้ด Stage 3) · T7 (`place_categories` อาจโดน limit 1000 แถว) · กฎ multi-category dedupe ใน CLAUDE.md

### R5. ออกแบบและพัฒนา Admin Panel — ต้องทำ (README 3.1, ลำดับ 5) · **งานถัดไป (วางแผน 2026-10-17)**
- **สถานะใน README:** รอดำเนินการ · **requirement ที่ผู้ใช้ยืนยัน (D-23):** admin ที่ login ด้วย role `admin` ใช้หน้า UI เพื่อ (1) เลือกเพิ่มจังหวัดจาก `attraction.csv` (2) จัดการสถานที่ซ้ำ (3) จัดการ category mapping — logic ฝั่งหลังทั้งหมดอยู่ใน `data-pipeline/` แทนการรัน `npm run upload:*` / `fetch-gmaps-categories:*` เอง
- **สถาปัตยกรรมที่เสนอ (ข้อเสนอ — ยังรอยืนยันข้อ Q1, Q2):** frontend `/admin/*` (login เดิม) → data-pipeline service (Express, port ใหม่ เช่น 5100, ผ่าน Vite proxy) → `requireAdmin` (`getUser(token)` บน client แยกตามบทเรียน T22 + อ่าน `users.role` จาก DB ทุก request ตาม #22) → Supabase ด้วย service role (เลิกใช้ anon key) · แยก `main()` ของ script เป็นฟังก์ชันที่รับพารามิเตอร์ (`importProvince({ province, limit, dryRun })` ฯลฯ) และเก็บ `npm run` เดิมไว้เป็น CLI สำรอง · งานยาวรันเป็น job (ตาราง `pipeline_jobs`: สถานะ/progress/log/ผู้สั่ง) ทีละงาน ยกเลิกได้
- **Flow ใหม่:** ① เลือกจังหวัด (รายชื่อจาก CSV + สถานะนำเข้า) → ② **Dry-run บังคับ** (override พิกัด → dedupe → กฎ merge จาก DB; แสดงจำนวนแถวก่อน/หลัง, review groups, จำนวน Google request, จำนวนแถวที่จะลบ) → ③ จัดการสถานที่ซ้ำ (ยืนยัน merge / ห้าม merge / exclude / แก้พิกัด → บันทึก DB, วนกลับ ② ได้) → ④ ยืนยันนำเข้า (job: Find Place + Details **ดึง `type` → `gmaps_types` พร้อมกันในครั้งเดียว** → upsert `places` → ลบแถว `csv:*` ที่ถูกแทนที่) → ⑤ category mapping (ตาราง `gmaps_type → category + confidence` แก้ได้ → ดูผลกระทบ → apply เขียน `place_categories` ตามกติกา `confidence_score` สูงสุด) · `fetchGmapsCategories` เหลือเป็น job เติมย้อนหลังให้จังหวัดที่นำเข้าแล้ว (กรุงเทพฯ, ชลบุรี)
- **Phase 0 — เตรียม (ต้องทำก่อน ตามลำดับ):**
  1. **#15** แก้ `.gitignore` เลิก ignore `data-pipeline/` ทั้งโฟลเดอร์ (ยังกัน `.env`, `node_modules`) — งานแรกของรอบหน้า
  2. **#20** กู้ `manualOverrides.ts` จาก `44d26dd^` (ลบไป 99 บรรทัด ไม่ใช่แค่ `locationOverrides` 4 รายการ) — รอผู้ใช้ยืนยันว่ารายการไหนตั้งใจเอาออก (Q4) · ตรวจผลด้วย `npm run test:dedupe:chiangmai` (อ่าน CSV อย่างเดียว แต่ต้องถามก่อนรัน) แล้วเทียบกับ `chiangmai_dedupe_detail.txt` (551 → 498 แถว, 37 กลุ่ม, review 24 กลุ่ม/155 แถว, override 4)
  3. ตอบคำถามที่เหลือ (Q1–Q6) แล้วบันทึกเพิ่มใน D-23
  4. Unit test ของ `dedupe.ts` (characterization) ก่อน refactor — ต้องเพิ่ม test runner เป็น devDependency ของ data-pipeline (Q6)
  5. หลังข้อ 2 และ 4 เสร็จ: ย้ายตัวเลขสำคัญไป test/docs แล้ว `git rm` `data-pipeline/chiangmai_*.txt` และเพิ่ม `data-pipeline/*.txt` ใน `.gitignore`
- **ผู้ใช้ทำใน Supabase (Claude เขียน SQL ให้):** สำรอง `places` ก่อนเปิด phase 2 · ตั้ง `users.role = 'admin'` ให้บัญชีทดสอบ · สร้างตาราง `pipeline_jobs`, `pipeline_location_overrides`, `pipeline_merge_rules`, `gmaps_type_category_map` (ทีละ phase) · เพิ่ม `SUPABASE_SERVICE_ROLE_KEY` ใน `data-pipeline/.env` (Claude อัปเดตแค่ `.env.example`)
- **Phase 1** โครง service + `requireAdmin` + frontend `/admin` + `AdminRoute` (ถามสถานะ admin จาก service ไม่ใช้ `localStorage`) · **Phase 2** ①②④ (refactor `uploadProvinceGooglePlaces`, เพิ่ม `gmaps_types` ใน `PlaceRecord`, แก้ type `opening_hours.periods` ใน `types.ts`) · **Phase 3** ③ แบบเต็ม (ย้ายกฎ merge/override ไป DB) · **Phase 4** ⑤ (ต้องได้กฎ Stage 3 — Q3, และอาจรอ research POI — Q5)
- **คำถามที่ยังเปิด:** Q1 frontend เรียก data-pipeline ตรง (แนะนำ) หรือผ่าน backend · Q2 เก็บกฎ merge/override ในตาราง Supabase (แนะนำ) หรือไฟล์ JSON · Q3 โค้ด/กฎ Stage 3 อยู่ที่ใคร · Q4 กู้ #20 ทั้งหมดไหม ใครยืนยัน · Q5 apply category mapping ก่อน research สูตร POI เสร็จได้ไหม (มีผลกับ POI score) · Q6 อนุญาตเพิ่ม test runner ใน data-pipeline
- **ความเสี่ยง:** job นำเข้า **ลบ** แถวใน `places` จริง (ต้องสำรองก่อน) · Google API มีค่าใช้จ่าย (dry-run + ยืนยัน + limit ต่อ job) · RLS ปิดทุกตารางและ data-pipeline เดิมเขียนด้วย anon key (Known Issue #27) ควรเปิด RLS ที่ `places` และ `pipeline_*` หลังเปลี่ยนเป็น service role
- **งาน T/R ที่เกี่ยวข้อง:** T22 ✅ (เงื่อนไขหลัก) · R2 (phase 3 เป็นเครื่องมือแก้พิกัด) · R4 (= phase 4) · T12 (Stage 3) · T7 (list `places` ต้องใช้ `.range()` ตั้งแต่แรก) · T19 ไม่จำเป็นถ้าเลือก Q1 แบบเรียกตรง (หน้า admin ใช้ helper ของตัวเอง)

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
`T1 ✅ → T2 ✅ → T22 ✅ → T15 ✅ → T18 ✅ → R5 phase 0 (#15 → #20 → D-23/Q1–Q6 → test dedupe → ลบ chiangmai_*.txt) → เตรียม Supabase → R5 phase 1 → 2 → 3 (ครอบคลุม R2) → 4 (= R4, รอ Stage 3/research) → R1/R3 เมื่อ research เสร็จ (T7 + T13 ส่วน POI ก่อนเทียบ Top 50) → B4 → B3 → T5 → T4 → T3 → T6 → ที่เหลือ`
> ลำดับ R ใน README หัวข้อ 4 คือ R1 → R2 → R3 → R4 → R5 — ลำดับนี้สลับเอา R5 ขึ้นก่อนตามคำสั่งผู้ใช้ (R1/R3 ติด research)
