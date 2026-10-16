---
name: supabase-data-access
description: ใช้เมื่อเพิ่มหรือแก้ query ของ Supabase ใน backend (select/insert/update/upsert/delete), ใช้ตารางหรือคอลัมน์ใหม่, หรือแตะการตรวจสิทธิ์เจ้าของข้อมูล เพราะ backend ใช้ service role key และ repo ไม่มี DB schema
---

# Supabase Data Access

## ข้อเท็จจริงที่ต้องรู้
- `backend/src/config/db.ts` สร้าง client ด้วย `SUPABASE_SERVICE_ROLE_KEY` ซึ่ง **ข้าม RLS ทั้งหมด** ความปลอดภัยจึงอยู่ที่โค้ดเท่านั้น
- ใน repo **ไม่มี schema/migration** สิ่งที่รู้มาจาก query ที่มีอยู่ (ดู `docs/PROJECT_OVERVIEW.md` หัวข้อ 7)
- ตารางที่ใช้: `users`, `trips`, `trip_categories`, `trip_days`, `categories`, `places`, `place_categories`, `poi_scores`, `itineraries`
- Supabase จำกัดจำนวนแถวต่อ request (ค่า default ของโปรเจกต์ใหม่คือ 1000 ซึ่ง data-pipeline เขียนไว้ใน `fetchGmapsCategories.ts`) **ค่าที่ตั้งไว้จริงในโปรเจกต์นี้: ยังไม่ทราบ**
- relation ที่ embed มา (`places!inner(...)`) Supabase อาจ infer type เป็น array ทั้งที่ข้อมูลจริงเป็น object โค้ดเดิมจึงใช้ `as any[]` (ดู comment "แก้ TS2339")

## ขั้นตอน
1. **หา pattern เดิม** ของ query ที่คล้ายกันก่อน:
   - ownership: `getTripOwnerAndStart()` (`itineraryPlaceQueries.ts`) หรือ `.eq("trip_id", id).eq("user_id", userId)` (`tripController.ts`)
   - multi-category: select ผ่าน `place_categories` แล้ว dedupe โดยเลือก `confidence_score` สูงสุด (`getSelectedPlaces`, `queryPlacesWithCategoryInfo`, `getPlacesByIds`)
   - upsert: `poi_scores` ใช้ `onConflict: "trip_id,place_id"`
   - pagination: `.range(from, from + PAGE_SIZE - 1)` (`data-pipeline/src/fetchGmapsCategories.ts`)
2. **ตรวจสิทธิ์** — ข้อมูลที่ผูกกับทริปหรือผู้ใช้ ต้องตรวจเจ้าของ **ก่อน** อ่านหรือเขียนเสมอ ตัวอย่างที่ผิดอยู่ตอนนี้คือ `getAutoTripPlacesTest`
3. **ตรวจ error ทุกครั้ง** (`const { data, error } = ...; if (error) ...`) แล้วส่งข้อความที่ปลอดภัยให้ client โดยไม่ส่ง `error.message` ดิบที่อาจเปิดเผยโครงสร้าง DB ในงานใหม่ (โค้ดเก่าบางจุดส่งดิบอยู่ ไม่ต้องไล่แก้ถ้าไม่เกี่ยวกับงาน)
4. **การเขียนหลายขั้นตอน** — Supabase JS ไม่มี transaction ข้ามหลาย call ถ้าต้อง atomic ให้เสนอ Postgres function (RPC) และให้ผู้ใช้สร้างเอง ถ้าทำไม่ได้ให้เรียงลำดับให้ปลอดภัย (validate ทั้งหมดก่อน แล้วค่อยลบ/เขียน) ดู `confirmItinerary`
5. **ถ้าต้องใช้คอลัมน์หรือตารางใหม่** — เขียน SQL ให้ผู้ใช้รันเอง (พร้อม index/constraint/RLS ที่ควรมี) แล้วรอให้ยืนยันว่ารันแล้ว ห้ามเดาว่ามีคอลัมน์อยู่แล้ว
6. **จำนวนแถว** — query ที่อาจเกิน 1000 แถว (เช่น select ทั้งตาราง `places`) ต้อง paginate หรือใช้ aggregate ฝั่ง DB
7. ตรวจตาม `verify-changes`

## ข้อควรระวัง
- ห้ามใช้ service role key ในโค้ดฝั่ง frontend หรือใน `VITE_*`
- ห้ามรัน SQL ที่ลบหรือแก้ข้อมูล และห้ามรัน data-pipeline เอง
- `delete` ต้องมีเงื่อนไขกรองเสมอ (`.eq`/`.in`) ห้ามมี delete ที่ไม่มีเงื่อนไข
- FK `ON DELETE CASCADE`: ยังไม่ทราบว่ามีหรือไม่ (ดู comment ใน `deleteTrip`)

## หยุดแล้วถามผู้ใช้เมื่อ
- ต้องรู้ schema, constraint, RLS หรือ max rows จริง
- ต้องเพิ่มหรือเปลี่ยนตาราง/คอลัมน์
- การเปลี่ยนนี้กระทบข้อมูลที่บันทึกไว้แล้ว

## รูปแบบรายงาน
```
## Data access change
ตาราง/คอลัมน์ที่แตะ: (อ่าน/เขียน)
Ownership check: <อยู่ที่ไหน>
Error handling:
จำนวนแถว/pagination:
SQL ที่ผู้ใช้ต้องรันเอง (ถ้ามี):
ผลการตรวจ (verify-changes):
สิ่งที่ยังไม่ทราบ:
```
