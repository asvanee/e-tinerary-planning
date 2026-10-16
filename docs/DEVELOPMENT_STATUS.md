# DEVELOPMENT_STATUS

> สถานะ ณ commit `0c980bd` (branch `dev`, 2026-10-13) — ตรวจเมื่อ 2026-10-16
> **"Implemented" = มีโค้ดรองรับครบตาม flow เท่านั้น ไม่ได้แปลว่าทดสอบการทำงานจริงแล้ว** เพราะไม่มี automated test และยังไม่ได้รันแอปกับ Supabase จริง

## หลักฐานจากการตรวจ (รันจริงบนสำเนาโปรเจกต์ใน Linux)

| การตรวจ | ผล | หมายเหตุ |
|---|---|---|
| `backend`: `tsc --noEmit -p .` | ✅ ผ่าน (exit 0) | |
| `data-pipeline`: `tsc --noEmit -p .` | ✅ ผ่าน (exit 0) | |
| `frontend`: `tsc -b` (ขั้นแรกของ `npm run build`) | ❌ **ไม่ผ่าน** — `auto.tsx(108,10) TS6133: 'loading' is declared but its value is never read` | แปลว่า `npm run build` จะหยุดตั้งแต่ขั้นนี้ |
| `frontend`: `eslint .` | ❌ 38 problems (34 errors, 4 warnings) — `no-explicit-any` 24, `no-unused-vars` 5, `react-hooks/exhaustive-deps` 4, `react-hooks/set-state-in-effect` 2, `react-refresh/only-export-components` 2, `react-hooks/refs` 1 | |
| `frontend`: `vite build` | ⚠️ **ไม่ได้รัน** | node_modules เป็น binary ของ Windows และ environment ที่ใช้ตรวจเข้าถึง npm registry ไม่ได้ |
| `frontend`: `vitest run` | ⚠️ รันได้บน Windows (Node v22.19.0) — ตอบว่า "No tests found" และจบด้วย **exit 1** (ผู้ใช้รัน `npx vitest run` 2026-10-16) | ไม่มีไฟล์ test อยู่แล้ว `npm test` จึงถือว่า fail จนกว่าจะมีไฟล์ test · บน Linux เคยรันไม่ขึ้นเพราะไม่พบ native rollup ของ Linux |
| `backend`: `jest` | ⚠️ รันได้บน Windows (Node v22.19.0) — ตอบว่า "No tests found" และจบด้วย **exit 1** (ผู้ใช้รัน `npx jest` 2026-10-16) | ไม่มีไฟล์ test `npm test` จึงถือว่า fail จนกว่าจะมีไฟล์ test · jest 30 กับ ts-jest 29 major version ไม่ตรงกัน ยังไม่รู้ว่าจะมีปัญหาตอนมี test จริงหรือไม่ เพราะยังไม่มีไฟล์ไหนผ่าน transform |
| `backend/src`: นับ `any` (grep คำว่า `any` ทั้งคำ ไม่นับบรรทัด comment) | ประมาณ 39 จุด (ตรวจ 2026-10-16) | backend ไม่มี lint จึงไม่ถูกนับรวมกับ `no-explicit-any` 24 จุดของ frontend |
| ไฟล์ test (`*.test.*`, `*.spec.*`, `__tests__`) | ไม่พบเลย | |

## Implemented (มีโค้ดครบ flow — ยังไม่ได้ยืนยันว่าทำงานจริง)

| ฟีเจอร์ | หลักฐาน |
|---|---|
| Register / Login / Logout ผ่าน Supabase Auth + ตาราง `users` | `backend/src/features/auth/*`, `frontend/src/features/auth/*` |
| Protected routes ฝั่ง frontend | `ProtectedRoute.tsx`, `App.tsx` |
| CRUD ทริป พร้อม validation และ ownership check | `tripController.ts`, `createTrip.tsx`, `MyTrips.tsx` |
| Dropdown จังหวัด/อำเภอจากข้อมูลจริง | `placeDropdownController.ts`, `createTrip.tsx` |
| ปักหมุดจุดเริ่มต้น (Google Maps) | `LocationPinPicker.tsx` |
| POI score (category/rating/distance/price/weather) + hard filter + top 50 + upsert | `features/poi/*` |
| ระยะทางถนน ORS + fallback haversine + cache | `utils/orsDistance.ts`, `utils/orsTravelMatrix.ts` |
| Weather score จาก Open-Meteo | `utils/weatherForecast.ts` |
| แผนที่ Recommendation (Leaflet) | `RecommendationMap.tsx` |
| Itinerary editor แบบลากวาง + recompute ฝั่ง client + ตรวจ conflict | `ItineraryEditor.tsx`, `lib/itineraryBuilder.ts` |
| Confirm itinerary: re-validate ฝั่ง backend แล้วปฏิเสธถ้ามี conflict | `itineraryController.confirmItinerary` |
| Trip detail + แก้ไขแผนเดิม | `TripDetail.tsx` |
| Route map (ORS directions) | `RouteMap.tsx` |

## Partially Implemented

