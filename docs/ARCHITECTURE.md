# ARCHITECTURE — ระบบทำงานอย่างไร

> อธิบายจากโค้ดที่ commit `0c980bd` ถ้าแก้ logic ส่วนใด ต้องอัปเดตไฟล์นี้ด้วย (ดู skill `update-project-docs`)

## 1. ภาพรวม

```text
Browser (React SPA, Vite)
  │  fetch("/api/...")  + Authorization: Bearer <supabase access_token จาก localStorage>
  │  (dev: Vite proxy /api → http://localhost:5000)
  │
  ├── ORS Directions (เรียกตรงจาก browser ใน RouteMap.tsx)
  ├── Google Maps JS (LocationPinPicker.tsx)
  └── OSM tiles (Leaflet)
  ▼
Express API (backend/src/server.ts)
  ├── requireAuth → supabase.auth.getUser(token)
  ├── Supabase Postgres (service role key — ข้าม RLS ทั้งหมด)
  ├── ORS Matrix (orsDistance.ts: 1×N, orsTravelMatrix.ts: N×N) + cache ใน memory
  └── Open-Meteo forecast (weatherForecast.ts) + cache ใน memory 2 ชม.

หน้า /admin ── /api/admin/* (requireAuth + requireAdmin) ── backend/src/admin/
  ├── อ่าน data/attraction.csv → ตรวจสถานที่ซ้ำ/มีปัญหา → admin_place_decisions
  └── job นำเข้า → Google Places (Find Place + Details) → places, pipeline_jobs/_items (type จาก Google เก็บที่ `places.gmaps_types` — ไม่เขียน place_types แล้ว P5g)

```

backend เก็บ state ที่ไม่ได้อยู่ใน DB ไว้แค่ cache ใน memory (ORS, weather) เท่านั้น ถ้ารันหลาย instance cache จะไม่แชร์กัน

## 2. Flow หลักของผู้ใช้

```text
Register/Login ─► Home ─► Create Trip ─► Recommendations (แสดง POI Score) ─┬─► Itinerary Editor ─► Confirm ─► Trip Detail
                                                                          └─► Auto Trip (กรอกเวลาต่อหมวด) ─► Confirm ─► Trip Detail
MyTrips ─► Trip Detail ─► Itinerary Editor (แก้ไขแผน) / แก้ไขข้อมูลทริป (/trip/:id/edit → กลับ Recommendations · ถ้าวัน/เวลา/งบต่อวันเปลี่ยน แผนเดิมถูกล้าง — D-29)
```

