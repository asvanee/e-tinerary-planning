# DEVELOPMENT_PLAN

> แผนนี้มาจากหลักฐานใน [DEVELOPMENT_STATUS.md](DEVELOPMENT_STATUS.md) **ทุกงานเป็นข้อเสนอของ Claude** ไม่ได้มาจาก requirement เดิมของเจ้าของโปรเจกต์ ยกเว้นงานที่อ้างถึง comment/commit ในโค้ดซึ่งระบุไว้ในคอลัมน์ "ที่มา"
> ลำดับความสำคัญ: P0 = ต้องทำก่อน · P1 = จำเป็นต่อฟีเจอร์หลัก · P2 = ควรทำ · P3 = ทำเมื่อมีเวลา
> ทุกงานทำบน branch `dev` เท่านั้น (ห้ามสร้าง branch ใหม่ ห้ามแตะ `main` — ดู D-21) 1 งาน = 1 commit เมื่อผู้ใช้สั่ง แล้วอัปเดต DEVELOPMENT_STATUS.md เมื่อเสร็จ

---

## กลุ่ม 1 — ปัญหาที่ทำให้ระบบใช้งานไม่ได้หรือมีความเสี่ยงสูง

### T1. ทำให้ frontend build ผ่าน และ build ได้บน OS ที่แยกตัวพิมพ์ — P0
- **สถานะ:** Known Issues #2, #3, #4
- **ไฟล์:** `frontend/src/features/auth/confirmEmail/confirmEmail.tsx`, `frontend/src/components/navbar.tsx` (ชื่อใน git index), `frontend/src/features/trip/e-tinerary/auto/auto.tsx`
- **สิ่งที่ต้องทำ:** แก้ import CSS ให้ตรงกับชื่อไฟล์จริง · rename ใน git ด้วย `git mv` สองขั้น (`Navbar.tsx` → ชื่อชั่วคราว → `navbar.tsx`) · ใช้หรือลบตัวแปร `loading` ที่ไม่ถูกใช้ใน auto.tsx (ต้องดูก่อนว่าตั้งใจจะแสดง loading state หรือไม่)
- **เสร็จเมื่อ:** `npm run build` ผ่านบน Windows และ `git ls-files frontend/src/components` แสดง `navbar.tsx`
- **ความเสี่ยง:** ต่ำ

### T2. ปิดช่องโหว่ ownership ของ `/auto-places` — P0
- **ไฟล์:** `backend/src/features/itinerary/itineraryController.ts` (`getAutoTripPlacesTest`)
- **สิ่งที่ต้องทำ:** เพิ่ม `getTripOwnerAndStart` + เช็ค `userId` แบบเดียวกับ endpoint อื่น หรือพิจารณาลบ endpoint นี้ (frontend ใช้แค่เป็น pre-check ใน `TripRecommendations.handleAutoTrip`)
- **เสร็จเมื่อ:** ถ้าเรียกทริปของคนอื่นต้องได้ 403
- **ความเสี่ยง:** ถ้าลบ endpoint ต้องแก้ `TripRecommendations.tsx` ไปพร้อมกัน

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
- **T11 (P2)** จัดการ token หมดอายุ: ถ้า API ตอบ 401 ให้ logout แล้วพาไป `/login` หรือใช้ refresh token (ตัดสินใจก่อนลงมือ)
- **T12 (P3)** ข้อมูลจังหวัดอื่น / Stage 3 สำหรับกรุงเทพฯ และชลบุรี — ต้องหาโค้ด Stage 3 ก่อน (ไม่มีใน repo)

## กลุ่ม 4 — การทดสอบและการตรวจสอบความถูกต้อง
- **T13 (P1)** Unit test ของ pure functions ที่เป็นหัวใจของระบบ (ไม่ต้องใช้ DB): `poiScoreCalculator.ts`, `itineraryBuilder.buildDayItems`, `openingHoursChecker.checkOpeningStatus` (เคสข้ามเที่ยงคืน, หลายช่วงต่อวัน, 24 ชม.), `tripController.validateNoMidnightCrossing` (ต้อง export ก่อน), `autoTripBuilder`
- **T14 (P1)** **Parity test** ระหว่าง backend และ frontend mirror: ใช้ input ชุดเดียวกันต้องได้ผล `buildDayItems` และ `checkOpeningStatus` ตรงกัน (ใช้ vitest import ไฟล์ backend โดยตรงผ่าน relative path หรือใช้ JSON fixture ร่วมกัน)
- **T15 (P2)** แก้ jest/ts-jest ให้ major version ตรงกัน แล้วยืนยันว่า `npm test` รันได้
- **T16 (P2)** ทำ ESLint errors ให้เป็นศูนย์ (เริ่มจาก `react-hooks/refs` ใน `RecommendationMap.tsx:209` ซึ่งอาจเป็น bug จริง)
- **T17 (P2)** เขียน checklist manual E2E (มีใน skill `verify-changes`)

## กลุ่ม 5 — คุณภาพและประสิทธิภาพ
- **T18 (P3)** ลบ dead code (Known Issue #16) — ยืนยันกับเจ้าของก่อน เพราะ comment ระบุว่า `buildNearestNeighborOrder` ตั้งใจเก็บไว้
- **T19 (P3)** รวม fetch helper ของ frontend (ใส่ base URL + Authorization ให้อัตโนมัติ) ปัจจุบันบางไฟล์ใช้ `VITE_API_URL` บางไฟล์ใช้ `/api` ตรงๆ
- **T20 (P3)** แตกไฟล์ขนาดใหญ่ (`auto.tsx` 1,613 บรรทัด, `createTrip.tsx` 1,110, `ItineraryEditor.tsx` 1,050) — ทำหลังจากมี test แล้วเท่านั้น
- **T21 (P3)** ทำให้ `.gitattributes` กำหนด line ending ให้ชัดเจน

## กลุ่ม 6 — งานเพิ่มเติมที่ไม่เร่งด่วน
- Weather มิติอื่น (ความร้อน/UV/PM2.5) ตามที่ comment ใน `poiScoreCalculator.ts` ระบุว่าเป็นแนวทางพัฒนาต่อ
- Sensitivity analysis ของค่า MIXED (0.3/0.5/0.7) ตามที่ comment ใน `poiScoreCalculator.ts` แนะนำ
- เขียน README จริง (ตอนนี้เป็นไฟล์ UTF-16 มีแค่หัวเรื่อง)

## ลำดับที่แนะนำ
`T1 → T2 → T13/T14 (สร้างตาข่ายความปลอดภัย) → T5 (ตัดสินใจ) → T4 → T3 → T6 → T7 → ที่เหลือ`
