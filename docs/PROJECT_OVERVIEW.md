# PROJECT_OVERVIEW — E-tinerary Planning

> สร้างจากการตรวจ ZIP `e-tinerary-project.zip` (commit ล่าสุด `0c980bd` บน branch `dev`, 2026-10-13)
> ทุกข้อในเอกสารนี้อ้างอิงไฟล์จริง ถ้าข้อใดยังยืนยันไม่ได้จะเขียนว่า **ยังไม่ทราบ / ต้องตรวจสอบเพิ่มเติม**

## 1. โปรเจกต์นี้ทำอะไร

เว็บแอปวางแผนทริปท่องเที่ยวในประเทศไทย (UI และข้อความ error เป็นภาษาไทย) ผู้ใช้ทำได้ดังนี้
1. สมัครและเข้าสู่ระบบด้วย Supabase Auth ผ่าน backend (`backend/src/features/auth/`)
2. สร้างทริป โดยกำหนดจังหวัด/อำเภอ, ช่วงวันที่, เวลาเริ่ม, จำนวนคน, งบประมาณ, เวลาว่างต่อวัน, หมวดหมู่ที่สนใจ และหมุดจุดเริ่มต้น (`frontend/src/features/trip/create/createTrip.tsx`)
3. ให้ระบบคำนวณคะแนนสถานที่แนะนำ (POI score) จาก category, rating, ระยะทางถนน (ORS), ราคา และโอกาสฝน (Open-Meteo) (`backend/src/features/poi/`)
4. เลือกสถานที่ แล้วลากวางลงแต่ละวันเองใน Itinerary Editor ระบบจะคำนวณเวลา/งบ/เวลาเปิด-ปิดให้ทันที (`frontend/src/features/trip/e-tinerary/editor/ItineraryEditor.tsx`)
5. หรือใช้ "จัดทริปอัตโนมัติ" (Auto Trip) (`backend/src/features/itinerary/autoTripBuilder.ts`, `frontend/src/features/trip/e-tinerary/auto/auto.tsx`)
6. ยืนยันแผน (backend ตรวจซ้ำก่อนบันทึก) และดูแผนที่ยืนยันแล้ว (`TripDetail.tsx`)

ข้อมูลสถานที่มาจาก CSV สถานที่ท่องเที่ยวของ ททท. (`backend/data/attraction.csv`) ที่ admin ตรวจและนำเข้าผ่านหน้า `/admin` แล้วเติมรายละเอียดจาก Google Places API ลงตาราง `places` (ข้อมูลเชียงใหม่/ชลบุรี/กรุงเทพฯ เดิมมาจาก `data-pipeline/` ที่ลบแล้ว — D-37)

## 2. โครงสร้าง Repository

```text
e-tinerary-project/            (git repo, remote: github.com/macaronieiei/e-tinerary-planning)
├── README.md                  มีแค่หัวเรื่อง (ไฟล์เข้ารหัส UTF-16)
├── .gitignore
├── backend/                   Express 5 + TypeScript (CommonJS) — REST API
│   ├── src/server.ts          ★ entry point จริง (mount routes ทั้งหมด, เช็ค DB ก่อน listen)
│   ├── src/config/            db.ts (Supabase client, service role), ors.ts (config ORS)
│   ├── src/features/<feature>/  <feature>Routes.ts + <feature>Controller.ts (+ queries/builders)
│   │   ├── auth/              register / login / logout + requireAuth middleware
│   │   ├── trip/              CRUD ทริป
│   │   ├── categories/        GET หมวดหมู่
│   │   ├── places/            GET places by ids + dropdown/ (provinces, districts)
│   │   ├── poi/               คำนวณ POI score
│   │   └── itinerary/         draft / confirm / saved / auto trip
│   ├── src/utils/             haversine, openingHoursChecker, orsDistance, orsTravelMatrix,
│   │                          priceLevel, weatherForecast, bestCategoryRow
│   ├── src/admin/             API ของ admin (D-24): requireAdmin, adminRoutes, provinces/, imports/ (job นำเข้า), pipeline/ (อ่าน CSV, dedupe, review, import — test ใน __tests__)
│   ├── data/attraction.csv    CSV สถานที่ของ ททท. (ใช้โดย admin pipeline)
│   └── jest.config.js         ts-jest preset
└── frontend/                  React 19 + Vite 7 + TypeScript + Tailwind 4
    ├── src/main.tsx           entry (AuthProvider > App)
    ├── src/App.tsx            ★ routing ทั้งหมด
    ├── src/components/navbar.tsx
    ├── src/features/          auth / home / welcome / trip/{create,recommendations,
    │                          e-tinerary/{editor,auto,components,lib},detail,myTrips}
    ├── src/admin/             หน้า admin (D-24): login, dashboard, provinces/ (ตรวจข้อมูลจังหวัด), imports/ (นำเข้า + รอตรวจ), lib/
    ├── src/system/auth/       ใช้ร่วม user/admin: AuthContext, useAuth, ProtectedRoute, LoginForm
    ├── vite.config.ts         proxy /api → http://localhost:5000, ตั้งค่า vitest
    ├── eslint.config.js
    └── dist/                  ผลของ npm run build — ถูก gitignore
```