### 2.1 Auth
- `POST /api/auth/register`: `supabase.auth.signUp` แล้ว insert `users` (role `user`), redirect ใน email ถูก **hardcode** เป็น `http://localhost:5173/login` · Supabase แนบ session มาใน URL hash ซึ่ง `login.tsx` ล้างทิ้งทันทีด้วย `navigate(..., { replace: true })` เพราะ frontend ไม่ได้ใช้ token นี้ (#26)
- `POST /api/auth/login`: `signInWithPassword` → บังคับว่าต้อง `email_confirmed_at` → อ่าน profile จาก `users` → อัปเดต `last_login` → คืน `{ user, session }` · `signUp`/`signInWithPassword` เรียกผ่าน `createAuthClient()` (client ใหม่ต่อ request ใน `config/db.ts`) เพื่อไม่ให้ session ไปติดกับ client หลักที่ใช้ query (T22, แก้ Known Issue #21 เมื่อ 2026-10-17)
- Frontend `AuthContext` เก็บ `user`/`session` ใน `localStorage` และไม่มีโค้ด refresh token (ตรวจด้วย grep แล้วไม่พบ) — **พฤติกรรมเมื่อ token หมดอายุ: ต้องตรวจสอบเพิ่มเติม**
- `logout` เรียก `supabase.auth.admin.signOut(token)`

### 2.2 สร้าง/แก้ไขทริป (`tripController.ts`)
- frontend เป็นคนคำนวณ `daily_budget` (`createTrip.tsx` ~บรรทัด 478–497) จาก scope (`GROUP`/`PER_PERSON`) × period (`TOTAL_TRIP`/`PER_DAY`) ได้ผลเป็น **งบต่อคนต่อวัน** (D-51) เทียบกับราคาต่อคนของสถานที่ตรงๆ
- backend validate: ต้องมี province, ต้องปักหมุด, พิกัดต้องอยู่ในช่วง, `number_of_people` ต้องเป็นจำนวนเต็ม ≥ 1, `start_time + available_time_per_day` ต้องไม่เกินเที่ยงคืน
- การบันทึก `trip_categories` เป็นแบบ best-effort (ไม่ rollback แต่คืน `categoryWarning`)
- ownership: query ใช้ `.eq("trip_id").eq("user_id")` ทุกครั้ง

### 2.3 POI Recommendation (`features/poi/`)
pipeline ใน `getFilteredPlaces()` ต้องทำตามลำดับนี้ (ตามที่ comment ระบุ):
1. กรอง province (บังคับ) แล้ว AND กับ district ถ้ามี
2. Hard filter งบ: ตัดที่ที่ `PRICE_LEVEL_TO_BAHT[priceLevel] > dailyBudget` ทิ้ง (ถ้าเป็น paid และไม่มีราคา ให้ปล่อยผ่าน)
3. หมวด (D-48): ถ้าผู้ใช้เลือกหมวด นับสถานที่ที่ตรงหมวด (หลังกรองงบ) — ≥ 50 ที่ เหลือเฉพาะที่ตรงหมวด · < 50 ที่ (รวม 0) เก็บทุกที่ในพื้นที่ ที่ไม่ตรงหมวดได้ `category_score` 0 (`categoryMatchCount`, `categoryFilled`) · ไม่ได้เลือกหมวด = ตัด category ออกจากสูตร
(ขั้นที่ 4 hard filter เวลาเดิม ตัดออกแล้ว 2026-10-22 — D-38, R5 P5c)
หลังคำนวณจะ upsert Top 50 ลง `poi_scores` แล้วลบแถวของทริปที่หลุดจากผลรอบนี้

จากนั้นคำนวณระยะทางถนนจากจุดเริ่มต้น (ORS ถ้าใช้ไม่ได้ใช้ haversine) และโอกาสฝนเฉลี่ยตาม grid 0.1° แล้วจึงคำนวณ `calculatePoiScore()`

| มิติ | สูตร | weight |
|---|---|---|
| category | 1.0 ทุกที่ตั้งแต่ P5c (1 สถานที่ = 1 หมวด ไม่มี confidence — D-38 · สูตรรอทีม D-23) | 0.35 |
| rating | `rating/5` (ถ้าเป็น null ให้ 0.5) | 0.25 |
| distance | `1/(1+km)` | 0.15 |
| budget(=price) | free: 0.9 (มีราคา) / 0.8 (ไม่มี) · paid: `(80-20*level)/100` · paid ไม่มีราคา: weight 0 | 0.15 |
| weather | `exposure*(1-rain)+(1-exposure)` ใช้ OUTDOOR=1, MIXED=0.5, INDOOR=0 · ไม่มีพยากรณ์ให้ 1.0 | 0.10 |

ถ้า `useBudget=false` หรือ budget weight=0 จะ renormalize 4 มิติที่เหลือให้ผลรวมเป็น 1 (`computeWeights`) จากนั้นเรียงลำดับ ตัดเหลือ top 50 แล้ว upsert ลง `poi_scores`

**หมวดของสถานที่ (ตั้งแต่ R5 P5c 2026-10-22):** มาจากป้าย ททท. — `places.att_type_label` → `category_labels` → `categories` (D-35/D-39) 1 สถานที่ = 1 หมวด · POI และ Auto Trip ใช้ relation นี้จับคู่สถานที่ · `getSelectedPlaces` ใช้ embed แบบไม่บังคับ inner join เพื่อไม่ให้ความสัมพันธ์หมวดตัดแถวสถานที่ออกจากผลค้นหา · Auto Trip โหลดหมวดที่ผู้ใช้เลือกจาก `trip_categories` → `categories` (D-45) · ไม่อ่านตาราง `place_categories` หรือคอลัมน์ `default_duration_min` ที่ถูกลบใน P5g

### 2.4 Itinerary (manual) — `features/itinerary/` + frontend mirror
1. `POST /draft` `{place_ids}`: lazy-create `trip_days` ตามช่วงวันที่ (ครั้งแรกเท่านั้น), `buildInitialDraft()` จะคืน `[]` เสมอ (final design คือไม่จัดลงวันอัตโนมัติ) และคืน `travelMatrix` N×N (ORS + fallback haversine ที่ 25 km/h)
2. Frontend `ItineraryEditor.tsx` (dnd-kit) จะ recompute ทุกครั้งที่มีการลาก ด้วย `frontend/.../lib/itineraryBuilder.ts` ซึ่ง **mirror** มาจาก `backend/.../itineraryBuilder.ts` (ตรวจด้วย diff แล้วว่า `buildDayItems` ตรงกันทุกบรรทัด) และ `lib/openingHoursChecker.ts` ซึ่ง mirror จาก `backend/src/utils/openingHoursChecker.ts`
3. `PUT /itinerary/trips/:id` `{days:[{trip_day_id, place_ids}], visit_durations:{[place_id]: นาที}}`: ตรวจเวลาที่อยู่ก่อน (`visitDurations.ts::parseVisitDurations` — ทุกสถานที่ในแผนต้องเป็นจำนวนเต็ม 1–1440 ไม่งั้น 400 ก่อนลบแผนเดิม · D-36) แล้ว backend สร้าง matrix ใหม่และ `buildItinerary()` ใหม่ ถ้ามี `isClosedConflict|isTimeConflict|isBudgetConflict` จะปฏิเสธ (400) **ก่อน**ลบ ถ้าผ่านจะลบ itineraries เดิมของทุกวันแล้ว insert ใหม่ (ไม่ใช่ transaction)
4. กฎใน `buildDayItems`: Day 1 มี leg จาก `TRIP_START_ID` ส่วน Day 2+ ที่แรกไม่มี leg · เวลาที่อยู่ = `PlaceInput.visitDurationMin` ที่ผู้ใช้กรอกใน Editor (D-36, R5 P5f — แทน `categories.default_duration_min`) ถ้ายังไม่กรอก (null) ไม่มีเวลาจบ เช็คเวลาเปิดแค่ตอนไปถึง (duration 0) และสถานที่ถัดไปในวันนั้นไม่มีเวลา · บันทึกที่ `itineraries.visit_duration_min` · time conflict เกิดเมื่อ `end > trip_days.end_time` · closed conflict ตรวจจาก `periods` (รองรับร้านที่เปิดข้ามเที่ยงคืน) · ถ้าไม่มีข้อมูลเวลาเปิดจะได้ `isHoursUnknown` (ไม่ใช่ conflict) · `placeCost` ถ้าเป็น paid ที่ไม่มีราคาจะเป็น null และไม่นับเข้ายอดสะสม · budget conflict เกิดเมื่อ `useBudget && cumulativeCost > dailyBudget`

ค่าคงที่ที่ต้องตรงกันทั้งสองฝั่ง: `TRIP_START_ID = "__trip_start__"`, `FALLBACK_AVG_SPEED_KMH = 25`, `PRICE_LEVEL_TO_BAHT = {0:0,1:200,2:450,3:900,4:1500}`, เวลาเดินทางขั้นต่ำ 1 นาที

### 2.5 Auto Trip
1. หน้า `/trip/:id/recommendations` เรียก `POST /poi/trips/:id/calculate-poi`, โหลดรายละเอียดสถานที่ แล้วแสดงรายการ/แผนที่เรียงตาม POI Score
2. ผู้ใช้เลือกจัดทริปเองเพื่อไป Itinerary Editor หรือเลือก Auto Trip
3. `GET /itinerary/trips/:id/auto/categories` ตรวจเจ้าของทริป แล้วคืนหมวดที่ผู้ใช้เลือกไว้ใน `trip_categories` เพื่อให้หน้า Auto Trip ขอเวลาทุกหมวดที่เลือก
4. `POST /itinerary/trips/:id/auto` รับ `visitDurationByCategory: { [categoryId]: นาที }` · Backend ตรวจให้ครบทุกหมวดและเป็นหนึ่งใน 30, 60, 90, 120, 150 หรือ 180 นาที; ค่านี้เป็นเวลาเที่ยวต่อสถานที่สำหรับสถานที่ในหมวดนั้น ไม่รวมเวลาเดินทาง และไม่หารเฉลี่ยเมื่อมีหลายสถานที่ (D-50)
5. Controller ส่ง candidate จาก `poi_scores` ที่จับคู่กับหมวดที่เลือกทั้งหมดให้ `buildAutoTrip()`; หาก place จับคู่หลายหมวดจะมี candidate ต่อหมวด แต่ builder ห้ามจัด `place_id` ซ้ำ
6. Builder ทดลอง candidate ตาม POI Score จากมากไปน้อย; หลังเพิ่มจะลองจัดลำดับ nearest neighbor ใหม่และตำแหน่งแทรกที่เป็นไปได้ พร้อมคำนวณตารางทั้งทริปใหม่ทุกครั้ง · ใช้เวลาที่เลือกของหมวดนั้นแยกกับสถานที่แต่ละแห่ง ไม่หารเฉลี่ย และไม่หักเวลาเดินทาง; เวลาเดินทางยังนับในกำหนดการรายวันและเวลาเดินทางรวม · ลดเวลาเที่ยวได้เมื่อเวลาเปิดหรือเวลาจบวันจำกัด · สถานที่ที่มีเวลาเปิดต้องเปิดตลอดเวลาที่เที่ยวจริง; ไม่มี periods = ไม่ทราบเวลาและเลือกได้ (D-10/D-46) · ใช้ ORS Matrix และ fallback Haversine; ถ้าไม่มี `available_time_per_day` จะใช้เวลาจบวัน 18:00 (D-50)
7. หน้า `auto.tsx` แสดงฟอร์มก่อนคำนวณ · แผนที่ใช้ `RouteMap` component เดียวกับ Itinerary Editor (Leaflet + OpenStreetMap + ORS Directions) และ backend ส่งพิกัดจุดเริ่มต้นมาด้วย · ตอนยืนยันส่ง `visit_durations` พร้อมรายการวันให้ `confirmItinerary` ตรวจซ้ำและบันทึกเวลารายสถานที่ใน `itineraries.visit_duration_min` ด้วย schema ที่มีอยู่แล้ว (D-36/D-43)

### 2.6 Trip Detail
GET `/api/trips/:id` + GET `/api/itinerary/trips/:id` → แสดงผล ปุ่ม "แก้ไขแผน" จะเรียก `/api/places?ids=` + `POST /draft` ใหม่ แล้วไป editor

### 2.7 Admin: ตรวจข้อมูลและนำเข้าจังหวัด (R5) — `backend/src/admin/` + `frontend/src/admin/`
1. `/admin` → การ์ด "ตรวจสถานที่ซ้ำและนำเข้าข้อมูล" → `/admin/provinces` (จังหวัดจาก CSV + จำนวนใน `places`/การตัดสินใจ)
2. **ตรวจข้อมูล** `/admin/provinces/:province`: `pipeline/review/buildReview.ts` วิเคราะห์ CSV (dedupe + ตัวตรวจชื่อคล้าย/พิกัดใกล้/พิกัดพัง/ชื่อขยะ) → admin รวม (เลือกแถวหลัก, เลือกค่าทีละช่องหรือพิมพ์เองได้เฉพาะ 19 ช่องที่นำเข้า — D-31/D-32) / แยก / ตัดทิ้ง / แก้พิกัด → `admin_place_decisions` (`resolveDecisions` เลือกการตัดสินใจล่าสุด)
3. **นำเข้า** `/admin/provinces/:province/import` (ต้องตัดสินใจครบ): preview ไม่เรียก Google → `pipeline/import/importRows.ts` สร้างแถวจาก CSV + การตัดสินใจ → job รันใน process (ทีละ 1 job, หน่วง 200 ms, ยกเลิกได้, เปิด server ใหม่ job ค้าง = failed) → ต่อแถว: Find Place "ชื่อไทย อำเภอ จังหวัด" (bias 1 km) → รับเมื่อห่าง ≤ 1 km **และ** ชื่อคล้าย (ครอบกัน หรือ Levenshtein ≥ 0.6, แปลงเลขไทยก่อน — D-33/D-34) → Details → insert `places` (พิกัดจาก CSV, ไม่ upsert · type จาก Google อยู่ใน `gmaps_types` — ไม่เขียน `place_types` แล้ว D-41) · ไม่ผ่าน/ไม่พบ/`google_place_id` ซ้ำ → `needs_review_*` · รันต่อได้โดยข้าม ATT_ID ที่มีผลแล้ว (D-30)
4. **รอตรวจหลังนำเข้า** (P4c): admin เลือก ยอมรับผล Google (Details 1 ครั้ง) / นำเข้าจาก CSV อย่างเดียว (`csv:<ATT_ID>`) / ตัดทิ้ง → item เป็น `resolved`
5. สถานที่ที่นำเข้าใหม่ได้หมวดจากป้าย ททท. อัตโนมัติ (`places.att_type_label` → `category_labels` — P5b/P5c) จึงถูกแนะนำได้ทันที

## 3. Data Pipeline เดิม (ลบแล้ว)
> ระบบใหม่อยู่ที่ `backend/src/admin/` (หัวข้อ 2.7) · `data-pipeline/` ลบแล้วใน R5 P6 (D-37 — กู้จาก git history ที่ `d73808f`) · ด้านล่างคือการทำงานของ data-pipeline เดิม เก็บไว้เพราะยังอธิบายที่มาของข้อมูลเดิม (ข้อมูลเชียงใหม่/ชลบุรี/กรุงเทพฯ ใน `places` ตอนนี้มาจากสคริปต์นี้)
- `uploadCsvToSupabase.ts` / `uploadProvinceGooglePlaces.ts`: อ่าน `data/attraction.csv` กรองตาม `TARGET_PROVINCE` → dedupe (`dedupe.ts`, `manualOverrides.ts`) → Google Find Place + Details → upsert `places` (onConflict `google_place_id`)
- พิกัดที่บันทึกลง `places` มาจาก Google (`details.geometry` → `found.geometry` → CSV เป็นทางสุดท้าย) และ Find Place ใช้ `locationbias` ซึ่งไม่จำกัดพื้นที่ จึงได้สถานที่ผิดได้ (Known Issue #30)
- `fetchGmapsCategories.ts`: เติม `places.gmaps_types` (paginate ทีละ 1000)
- การสร้าง `place_categories` / `confidence_score` (ที่ comment เรียกว่า "Stage 3") ไม่พบโค้ดใน repo — **ไม่เกี่ยวแล้ว** ตารางลบใน P5g (D-35)
- ใช้ `SUPABASE_ANON_KEY` ในการเขียนข้อมูล แปลว่า RLS ของ `places` น่าจะอนุญาตให้ anon เขียนได้ (**ต้องตรวจสอบ**)

## 4. Conventions ที่สังเกตได้
- Backend: feature folder `features/<name>/<name>Routes.ts` + `<name>Controller.ts`, ไฟล์ช่วยตั้งชื่อเป็น `<name>PlaceQueries.ts` / `<name>Builder.ts`, utils ที่ใช้ร่วมกันอยู่ใน `src/utils/` · controller เป็น `async (req: AuthRequest, res)` คืน `{ message }` ภาษาไทย พร้อม status code · ตรวจ `tripId` ด้วย `!tripId || Array.isArray(tripId)`
- Frontend: `features/<area>/<page>/<Page>.tsx` (ชื่อไฟล์มีทั้ง camelCase และ PascalCase ปนกัน) · Tailwind + CSS variables (`--navy`, `--sky` ฯลฯ) · fetch ตรงในคอมโพเนนต์ (ไม่มี API layer รวม)
- Admin (D-24): frontend `src/admin/` (`dashboard/`, `provinces/`, `imports/`, `lib/` — เรียก API ผ่าน `lib/adminApi.ts::adminRequest`) + `src/system/` (auth ที่ใช้ร่วมกับหน้าผู้ใช้) · backend `src/admin/` (`requireAdmin`, `provinces/`, `imports/`, `pipeline/` เป็น logic ล้วนที่รับ Google/DB เข้ามาเป็น parameter เพื่อให้ test ได้)
- TypeScript strict ทั้งสองฝั่ง, frontend เปิด `noUnusedLocals`/`noUnusedParameters`
- Comment ในโค้ดเป็นภาษาไทยและยาว มักมี "✅ มติ…" บอกเหตุผลของการตัดสินใจ ห้ามลบ comment เหล่านี้ทิ้งโดยไม่มีเหตุผล
- ไฟล์ส่วนใหญ่ใช้ line ending แบบ CRLF แต่บางไฟล์เป็น LF (เช่น `backend/src/utils/orsDistance.ts`, `frontend/src/main.tsx`) ห้าม normalize line ending ของไฟล์ที่ไม่เกี่ยวกับงาน เพราะจะทำให้ diff บวมเต็มไฟล์