| ฟีเจอร์ | สิ่งที่มีแล้ว | สิ่งที่ยังขาด / หลักฐาน |
|---|---|---|
| **Auto Trip** | endpoint `/auto`, `autoTripBuilder.ts`, หน้า `auto.tsx` มีปุ่มยืนยันและบันทึกได้ | เลือกได้แค่ 1 ที่ต่อ category · เช็คเวลาเปิดไม่ตรงกับ format ใน DB (ดู Known Issues) · ใช้ haversine 30 km/h แทน ORS · ไม่มีการตรวจงบ · ปุ่ม "แก้ไข" ส่ง state ที่ editor ไม่รองรับ · route `/trip/:id/auto` ไม่ได้ครอบ ProtectedRoute · commit `44d26dd` ระบุว่า "BUT not done yet" |
| ข้อมูลหลายจังหวัด | scripts มีกรุงเทพฯ / เชียงใหม่ / ชลบุรี | comment บอกว่ากรุงเทพฯ/ชลบุรียังไม่ผ่าน "Stage 3" (multi-category) · **โค้ด Stage 3 ไม่มีใน repo** |
| Weather | มีเฉพาะโอกาสฝน | comment ระบุว่าความร้อน/UV/ลม/PM2.5 เป็นงานในอนาคต · `weatherDebug.ts` ยังถูกเรียกทุก request |
| Testing | มี config ของ jest/vitest | ไม่มีไฟล์ test เลย |
| Production readiness | dev scripts | backend ไม่มี `build`/`start` · ไม่มี deploy config · redirect URL และ CORS ยังเป็นค่าสำหรับ local |