ZIP ที่ได้รับมี `node_modules/` ของทั้ง 3 package ซึ่งติดตั้งบน **Windows** (พบ `@esbuild/win32-x64` และ `@rollup/rollup-win32-*`) และมีไฟล์ `.env` ทั้ง 3 package (ไม่ได้คัดลอกค่ามาไว้ในเอกสารนี้)

## 3. Technology Stack (ตรวจจาก package.json)

| ส่วน | เทคโนโลยี | หลักฐาน |
|---|---|---|
| Backend | Node.js, Express `^5.2.1`, TypeScript `^5.9.3`, `ts-node-dev` | `backend/package.json` |
| Backend DB client | `@supabase/supabase-js ^2.97.0` (ถอด `pg`, `postgres`, `axios` ที่ไม่ได้ใช้ออกแล้ว 2026-10-17, T18) | `backend/package.json` |
| Backend CSV | `csv-parse ^6.1.0` (อ่าน `data/attraction.csv` ใน admin pipeline — D-25) | `backend/package.json` |
| Backend test | Jest `^30.4.2` + ts-jest `^29.4.11` (ts-jest 29.4 รองรับ jest 30 — ตรวจแล้ว T15) | `backend/package.json` |
| Frontend | React `^19.2.0`, react-router-dom `^7.13.0`, Vite `^7.3.1`, Tailwind `^4.2.0` | `frontend/package.json` |
| Frontend map | Leaflet + react-leaflet (แผนที่หลัก, OSM tiles), `@react-google-maps/api` (ใช้เฉพาะ `LocationPinPicker.tsx`) | imports |
| Frontend DnD | `@dnd-kit/core`, `@dnd-kit/sortable` | `ItineraryEditor.tsx` |
| Frontend test | Vitest `^4.1.10` (ไม่มีไฟล์ test) | `frontend/package.json` |
| Lint | ESLint 9 flat config + typescript-eslint + react-hooks + react-refresh (frontend เท่านั้น) | `frontend/eslint.config.js` |
| Package manager | npm (มี `package-lock.json` แยกแต่ละ package ไม่มี workspace รวม) | |
| Node ที่ต้องใช้ | ยังไม่ทราบ — ไม่มี `engines`/`.nvmrc`; โค้ดใช้ global `fetch` และ `AbortSignal.timeout` จึงต้องใช้ Node ≥ 18 | `utils/orsTravelMatrix.ts`, `weatherForecast.ts` |

## 4. Entry Points และการรัน

| Package | คำสั่ง (มีอยู่จริงใน scripts) | หมายเหตุ |
|---|---|---|
| backend | `npm run dev` → `ts-node-dev --respawn --transpile-only src/server.ts` | port จาก `PORT` (default 5000); ถ้าเชื่อม Supabase ไม่ได้จะ `process.exit(1)` |
| backend | `npm test` → `jest` | test ของ admin pipeline, trip และ itinerary |
| backend | — | **ไม่มี** script `build` / `start` / `lint` (ตรวจ type ได้ด้วย `npx tsc --noEmit`) |
| frontend | `npm run dev` (vite), `npm run build` (`tsc -b && vite build`), `npm run lint`, `npm run preview`, `npm test` (`vitest run`) | dev proxy `/api` → `localhost:5000` |

