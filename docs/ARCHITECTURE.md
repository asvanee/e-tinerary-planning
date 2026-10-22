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
  └── job นำเข้า → Google Places (Find Place + Details) → places, place_types, pipeline_jobs/_items

```

backend เก็บ state ที่ไม่ได้อยู่ใน DB ไว้แค่ cache ใน memory (ORS, weather) เท่านั้น ถ้ารันหลาย instance cache จะไม่แชร์กัน

## 2. Flow หลักของผู้ใช้

```text
Register/Login ─► Home ─► Create Trip ─► Recommendations ─┬─► (เลือกสถานที่) ─► Itinerary Editor ─► Confirm ─► Trip Detail
                                                          └─► Auto Trip ─────────────────────────► Confirm ─► Trip Detail
MyTrips ─► Trip Detail ─► แก้ไขแผน (สร้าง draft ใหม่) / แก้ไขข้อมูลทริป (/trip/:id/edit → บันทึกแล้วไป Recommendations เพื่อคำนวณ POI ใหม่ · ถ้าวัน/เวลา/งบต่อวันเปลี่ยน แผนเดิมถูกล้าง — D-29)
```

### 2.1 Auth
- `POST /api/auth/register`: `supabase.auth.signUp` แล้ว insert `users` (role `user`), redirect ใน email ถูก **hardcode** เป็น `http://localhost:5173/login` · Supabase แนบ session มาใน URL hash ซึ่ง `login.tsx` ล้างทิ้งทันทีด้วย `navigate(..., { replace: true })` เพราะ frontend ไม่ได้ใช้ token นี้ (#26)
- `POST /api/auth/login`: `signInWithPassword` → บังคับว่าต้อง `email_confirmed_at` → อ่าน profile จาก `users` → อัปเดต `last_login` → คืน `{ user, session }` · `signUp`/`signInWithPassword` เรียกผ่าน `createAuthClient()` (client ใหม่ต่อ request ใน `config/db.ts`) เพื่อไม่ให้ session ไปติดกับ client หลักที่ใช้ query (T22, แก้ Known Issue #21 เมื่อ 2026-10-17)
- Frontend `AuthContext` เก็บ `user`/`session` ใน `localStorage` และไม่มีโค้ด refresh token (ตรวจด้วย grep แล้วไม่พบ) — **พฤติกรรมเมื่อ token หมดอายุ: ต้องตรวจสอบเพิ่มเติม**
- `logout` เรียก `supabase.auth.admin.signOut(token)`

### 2.2 สร้าง/แก้ไขทริป (`tripController.ts`)
- frontend เป็นคนคำนวณ `daily_budget` (`createTrip.tsx` ~บรรทัด 494–511) จาก scope (`GROUP`/`PER_PERSON`) × period (`TOTAL_TRIP`/`PER_DAY`) ได้ผลเป็น **งบรวมของทั้งกลุ่มต่อวัน**
- backend validate: ต้องมี province, ต้องปักหมุด, พิกัดต้องอยู่ในช่วง, `number_of_people` ต้องเป็นจำนวนเต็ม ≥ 1, `start_time + available_time_per_day` ต้องไม่เกินเที่ยงคืน
- การบันทึก `trip_categories` เป็นแบบ best-effort (ไม่ rollback แต่คืน `categoryWarning`)
- ownership: query ใช้ `.eq("trip_id").eq("user_id")` ทุกครั้ง

### 2.3 POI Recommendation (`features/poi/`)
pipeline ใน `getFilteredPlaces()` ต้องทำตามลำดับนี้ (ตามที่ comment ระบุ):
1. กรอง province (บังคับ) แล้ว AND กับ district ถ้ามี
2. กรอง category ที่ผู้ใช้เลือก ถ้าเหลือ 0 ที่ ให้ fallback เป็นไม่กรอง category (`categoryFallbackUsed`)
3. Hard filter งบ: ตัดที่ที่ `PRICE_LEVEL_TO_BAHT[priceLevel] > dailyBudget` ทิ้ง (ถ้าเป็น paid และไม่มีราคา ให้ปล่อยผ่าน)
4. Hard filter เวลา: ตัดที่ที่ `default_duration_min > available_time_per_day*60` ทิ้ง (D-36 จะเลิกใช้ `default_duration_min` — ขั้นนี้ต้องตัดสินใน R5 P5 ว่าจะเอาออกหรือไม่)

จากนั้นคำนวณระยะทางถนนจากจุดเริ่มต้น (ORS ถ้าใช้ไม่ได้ใช้ haversine) และโอกาสฝนเฉลี่ยตาม grid 0.1° แล้วจึงคำนวณ `calculatePoiScore()`

| มิติ | สูตร | weight |
|---|---|---|
| category | `confidence_score` (ถ้าไม่ได้เลือก category ให้ 1.0) | 0.35 |
| rating | `rating/5` (ถ้าเป็น null ให้ 0.5) | 0.25 |
| distance | `1/(1+km)` | 0.15 |
| budget(=price) | free: 0.9 (มีราคา) / 0.8 (ไม่มี) · paid: `(80-20*level)/100` · paid ไม่มีราคา: weight 0 | 0.15 |
| weather | `exposure*(1-rain)+(1-exposure)` ใช้ OUTDOOR=1, MIXED=0.5, INDOOR=0 · ไม่มีพยากรณ์ให้ 1.0 | 0.10 |

ถ้า `useBudget=false` หรือ budget weight=0 จะ renormalize 4 มิติที่เหลือให้ผลรวมเป็น 1 (`computeWeights`) จากนั้นเรียงลำดับ ตัดเหลือ top 50 แล้ว upsert ลง `poi_scores`

**Multi-category:** ที่หนึ่งอาจมีหลายแถวใน `place_categories` ทุก query (`poiPlaceQueries`, `itineraryPlaceQueries.getSelectedPlaces`, `placesController`, `getAutoTripPlaces`) จะเลือก **แถวที่ `confidence_score` สูงสุด** มาเป็นตัวแทน (เท่ากัน = แถวแรกที่เจอ) ผ่านฟังก์ชันเดียว `backend/src/utils/bestCategoryRow.ts::pickBestCategoryRows`

### 2.4 Itinerary (manual) — `features/itinerary/` + frontend mirror
1. `POST /draft` `{place_ids}`: lazy-create `trip_days` ตามช่วงวันที่ (ครั้งแรกเท่านั้น), `buildInitialDraft()` จะคืน `[]` เสมอ (final design คือไม่จัดลงวันอัตโนมัติ) และคืน `travelMatrix` N×N (ORS + fallback haversine ที่ 25 km/h)
2. Frontend `ItineraryEditor.tsx` (dnd-kit) จะ recompute ทุกครั้งที่มีการลาก ด้วย `frontend/.../lib/itineraryBuilder.ts` ซึ่ง **mirror** มาจาก `backend/.../itineraryBuilder.ts` (ตรวจด้วย diff แล้วว่า `buildDayItems` ตรงกันทุกบรรทัด) และ `lib/openingHoursChecker.ts` ซึ่ง mirror จาก `backend/src/utils/openingHoursChecker.ts`
3. `PUT /itinerary/trips/:id` `{days:[{trip_day_id, place_ids}]}`: backend สร้าง matrix ใหม่และ `buildItinerary()` ใหม่ ถ้ามี `isClosedConflict|isTimeConflict|isBudgetConflict` จะปฏิเสธ (400) **ก่อน**ลบ ถ้าผ่านจะลบ itineraries เดิมของทุกวันแล้ว insert ใหม่ (ไม่ใช่ transaction)
4. กฎใน `buildDayItems`: Day 1 มี leg จาก `TRIP_START_ID` ส่วน Day 2+ ที่แรกไม่มี leg · time conflict เกิดเมื่อ `end > trip_days.end_time` · closed conflict ตรวจจาก `periods` (รองรับร้านที่เปิดข้ามเที่ยงคืน) · ถ้าไม่มีข้อมูลเวลาเปิดจะได้ `isHoursUnknown` (ไม่ใช่ conflict) · `placeCost` ถ้าเป็น paid ที่ไม่มีราคาจะเป็น null และไม่นับเข้ายอดสะสม · budget conflict เกิดเมื่อ `useBudget && cumulativeCost > dailyBudget`

ค่าคงที่ที่ต้องตรงกันทั้งสองฝั่ง: `TRIP_START_ID = "__trip_start__"`, `FALLBACK_AVG_SPEED_KMH = 25`, `PRICE_LEVEL_TO_BAHT = {0:0,1:200,2:450,3:900,4:1500}`, เวลาเดินทางขั้นต่ำ 1 นาที

### 2.5 Auto Trip (ยังเป็นงานที่ทำค้างอยู่)
`POST /itinerary/trips/:id/auto`:
1. `getAutoTripPlaces()` อ่าน `poi_scores` ของทริป (จึงต้องคำนวณ POI มาก่อน)
2. controller เลือก **ที่ที่คะแนนสูงสุด 1 ที่ต่อ category** แล้วกรองด้วย `isOpenAt()` ซึ่งรองรับเฉพาะ format `"08:00 - 17:00"` หรือ `{open, close}` เท่านั้น (ไม่ใช่ format `periods` ที่อยู่ใน DB จริง)
3. `buildAutoTrip()` ใช้ nearest-neighbor TSP (haversine) แล้วแบ่งเป็นวันด้วยความเร็วคงที่ 30 km/h ถ้าไม่มี `available_time_per_day` จะใช้เวลาจบวัน 18:00
4. ไม่บันทึกลง DB โดยตรง แต่หน้า `auto.tsx` จะ GET saved itinerary เพื่อหา trip days แล้ว PUT ผ่าน `confirmItinerary` (ซึ่ง re-validate ด้วย ORS matrix ทำให้ผลอาจไม่ตรงกับที่ auto คำนวณไว้)

### 2.6 Trip Detail
GET `/api/trips/:id` + GET `/api/itinerary/trips/:id` → แสดงผล ปุ่ม "แก้ไขแผน" จะเรียก `/api/places?ids=` + `POST /draft` ใหม่ แล้วไป editor

### 2.7 Admin: ตรวจข้อมูลและนำเข้าจังหวัด (R5) — `backend/src/admin/` + `frontend/src/admin/`
1. `/admin` → การ์ด "ตรวจสถานที่ซ้ำและนำเข้าข้อมูล" → `/admin/provinces` (จังหวัดจาก CSV + จำนวนใน `places`/การตัดสินใจ)
2. **ตรวจข้อมูล** `/admin/provinces/:province`: `pipeline/review/buildReview.ts` วิเคราะห์ CSV (dedupe + ตัวตรวจชื่อคล้าย/พิกัดใกล้/พิกัดพัง/ชื่อขยะ) → admin รวม (เลือกแถวหลัก, เลือกค่าทีละช่องหรือพิมพ์เองได้เฉพาะ 19 ช่องที่นำเข้า — D-31/D-32) / แยก / ตัดทิ้ง / แก้พิกัด → `admin_place_decisions` (`resolveDecisions` เลือกการตัดสินใจล่าสุด)
3. **นำเข้า** `/admin/provinces/:province/import` (ต้องตัดสินใจครบ): preview ไม่เรียก Google → `pipeline/import/importRows.ts` สร้างแถวจาก CSV + การตัดสินใจ → job รันใน process (ทีละ 1 job, หน่วง 200 ms, ยกเลิกได้, เปิด server ใหม่ job ค้าง = failed) → ต่อแถว: Find Place "ชื่อไทย อำเภอ จังหวัด" (bias 1 km) → รับเมื่อห่าง ≤ 1 km **และ** ชื่อคล้าย (ครอบกัน หรือ Levenshtein ≥ 0.6, แปลงเลขไทยก่อน — D-33/D-34) → Details → insert `places` (พิกัดจาก CSV, ไม่ upsert) + `place_types` · ไม่ผ่าน/ไม่พบ/`google_place_id` ซ้ำ → `needs_review_*` · รันต่อได้โดยข้าม ATT_ID ที่มีผลแล้ว (D-30)
4. **รอตรวจหลังนำเข้า** (P4c): admin เลือก ยอมรับผล Google (Details 1 ครั้ง) / นำเข้าจาก CSV อย่างเดียว (`csv:<ATT_ID>`) / ตัดทิ้ง → item เป็น `resolved`
5. ⚠️ สถานที่ที่นำเข้าใหม่ยังไม่มี `place_categories` จึงยังไม่ถูกแนะนำในหน้า POI จนกว่า P5 (หมวดจากป้าย ททท. `places.att_type_label` — D-35)

## 3. Data Pipeline เดิม (ลบแล้ว)
> ระบบใหม่อยู่ที่ `backend/src/admin/` (หัวข้อ 2.7) · `data-pipeline/` ลบแล้วใน R5 P6 (D-37 — กู้จาก git history ที่ `d73808f`) · ด้านล่างคือการทำงานของ data-pipeline เดิม เก็บไว้เพราะยังอธิบายที่มาของข้อมูลเดิม (ข้อมูลเชียงใหม่/ชลบุรี/กรุงเทพฯ ใน `places` ตอนนี้มาจากสคริปต์นี้)
- `uploadCsvToSupabase.ts` / `uploadProvinceGooglePlaces.ts`: อ่าน `data/attraction.csv` กรองตาม `TARGET_PROVINCE` → dedupe (`dedupe.ts`, `manualOverrides.ts`) → Google Find Place + Details → upsert `places` (onConflict `google_place_id`)
- พิกัดที่บันทึกลง `places` มาจาก Google (`details.geometry` → `found.geometry` → CSV เป็นทางสุดท้าย) และ Find Place ใช้ `locationbias` ซึ่งไม่จำกัดพื้นที่ จึงได้สถานที่ผิดได้ (Known Issue #30)
- `fetchGmapsCategories.ts`: เติม `places.gmaps_types` (paginate ทีละ 1000)
- การสร้าง `place_categories` / `confidence_score` (ที่ comment เรียกว่า "Stage 3") **ไม่พบโค้ดใน repo — ยังไม่ทราบว่าทำที่ไหน**
- ใช้ `SUPABASE_ANON_KEY` ในการเขียนข้อมูล แปลว่า RLS ของ `places` น่าจะอนุญาตให้ anon เขียนได้ (**ต้องตรวจสอบ**)

## 4. Conventions ที่สังเกตได้
- Backend: feature folder `features/<name>/<name>Routes.ts` + `<name>Controller.ts`, ไฟล์ช่วยตั้งชื่อเป็น `<name>PlaceQueries.ts` / `<name>Builder.ts`, utils ที่ใช้ร่วมกันอยู่ใน `src/utils/` · controller เป็น `async (req: AuthRequest, res)` คืน `{ message }` ภาษาไทย พร้อม status code · ตรวจ `tripId` ด้วย `!tripId || Array.isArray(tripId)`
- Frontend: `features/<area>/<page>/<Page>.tsx` (ชื่อไฟล์มีทั้ง camelCase และ PascalCase ปนกัน) · Tailwind + CSS variables (`--navy`, `--sky` ฯลฯ) · fetch ตรงในคอมโพเนนต์ (ไม่มี API layer รวม)
- Admin (D-24): frontend `src/admin/` (`dashboard/`, `provinces/`, `imports/`, `lib/` — เรียก API ผ่าน `lib/adminApi.ts::adminRequest`) + `src/system/` (auth ที่ใช้ร่วมกับหน้าผู้ใช้) · backend `src/admin/` (`requireAdmin`, `provinces/`, `imports/`, `pipeline/` เป็น logic ล้วนที่รับ Google/DB เข้ามาเป็น parameter เพื่อให้ test ได้)
- TypeScript strict ทั้งสองฝั่ง, frontend เปิด `noUnusedLocals`/`noUnusedParameters`
- Comment ในโค้ดเป็นภาษาไทยและยาว มักมี "✅ มติ…" บอกเหตุผลของการตัดสินใจ ห้ามลบ comment เหล่านี้ทิ้งโดยไม่มีเหตุผล
- ไฟล์ส่วนใหญ่ใช้ line ending แบบ CRLF แต่บางไฟล์เป็น LF (เช่น `backend/src/utils/orsDistance.ts`, `frontend/src/main.tsx`) ห้าม normalize line ending ของไฟล์ที่ไม่เกี่ยวกับงาน เพราะจะทำให้ diff บวมเต็มไฟล์