## Not Implemented (ตรวจแล้วไม่พบโค้ด)
- Schema / migration ของ DB ใน repo
- Automated tests ทั้ง 3 package
- การ refresh access token ฝั่ง frontend (grep แล้วไม่พบ `refreshSession`/`onAuthStateChange`)
- การ sync `trip_days` ใหม่เมื่อแก้ไขวันที่/เวลา/งบของทริป (ดู Known Issues #6)
- Lint ของ backend และ data-pipeline (ไม่มี config)
- CI / deploy

## Needs Verification (หลักฐานยังไม่พอจะสรุป)
1. RLS policy ของทุกตาราง และ FK `ON DELETE CASCADE` ของ `trip_days` / `trip_categories` / `itineraries` / `poi_scores` → `trips` (comment ใน `deleteTrip` เตือนไว้เอง)
2. ข้อมูลเกิน 1,000 แถว: query `getProvinces`/`getDistricts` (select ทั้งตาราง `places`) และ `queryPlacesWithCategoryInfo` ไม่ได้ paginate ถ้า Supabase ยังใช้ max rows ค่า default (1000) ผลอาจถูกตัดโดยไม่มี error (data-pipeline เองยังเขียนไว้ว่า "Supabase จำกัด default 1000 rows")
3. ความหมายของงบ: `daily_budget` คืองบ **ทั้งกลุ่มต่อวัน** แต่ hard filter และ `cumulativeCost` เอาไปเทียบกับราคาจาก `PRICE_LEVEL_TO_BAHT` โดยไม่คูณจำนวนคน ยังไม่ทราบว่าราคาในตารางนั้นเป็นราคาต่อคนหรือไม่ — **ต้องให้เจ้าของโปรเจกต์ตัดสินใจ**
4. พฤติกรรมเมื่อ access token หมดอายุ (backend จะตอบ 401 แต่ frontend ยังเห็นว่าล็อกอินอยู่)
5. `/trip/:id/auto` จับคู่ trip day ด้วย `item.day_number ?? item.day ?? item.day_no` แต่ response ของ `getSavedItinerary` ใช้ `dayNumber` จึงตกไปใช้ `tripDays[index]` แทน — ผลลัพธ์อาจถูกต้องโดยบังเอิญ
6. การ build บน Linux/CI (ปัญหาตัวพิมพ์เล็ก-ใหญ่ของชื่อไฟล์ ดู Known Issues #2, #3)

## Known Issues (พบจากโค้ดหรือผลการตรวจ)

| # | ระดับ | ปัญหา | หลักฐาน |
|---|---|---|---|
| 2 | 🔴 Build | `confirmEmail.tsx` import `"./ConfirmEmail.css"` แต่ไฟล์จริงชื่อ `confirmEmail.css` ใช้ได้บน Windows แต่จะ fail บนระบบที่แยกตัวพิมพ์เล็ก-ใหญ่ (Linux/CI/hosting ส่วนใหญ่) | `frontend/src/features/auth/confirmEmail/` |
| 3 | 🔴 Build | git index เก็บไฟล์ชื่อ `frontend/src/components/Navbar.tsx` แต่บนดิสก์และใน import ทุกไฟล์ใช้ `navbar` (`core.ignorecase=true`) ถ้า clone บน Linux จะได้ `Navbar.tsx` และ import `components/navbar` จะหาไม่เจอ | `git ls-files`, `git status` |
| 4 | 🔴 Build | `tsc -b` ไม่ผ่าน (`auto.tsx` บรรทัด 108 มีตัวแปร `loading` ที่ไม่ถูกใช้) ทำให้ `npm run build` fail | ผลการรัน |
| 5 | 🟠 Security | `GET /api/itinerary/trips/:tripId/auto-places` ไม่เช็คว่าผู้เรียกเป็นเจ้าของทริป ผู้ใช้ที่ล็อกอินแล้วจะอ่าน `poi_scores` ของทริปคนอื่นได้ | `itineraryController.getAutoTripPlacesTest` |
| 6 | 🟠 Logic | `updateTrip` ไม่อัปเดต `trip_days` ที่สร้างไว้แล้ว ถ้าแก้วันที่/เวลาเริ่ม/เวลาว่าง/งบหลังเคยสร้าง draft ไปแล้ว `getOrCreateTripDays` จะคืนค่าเดิม (จำนวนวัน เวลา และ daily_budget ไม่ตรงกับทริป) | `tripController.updateTrip`, `itineraryPlaceQueries.getOrCreateTripDays` |
| 7 | 🟠 Data loss | `confirmItinerary` ลบ itineraries เดิมก่อนแล้วค่อย insert ใหม่ (ไม่อยู่ใน transaction) ถ้า insert fail แผนเดิมจะหาย | `itineraryController.ts` ~บรรทัด 258–303 |
| 8 | 🟠 Security | ORS API key ฝั่ง frontend (`VITE_ORS_API_KEY`) ถูกฝังใน bundle ของ browser ขัดกับ comment ใน `config/ors.ts` ที่บอกว่า key ห้ามส่งไป frontend | `RouteMap.tsx` |
| 9 | 🟠 Auto Trip | `isOpenAt()` ใน controller อ่านได้เฉพาะ `"HH:MM - HH:MM"` หรือ `{open,close}` แต่ข้อมูลจริงเป็น `{periods, weekday_text}` จึงคืน `true` เสมอ และ `isPlaceOpen()` ใน builder เช็คคำว่า `"closed"` ซึ่ง weekday_text ภาษาไทยไม่มี — **การกรองเวลาเปิดของ Auto Trip ใช้งานไม่ได้จริง** | `itineraryController.isOpenAt`, `autoTripBuilder.isPlaceOpen`, `utils/openingHoursChecker.ts` (comment บรรยาย format จริง) |
| 10 | 🟡 Auto Trip | ปุ่ม "แก้ไข" ในหน้า auto ส่ง `state: {autoTrip, tripId}` แต่ editor ต้องการ `state.draft` และ `state.places` จึงถูก redirect กลับไปหน้า recommendations | `auto.tsx` `handleEditTrip`, `ItineraryEditor.tsx` ~บรรทัด 571–582 |
| 11 | 🟡 Auto Trip | `getAutoTripPlaces` คืน `rawPriceLevel: place.price_level` แต่ select ไม่ได้ดึง `price_level` มาด้วย ค่าจึงเป็น null เสมอ | `itineraryPlaceQueries.ts` |
| 12 | 🟡 Route | `/trip/:tripId/auto` ไม่ได้ครอบ `ProtectedRoute` | `App.tsx` |
| 13 | 🟡 Perf/Noise | `poiController` เรียก `debugOpenMeteo()` (HTTP request เพิ่มอีก 1 ครั้ง) และ log ข้อมูลทุกครั้งที่คำนวณ | `poiController.ts` บรรทัด 85–86, 121–152 |
| 14 | 🟡 Config | `FRONTEND_URL` ไม่ถูกใช้, `cors()` เปิดทุก origin, email redirect hardcode `localhost:5173` | `server.ts`, `authController.ts` |
| 15 | 🟡 Config | `.gitignore` ignore `data-pipeline/` ทั้งโฟลเดอร์ ไฟล์ใหม่ใน data-pipeline จะไม่ถูก commit | `.gitignore` |
| 16 | ⚪ Dead code | `backend/src/app.ts`, `features/itinerary/routeCalculator.ts`, `frontend/src/config/db.ts`, `frontend/src/features/auth/authAPI.ts` ไม่มีไฟล์ใด import · `pg`/`postgres`/`axios` ใน backend dependencies ไม่ได้ใช้ | grep |
| 18 | ⚪ Lint | 34 ESLint errors (ส่วนใหญ่เป็น `any`) และมี `react-hooks/refs` ใน `RecommendationMap.tsx:209` ซึ่งอาจทำให้ UI ไม่อัปเดตตามที่ควร | ผลการรัน |
| 19 | ⚪ Docs | comment ของ `getAutoTripPlacesTest` เขียนว่า `GET /api/itinerary/trips/:tripId/auto-test` แต่ route จริงคือ `/auto-places` | `itineraryController.ts:418`, `itineraryRoutes.ts:23` |

## ข้อสันนิษฐาน (ยังไม่ใช่ข้อเท็จจริง)
- เป็นโปรเจกต์ของนักศึกษา/ทีมเล็ก (มี comment ว่า "ควรทำ sensitivity analysis … ในรายงาน") — ใช้เป็นบริบทเท่านั้น
- เครื่องที่ใช้พัฒนาเป็น Windows (ดูจาก node_modules, CRLF และ `core.ignorecase`)