## 5. Frontend Routes (`frontend/src/App.tsx`)

| Path | Component | Protected |
|---|---|---|
| `/` | `features/welcome/Welcome.tsx` | – |
| `/register`, `/login`, `/confirm-email` | `features/auth/...` | – |
| `/home` | `features/home/home.tsx` | ✓ |
| `/trip/create`, `/trip/:tripId/edit` | `features/trip/create/createTrip.tsx` (ใช้ซ้ำสำหรับแก้ไข) | ✓ |
| `/trip/:tripId/recommendations` | `TripRecommendations.tsx` + `RecommendationMap.tsx` — คำนวณและแสดงสถานที่แนะนำพร้อม POI Score | ✓ |
| `/trip/:tripId/editor` | `ItineraryEditor.tsx` (รับข้อมูลผ่าน router state) | ✓ |
| `/trip/:tripId/auto` | `e-tinerary/auto/auto.tsx` — กรอกเวลาเที่ยวต่อ category ก่อนจัดทริป | ✓ |
| `/trip/:tripId/detail` | `TripDetail.tsx` | ✓ |
| `/trips` | `MyTrips.tsx` | ✓ |
| `/admin/login` | `admin/login/AdminLogin.tsx` (ใช้ `system/auth/LoginForm.tsx` ร่วมกับ `/login`) | – |
| `/admin/provinces` | `admin/provinces/ProvinceList.tsx` (จังหวัดจาก CSV + สถานะ) | `AdminRoute` |
| `/admin/categories` | `admin/categories/CategoryMapping.tsx` (R5 P5e, D-40) — หมวดแยก 3 กลุ่ม · แก้ชื่อ/กลุ่ม/ในร่ม-กลางแจ้ง/ค่าเข้าชม · ย้ายป้าย ททท. ไปหมวดอื่น (ถามยืนยันก่อน) | `AdminRoute` |
| `/admin/provinces/:province` | `admin/provinces/ProvinceReview.tsx` (แท็บ น่าจะซ้ำ / ต้องตรวจสอบ / มีปัญหา / ตัดสินใจแล้ว — `components/GroupCard.tsx`, `ProblemRowCard.tsx` · ปุ่ม "นำเข้า" เมื่อตัดสินใจครบ) | `AdminRoute` |
| `/admin/provinces/:province/import` | `admin/imports/ProvinceImport.tsx` (ดูตัวอย่าง → เริ่ม → ความคืบหน้า poll ทุก 2 วินาที → ผลรายแถว `ImportItemsTable.tsx` + ประวัติ job + ตัดสินแถวรอตรวจ `PendingReview.tsx`) | `AdminRoute` |
| `/admin` | `admin/dashboard/AdminDashboard.tsx` ใน `AdminLayout` — 2 การ์ด: ตรวจสถานที่ซ้ำและนำเข้าข้อมูล (→ `/admin/provinces`) · Category Mapping (→ `/admin/categories` — P5e) | `AdminRoute` (ถาม `GET /api/admin/me` ทุกครั้ง: 401 → `/admin/login`, 403 → `/home`) |

## 6. Backend API (`backend/src/server.ts` + `*Routes.ts`)

