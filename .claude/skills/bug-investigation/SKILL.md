---
name: bug-investigation
description: วิเคราะห์หาสาเหตุและแก้ bug ใน E-tinerary (error จาก API, คะแนน POI ผิด, เวลา/งบ/conflict ใน itinerary ไม่ตรง, หน้าเว็บ redirect ผิด, build fail) ใช้เมื่อผู้ใช้แจ้งพฤติกรรมผิดปกติหรือ error message
---

# Bug Investigation (E-tinerary)

## ขอบเขต
ใช้ตั้งแต่ได้รับอาการจนแก้เสร็จ ถ้าการแก้กลายเป็นงานเปลี่ยนพฤติกรรมใหญ่ ให้เปลี่ยนไปใช้ `feature-development`

## ขั้นตอน
1. **เก็บอาการ**: หน้าไหน (path), ทำอะไร, ผลที่คาด vs ผลจริง, ข้อความ error (UI/console/terminal ของ backend), tripId ที่เกิดเหตุ (ไม่ต้องขอข้อมูลส่วนตัว)
2. **เทียบกับปัญหาที่รู้อยู่แล้ว** ใน `docs/DEVELOPMENT_STATUS.md` → Known Issues ถ้าตรงกับข้อที่มีอยู่ ให้บอกผู้ใช้และอ้างหมายเลขนั้น
3. **ไล่ตาม flow จริง**
   - Frontend: component → `fetch` → endpoint (ดูตารางใน `docs/PROJECT_OVERVIEW.md` หัวข้อ 6)
   - Backend: route → middleware → controller → queries/builder → utils
   - จุดที่มักเป็นต้นเหตุในโปรเจกต์นี้:
     - router state หายหลัง refresh (`ItineraryEditor`, `auto.tsx`)
     - field ชื่อไม่ตรงกันระหว่าง camelCase/snake_case (`dayNumber` vs `day_number`)
     - หมวดของสถานที่ไม่ได้หาผ่าน `places.att_type_label` → `category_labels` → `categories` แบบเดียวกันทุก query (D-39)
     - mirror logic ระหว่าง frontend/backend ไม่ตรงกัน → ทำให้ editor ไม่เห็น conflict แต่ confirm กลับได้ 400
     - `trip_days` ค้างค่าเดิมหลังแก้ทริป (Known Issue #6)
     - ORS/Open-Meteo fallback (ดู `distanceSource`, `weatherAvailable` ใน response)
     - token หมดอายุ → 401
     - ตัวพิมพ์เล็ก-ใหญ่ของชื่อไฟล์ (build บน Linux)
     - ผลลัพธ์ถูกตัดที่ 1000 แถว
4. **ตั้งสมมติฐาน แล้วพิสูจน์ด้วยหลักฐาน** (อ่านโค้ด, ใช้ test/สคริปต์ pure function ที่ไม่แตะ DB, ใช้ log ชั่วคราว) ห้ามสรุปสาเหตุโดยไม่มีหลักฐาน ถ้ายังพิสูจน์ไม่ได้ให้บอกว่าเป็น "สมมติฐาน"
5. **ถ้าเป็นไปได้ ให้เขียน test ที่ reproduce bug ก่อน** (เหมาะกับ pure function: `poiScoreCalculator`, `buildDayItems`, `checkOpeningStatus`, `autoTripBuilder`)
6. **แก้ให้น้อยที่สุด** ตรงจุดที่เป็นสาเหตุ ถ้าเป็นไฟล์ mirror ให้แก้คู่กันตาม `itinerary-mirror-sync`
7. **ลบ log ชั่วคราว** ที่เพิ่มเข้าไป แล้วตรวจตาม `verify-changes`
8. อัปเดต Known Issues ใน DEVELOPMENT_STATUS (ย้ายไป "แก้แล้ว" หรือเพิ่มข้อใหม่)

## ข้อควรระวัง
- ห้าม log ข้อมูล session/token/ข้อมูลส่วนตัวของผู้ใช้
- ห้ามแก้ข้อมูลใน Supabase เพื่อ "ทำให้ bug หาย"
- ห้ามเรียก API นำเข้าของ admin (Google Places มีค่าใช้จ่าย) เพื่อ debug
- ถ้าเจอ bug อื่นระหว่างทาง ให้จดไว้แล้วรายงานแยก ห้ามแก้รวมในงานเดียวกัน

## หยุดแล้วถามผู้ใช้เมื่อ
- ต้องดูข้อมูลจริงใน DB หรือ log ที่ Claude เข้าถึงไม่ได้
- สาเหตุอยู่ที่ schema/RLS/ข้อมูล ไม่ใช่โค้ด
- การแก้ต้องเปลี่ยนมติใน DECISIONS.md

## รูปแบบรายงาน
```
## Bug: <อาการสั้นๆ>
สาเหตุ (หลักฐาน: ไฟล์:บรรทัด / ผลการรัน):
สถานะ: ยืนยันแล้ว | สมมติฐาน
การแก้: - path — สิ่งที่เปลี่ยน
วิธียืนยัน: <test/คำสั่ง → ผลจริง>
ยังไม่ได้ตรวจ:
ปัญหาอื่นที่พบ (ไม่ได้แก้):
```
