# DEVELOPMENT_STATUS

> สถานะ ณ commit `0c980bd` (branch `dev`, 2026-10-13) — ตรวจเมื่อ 2026-10-16 · อัปเดตผล frontend หลัง T1 เมื่อ 2026-10-17 · อัปเดต T22, #19, lint config (`argsIgnorePattern`) และ #26 เมื่อ 2026-10-17
> **"Implemented" = มีโค้ดรองรับครบตาม flow เท่านั้น ไม่ได้แปลว่าทดสอบการทำงานจริงแล้ว** เพราะไม่มี automated test และยังไม่ได้รันแอปกับ Supabase จริง (ยกเว้น manual test ของ T1/T2/T22 ที่ผู้ใช้ทดสอบผ่านเมื่อ 2026-10-17 ดูตาราง "Known Issues ที่แก้แล้ว")

## หลักฐานจากการตรวจ (รันจริงบนสำเนาโปรเจกต์ใน Linux)

| การตรวจ | ผล | หมายเหตุ |
|---|---|---|
| `backend`: `tsc --noEmit -p .` | ✅ ผ่าน (exit 0) | |
| `data-pipeline`: `tsc --noEmit -p .` | ✅ ผ่าน (exit 0) | |
| `frontend`: `tsc -b` (ขั้นแรกของ `npm run build`) | ✅ ผ่าน (exit 0) — รันบน Windows หลัง T1 (2026-10-17) | ก่อน T1 ไม่ผ่าน (`auto.tsx(108,10) TS6133` ตัวแปร `loading` ไม่ถูกใช้) |
| `frontend`: `eslint .` | ❌ 33 problems (29 errors, 4 warnings) — `no-explicit-any` 24, `react-hooks/exhaustive-deps` 4, `react-hooks/set-state-in-effect` 2, `react-refresh/only-export-components` 2, `react-hooks/refs` 1 (รันบน Windows 2026-10-17 หลังตั้ง `argsIgnorePattern: "^_"` ใน `eslint.config.js`) | ก่อน T1: 34 errors (`no-unused-vars` 5) · หลัง T1: 33 errors (`no-unused-vars` 4 = พารามิเตอร์ `_` ของ `buildInitialDraft` ที่ตั้งใจไม่ใช้) |
| `frontend`: `npm run build` (`tsc -b && vite build`) | ✅ ผ่านบน Windows หลัง T1 (2026-10-17) — มีคำเตือน chunk 748 kB > 500 kB | **ยังไม่ได้ทดสอบบน Linux/CI** (ต้อง `npm ci` ใหม่ในเครื่องนั้น) |
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
1. ~~RLS policy ของทุกตาราง~~ ผู้ใช้ยืนยัน (2026-10-17) ว่า RLS ปิดทุกตาราง (`users`, `trips`, `itineraries`, `poi_scores`, `places`, `place_categories`, `categories`, `trip_days`, `trip_categories`) · ที่ยังต้องตรวจ: FK `ON DELETE CASCADE` ของ `trip_days` / `trip_categories` / `itineraries` / `poi_scores` → `trips` (comment ใน `deleteTrip` เตือนไว้เอง)
2. ข้อมูลเกิน 1,000 แถว: query `getProvinces`/`getDistricts` (select ทั้งตาราง `places`) และ `queryPlacesWithCategoryInfo` ไม่ได้ paginate ถ้า Supabase ยังใช้ max rows ค่า default (1000) ผลอาจถูกตัดโดยไม่มี error (data-pipeline เองยังเขียนไว้ว่า "Supabase จำกัด default 1000 rows")
3. ความหมายของงบ: `daily_budget` คืองบ **ทั้งกลุ่มต่อวัน** แต่ hard filter และ `cumulativeCost` เอาไปเทียบกับราคาจาก `PRICE_LEVEL_TO_BAHT` โดยไม่คูณจำนวนคน ยังไม่ทราบว่าราคาในตารางนั้นเป็นราคาต่อคนหรือไม่ — **ต้องให้เจ้าของโปรเจกต์ตัดสินใจ**
4. พฤติกรรมเมื่อ access token หมดอายุ (backend จะตอบ 401 แต่ frontend ยังเห็นว่าล็อกอินอยู่)
5. `/trip/:id/auto` จับคู่ trip day ด้วย `item.day_number ?? item.day ?? item.day_no` แต่ response ของ `getSavedItinerary` ใช้ `dayNumber` จึงตกไปใช้ `tripDays[index]` แทน — ผลลัพธ์อาจถูกต้องโดยบังเอิญ
6. ~~การ build บน Linux/CI~~ ไม่ต้องตรวจตาม D-22 (โปรเจกต์ส่งงานไม่ใช้ Linux/CI) — เคสตัวพิมพ์เล็ก-ใหญ่ที่รู้ (#2, #3) แก้แล้วใน T1

## Known Issues (พบจากโค้ดหรือผลการตรวจ)

| # | ระดับ | ปัญหา | หลักฐาน |
|---|---|---|---|
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
| 16 | ⚪ Dead code | ~~`backend/src/app.ts`, `features/itinerary/routeCalculator.ts`, `frontend/src/config/db.ts`, `frontend/src/features/auth/authAPI.ts`~~ ลบแล้ว 2026-10-17 (T18 ส่วนไฟล์) · ที่เหลือ: `pg`/`postgres`/`@types/pg`/`axios` ใน backend dependencies ไม่ได้ใช้ และ `@supabase/supabase-js` ฝั่ง frontend + `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` ไม่มีที่ใช้แล้ว | grep |
| 18 | ⚪ Lint | 29 ESLint errors (ส่วนใหญ่เป็น `any`) และมี `react-hooks/refs` ใน `RecommendationMap.tsx:209` ซึ่งอาจทำให้ UI ไม่อัปเดตตามที่ควร | ผลการรัน |
| 20 | 🟠 Data | commit `44d26dd` ลบพิกัดเชียงใหม่ 4 รายการที่ verify แล้วออกจาก `locationOverrides` และใส่ comment `// ของเดิมทั้งหมด` แทน ตอนนี้ object ว่าง ถ้ารัน upload ใหม่ พิกัดที่เคยแก้จะไม่ถูกใช้ (กู้ได้จาก `git show 44d26dd^:data-pipeline/src/manualOverrides.ts`) — งานแก้อยู่ใน R2 ของ DEVELOPMENT_PLAN | `data-pipeline/src/manualOverrides.ts`, `git show 44d26dd` |
| 22 | 🟡 Security | ตอน login backend คืน profile จาก `users.select("*")` (มี `role` ด้วย) แล้ว frontend เก็บไว้ใน `localStorage` ซึ่งผู้ใช้แก้เองได้ ตอนนี้ยังไม่มีโค้ดที่ใช้ role แต่ **Admin Panel (R5) ต้องตรวจ role จาก DB ฝั่ง backend ทุก request** ห้ามเชื่อค่าจาก frontend | `authController.login`, `AuthContext.tsx` |
| 23 | 🟡 Security | `AuthContext` เก็บ `session` ทั้งก้อน (access + refresh token) ไว้ใน `localStorage` ถ้ามี XSS token จะหลุดได้ · ตรวจแล้ว (2026-10-17) ยังไม่พบจุดที่ inject HTML ได้: ไม่มี `dangerouslySetInnerHTML`/`innerHTML`, `divIcon` ใส่แค่ตัวเลข/สีที่ไม่ได้มาจาก DB, ลิงก์ website ใน `TripRecommendations.tsx:519` เติม `https://` ให้ค่าที่ไม่ขึ้นต้นด้วย `http` จึงกัน `javascript:` ได้ — เกี่ยวกับ T11 | `AuthContext.tsx` |
| 24 | 🟡 Security | Error 500 (และ 400 บางจุด) คืน `err.message`/`error.message` ของ Supabase ให้ client ตรงๆ เกือบทุก controller รายละเอียดภายใน (ชื่อตาราง/constraint) จึงหลุดออกไป | เช่น `authController.ts`, `itineraryController.ts`, `getAutoTripPlacesTest` |
| 25 | ⚪ Validation | (ก) `buildDraft`/`confirmItinerary` รับ `place_ids` อะไรก็ได้ ไม่เช็คว่าอยู่ใน `poi_scores` ของทริปนั้น (เป็นเรื่องความถูกต้องของข้อมูล ไม่ได้ทำให้ข้อมูลของผู้ใช้อื่นรั่ว เพราะ `places` เป็นข้อมูลกลาง) (ข) `GET /api/places?ids=` ไม่จำกัดจำนวน id (ค) `register` ไม่ validate `username`/`age`/`gender` (ส่วน `role` ถูก hardcode เป็น `"user"` ฝั่ง server แล้ว ถูกต้อง) | `itineraryController.ts`, `placesController.ts`, `authController.register` |

## Known Issues ที่แก้แล้ว
| # | ปัญหาเดิม | แก้เมื่อ | การแก้ / ที่ยังไม่ได้ตรวจ |
|---|---|---|---|
| 2 | `confirmEmail.tsx` import `"./ConfirmEmail.css"` แต่ไฟล์จริงชื่อ `confirmEmail.css` | 2026-10-17 (T1) | แก้ import เป็น `./confirmEmail.css` · ไม่ทดสอบบน Linux/CI ตาม D-22 |
| 3 | git index เก็บชื่อ `Navbar.tsx` แต่ import ทุกไฟล์ใช้ `components/navbar` | 2026-10-17 (T1) | `git mv` สองขั้นเป็น `navbar.tsx` (เนื้อไฟล์ไม่เปลี่ยน) · ไม่ทดสอบบน Linux/CI ตาม D-22 |
| 4 | `tsc -b` ไม่ผ่านเพราะ `loading` ใน `auto.tsx` ไม่ถูกใช้ ทำให้ `npm run build` fail | 2026-10-17 (T1) | กู้บล็อก `if (loading)` ที่ถูกลบใน `f5e6304` กลับมา (ก่อนแก้ หน้า auto โชว์ "จัดทริปอัตโนมัติไม่สำเร็จ" ระหว่าง fetch) · tsc/build ผ่านบน Windows · ✅ ผู้ใช้ทดสอบใน UI จริง 2026-10-17: หน้า auto แสดง "กำลังจัดทริปอัตโนมัติ" ระหว่าง fetch แล้วจึงแสดงผล |
| 5 | `GET /api/itinerary/trips/:tripId/auto-places` ไม่เช็คว่าผู้เรียกเป็นเจ้าของทริป ผู้ใช้ที่ล็อกอินแล้วอ่าน `poi_scores` ของทริปคนอื่นได้ | 2026-10-17 (T2) | เพิ่ม `getTripOwnerAndStart` + เช็ค `userId` ใน `getAutoTripPlacesTest` (ทริปไม่มี → 404, ไม่ใช่เจ้าของ → 403) แบบเดียวกับ `buildAutoTripController` · backend tsc ผ่าน · ✅ ผู้ใช้ทดสอบกับ Supabase จริง 2026-10-17: เจ้าของ 200 / คนอื่น 403 / ไม่มีทริป 404 / ไม่ส่ง token 401 และปุ่ม Auto Trip ใน UI ทำงานปกติ |
| 21 | `login`/`register` เรียก `signInWithPassword`/`signUp` บน client service role ตัวเดียวกับที่ใช้ query ข้อมูล ใน Node session จะถูกเก็บไว้ใน memory และ `_getAccessToken()` ของ supabase-js 2.97.0 ใช้ `session.access_token` ก่อน service key ทำให้หลังมีคน login query ของทุก request ใช้ JWT ของคนที่ login ล่าสุด (ยืนยันด้วย script offline แล้ว) · ผู้ใช้แจ้งว่า RLS ของ `trips`/`itineraries`/`poi_scores`/`users` ปิดอยู่ จึงยังไม่เห็นอาการ | 2026-10-17 (T22) | เพิ่ม `createAuthClient()` ใน `config/db.ts` แล้วให้ `signUp`/`signInWithPassword` ใช้ client ใหม่ต่อ request · backend tsc ผ่าน · script offline (mock fetch) ยืนยันว่าหลังแก้ query บน client หลักใช้ service key (7/7) · ✅ ผู้ใช้ทดสอบกับ Supabase จริง 2026-10-17 (2 บัญชี หน้าต่างปกติ + Incognito): login ผิด/ถูก, แต่ละบัญชีเห็นเฉพาะ MyTrips ของตัวเองครบ, refresh แล้วยังเป็นบัญชีเดิม, logout, login ซ้ำ · ✅ register/ยืนยันอีเมลผ่าน (สมัครใหม่, สมัครซ้ำได้ "อีเมลนี้มีบัญชีอยู่แล้ว", login ก่อนยืนยันได้ 403, ลิงก์ยืนยันพากลับ `/login`, login แล้วเข้า `/home`, มีแถวใน Auth Users และ `users` role `user`) · ผู้ใช้ยืนยันว่า RLS ปิดทุกตาราง จึงไม่มีผลต่างของผลลัพธ์ query หลังแก้ |
| 19 | comment ของ `getAutoTripPlacesTest` เขียนว่า `GET /api/itinerary/trips/:tripId/auto-test` แต่ route จริงคือ `/auto-places` (`itineraryRoutes.ts:23`) | 2026-10-17 | แก้ comment ใน `itineraryController.ts:418` เป็น `auto-places` (แก้แค่ comment ไม่มีผลกับการทำงาน) · backend tsc ผ่าน |
| 26 | ⚪ Security: หลังกดลิงก์ยืนยันอีเมล Supabase พากลับ `/login` พร้อม session ใน URL hash (`#access_token=…&refresh_token=…&type=signup`) ตาม `emailRedirectTo` ใน `authController.register` แต่ frontend ไม่ได้ใช้ supabase-js จึงไม่มีโค้ดล้าง hash token ค้างบนแถบ URL จนกว่าจะ login และค้างใน history (ปุ่ม Back) — พบตอน manual test T22 2026-10-17 | 2026-10-17 | `login.tsx` เพิ่ม `useEffect` ที่ `navigate(pathname + search, { replace: true })` เมื่อ hash มี `access_token=`/`refresh_token=`/`error=` · tsc/eslint ไฟล์นี้/build ผ่าน, lint รวมเท่า baseline (29/4) · **ข้อจำกัด:** หน้า History ของ browser อาจบันทึก URL เต็มไว้แล้วตั้งแต่เปิดลิงก์ (กันได้ทั้งหมดต้องเปลี่ยนเป็น PKCE flow) และ token ที่ส่งมาแล้วยังใช้ได้ตามอายุ · ✅ ผู้ใช้ทดสอบผ่าน 2026-10-17: hash `access_token` และ `error` ถูกล้าง, กด Back ไม่กลับไป URL ที่มี token, login ปกติ, ลิงก์ยืนยันอีเมลจริงไม่มี token ค้าง |

## ข้อสันนิษฐาน (ยังไม่ใช่ข้อเท็จจริง)
- เป็นโปรเจกต์ของนักศึกษา/ทีมเล็ก (มี comment ว่า "ควรทำ sensitivity analysis … ในรายงาน") — ใช้เป็นบริบทเท่านั้น
- เครื่องที่ใช้พัฒนาเป็น Windows (ดูจาก node_modules, CRLF และ `core.ignorecase`)