| Method & Path | Auth | Controller |
|---|---|---|
| POST `/api/auth/register` · `/login` · `/logout` | – | `authController.ts` |
| GET `/api/categories` | – | `categoriesController.ts` — `{ categories: [{ category_id, category_name, parent_group }] }` |
| GET `/api/place-dropdown/provinces` · `/districts?province=` | – | `placeDropdownController.ts` |
| GET `/api/places?ids=a,b` | ✓ | `placesController.ts` |
| POST `/api/trips` · GET `/api/trips` · GET/PUT/DELETE `/api/trips/:tripId` · PUT `/api/trips/:tripId/addcategories` (D-38) | ✓ | `tripController.ts` |
| POST `/api/poi/trips/:tripId/calculate-poi` | ✓ | `poiController.ts` |
| POST `/api/itinerary/trips/:tripId/draft` | ✓ | `itineraryController.buildDraft` |
| GET `/api/itinerary/trips/:tripId` | ✓ | `getSavedItinerary` |
| PUT `/api/itinerary/trips/:tripId` | ✓ | `confirmItinerary` |
| GET `/api/itinerary/trips/:tripId/auto-places` | ✓ (เช็คเจ้าของทริปแล้วตั้งแต่ T2, `381dc8d`) | `getAutoTripPlacesTest` |
| GET `/api/itinerary/trips/:tripId/auto/categories` | ✓ | `getAutoTripCategoriesController` — เช็คเจ้าของทริป · คืนหมวดที่เลือกจาก `trip_categories` |
| POST `/api/itinerary/trips/:tripId/auto` | ✓ | `buildAutoTripController` — body `{ visitDurationByCategory: { [categoryId]: นาที } }` (เพดานเวลารวมต่อหมวด 30/60/90/120/150/180 นาที รวมเที่ยวและเดินทาง — D-47) |
| GET `/api/admin/me` | ✓ + admin (`requireAdmin` อ่าน `users.role` จาก DB) | `admin/adminController.getAdminMe` → `{ isAdmin: true }` |
| GET `/api/admin/categories` | ✓ + admin | `admin/categories/categoryController.getAdminCategories` — 29 หมวด + ป้ายในแต่ละหมวด + จำนวนสถานที่ต่อป้าย (R5 P5e) |
| PUT `/api/admin/categories/:categoryId` | ✓ + admin | `putCategory` — body `{ category_name, parent_group, environment_type, price_nature }` (ครบทุกช่อง, `categoryInput.ts`) · ชื่อซ้ำ 409 · คืนรายการล่าสุด |
| PUT `/api/admin/categories/labels/:labelId` | ✓ + admin | `putLabelCategory` — body `{ category_id }` ย้ายป้ายไปหมวดอื่น · คืนรายการล่าสุด |
| GET `/api/admin/provinces` | ✓ + admin | `admin/provinces/provincesController.getProvinces` — จังหวัดจาก CSV + จำนวนแถว CSV / ใน `places` / การตัดสินใจ |
| GET `/api/admin/provinces/:province/review` | ✓ + admin | `getProvinceReview` — กลุ่มที่อาจซ้ำ + แถวที่มีปัญหา (`pipeline/review/buildReview.ts`) |
| PUT · DELETE `/api/admin/provinces/:province/groups` | ✓ + admin | `putGroupDecision` / `deleteGroupDecision` — body `{ attIds, sets: [{ attIds, primaryAttId, fieldSources?, fieldValues?, lat?, lng? }], note? }` (เลือก/พิมพ์ได้เฉพาะ 19 ช่องที่นำเข้า — D-31/D-32) |
| PUT · DELETE `/api/admin/provinces/:province/rows/:attId` | ✓ + admin | `putRowDecision` / `deleteRowDecision` — body `{ kind: exclude \| ok \| fix_location, lat?, lng?, note? }` |
| GET `/api/admin/provinces/:province/import/preview?limit=N` | ✓ + admin | `admin/imports/importController.getImportPreview` — จำนวนแถวที่จะนำเข้า/ข้าม, จำนวน request Google โดยประมาณ, `blockers` (ไม่เรียก Google) |
| POST `/api/admin/provinces/:province/import` | ✓ + admin | `startImport` — body `{ limit_rows? }` · ตรวจเงื่อนไขซ้ำ (409 + `blockers`) แล้วสร้าง job และรันเบื้องหลัง → 202 `{ job }` · ⚠️ เรียก Google จริง (มีค่าใช้จ่าย) |
| GET `/api/admin/provinces/:province/imports` | ✓ + admin | `getProvinceImports` — ประวัติ job ของจังหวัด (50 ล่าสุด) |
| GET `/api/admin/imports/:jobId` · POST `/api/admin/imports/:jobId/cancel` | ✓ + admin | `getImportJob` (ความคืบหน้า) / `cancelImportJob` (หยุดก่อนแถวถัดไป, 409 ถ้า job ไม่ได้ทำงานอยู่) |
| GET `/api/admin/imports/:jobId/items?status=&page=` | ✓ + admin | `getImportItems` — ผลรายสถานที่ หน้าละ 100 แถว (page เริ่ม 0) พร้อม `csv_name`, `csv_location` จาก CSV |
| GET `/api/admin/provinces/:province/import/pending` | ✓ + admin | `getPendingImports` — แถว `needs_review_*` ของทุก job ในจังหวัด (P4c) |
| POST `/api/admin/imports/items/:itemId/resolve` | ✓ + admin | `resolveImportItem` — body `{ action: accept_google | csv_only | skip }` · 409 เมื่อทำไม่ได้ (เช่นแถวซ้ำ/พิกัดเสีย/ตัดสินไปแล้ว) · ⚠️ accept_google เรียก Google Details 1 ครั้ง |

Auth: `requireAuth` (`features/auth/authMiddleware.ts`) อ่าน `Authorization: Bearer <access_token>` แล้วเรียก `supabase.auth.getUser(token)` ฝั่ง frontend เก็บ `user` และ `session` ไว้ใน `localStorage` (`system/auth/AuthContext.tsx`) · route ของ admin (`backend/src/admin/adminRoutes.ts`) ผ่าน `requireAuth` + `requireAdmin` ทุกตัว

## 7. ตารางฐานข้อมูล (อนุมานจาก query — ไม่มี schema/migration ใน repo)
> โครงสร้างจริงจาก Supabase (snapshot 2026-10-18) อยู่ที่ [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md) — ถ้าขัดกับหัวข้อนี้ให้ยึดไฟล์นั้น

`users`, `trips`, `trip_categories`, `trip_days`, `categories`, `category_labels`, `places`, `poi_scores`, `itineraries`

คอลัมน์ที่พบใน query เช่น `places.opening_hours` (jsonb รูปแบบ Google `periods`), `places.price_level`, `categories.price_nature` (`free`|`paid`), `categories.environment_type` (`INDOOR`|`OUTDOOR`|`MIXED`), `itineraries.visit_duration_min` (เวลาที่ผู้ใช้กรอก — D-36/D-43) · `categories.default_duration_min` และตาราง `place_categories` ถูกลบใน P5g; Auto Trip โหลดหมวดที่เลือกจาก `trip_categories` และจับคู่สถานที่ผ่าน `category_labels` (D-45) แล้วบันทึกเวลารายสถานที่ใน `itineraries.visit_duration_min` · `poi_scores` (unique `trip_id,place_id`), `trip_days` (unique `trip_id,day_number` ตาม comment)
**Schema จริง, RLS, FK/CASCADE:** ดู [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md) (snapshot 2026-10-18 + การเปลี่ยนแปลงหลังจากนั้น: PK ทุกตารางเป็น uuid — T23) · RLS ปิดทุกตารางเดิม · FK ส่วนใหญ่ `ON DELETE CASCADE`

## 8. บริการภายนอก

| บริการ | ใช้ที่ไหน | หมายเหตุ |
|---|---|---|
| Supabase (Auth + Postgres) | backend `config/db.ts` (service role) · frontend ไม่ได้เรียก Supabase ตรง (ทุกอย่างผ่าน backend) | |
| OpenRouteService (HeiGIT) Matrix | backend `utils/orsDistance.ts`, `utils/orsTravelMatrix.ts` | default base `https://api.heigit.org/openrouteservice`; ถ้าไม่มี key จะใช้ haversine แทน |
| ORS Directions | frontend `e-tinerary/components/RouteMap.tsx` | **เรียกจาก browser ด้วย `VITE_ORS_API_KEY`** |
| Open-Meteo | backend `utils/weatherForecast.ts` | ไม่ต้องใช้ key |
| Google Maps JS | frontend `LocationPinPicker.tsx` | `VITE_GOOGLE_MAPS_API_KEY` |
| Google Places (Find/Details, Legacy API) | backend `admin/pipeline/import/googlePlaces.ts` (R5 P4 — เรียกเมื่อ admin กดนำเข้า/ยอมรับผล Google เท่านั้น มีค่าใช้จ่าย) | `GOOGLE_PLACES_API_KEY` |
| OSM tiles | Leaflet ใน frontend | |

## 9. Environment Variables (เฉพาะชื่อ — ห้ามคัดลอกค่า)

| Package | ชื่อตัวแปร | หน้าที่ | อยู่ใน .env | ใช้ในโค้ด |
|---|---|---|---|---|
| backend | `SUPABASE_URL` | URL ของโปรเจกต์ Supabase | ✓ | ✓ |
| backend | `SUPABASE_SERVICE_ROLE_KEY` | key สิทธิ์สูงสุด (ข้าม RLS) | ✓ | ✓ |
| backend | `PORT` | port ของ API | ✓ | ✓ |
| backend | `FRONTEND_URL` | — | ✓ | **✗ ไม่ถูกใช้** (CORS เปิดทุก origin, redirect ใน register hardcode `http://localhost:5173/login`) |
| backend | `ORS_API_KEY` | key ของ ORS | ✓ | ✓ |
| backend | `GOOGLE_PLACES_API_KEY` | Google Places (Find Place + Details) สำหรับนำเข้าใน admin (R5 P4) — ผู้ใช้ย้ายค่ามาจาก `data-pipeline/.env` แล้ว 2026-10-18 | ✓ | ✓ `admin/imports/importController.ts` (R5 P4a/P4c) |
| backend | `ORS_BASE_URL`, `ORS_PROFILE`, `ORS_TIMEOUT_MS`, `ORS_MATRIX_CHUNK_SIZE`, `ORS_CACHE_TTL_MS` | ค่า optional ของ ORS (มี default) | ✗ | ✓ (`config/ors.ts`) |
| frontend | `VITE_API_URL` | base URL ของ API (ใช้แค่ในไฟล์ auth/navbar; ไฟล์อื่นใช้ path `/api` ตรงๆ) | ✓ | ✓ |
| frontend | `VITE_GOOGLE_MAPS_API_KEY` | Google Maps JS | ✓ | ✓ |
| frontend | `VITE_ORS_API_KEY` | ORS directions จาก browser | ✓ | ✓ |
| frontend | `VITE_ORS_BASE_URL`, `VITE_ORS_PROFILE` | optional | ✗ | ✓ |

ตัวแปรที่ขึ้นต้นด้วย `VITE_` จะถูกฝังลงใน JS bundle ที่ส่งให้ browser ทุกครั้ง

## 10. Deploy

ไม่พบไฟล์ deploy ใดๆ (Dockerfile, vercel.json, netlify.toml, CI workflow) — **ยังไม่ทราบว่าจะ deploy ที่ไหน**

## 11. เอกสารที่โค้ดอ้างถึง แต่ไม่มีใน ZIP

comment ในโค้ดอ้างถึงเอกสารเหล่านี้หลายครั้ง: `PROJECT_BRIEF.md`, `PROJECT_BRIEF_v4.md`, `PRICE_SCORE_REDESIGN.md` (17 ครั้ง), `itineraries_feature_status.md` (8 ครั้ง), `DATA_PREPARATION_4.md` (5 ครั้ง)
ถ้ามีไฟล์เหล่านี้อยู่ ควรนำมาใส่ใน `docs/legacy/` เพื่อให้ Claude Code ใช้เป็นบริบทประกอบ

ดูต่อที่: [ARCHITECTURE.md](ARCHITECTURE.md) · [DEVELOPMENT_STATUS.md](DEVELOPMENT_STATUS.md) · [DEVELOPMENT_PLAN.md](DEVELOPMENT_PLAN.md)
