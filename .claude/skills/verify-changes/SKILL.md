---
name: verify-changes
description: ตรวจผลหลังแก้โค้ดใน E-tinerary (type check, lint, build, test และ manual flow) แล้วรายงานผลตามที่รันได้จริงเท่านั้น ใช้ทุกครั้งก่อนบอกว่างานเสร็จ
---

# Verify Changes

## Baseline (หลัง T1 — 2026-10-17 ใช้แยกปัญหาเดิมออกจากปัญหาใหม่)
| ตรวจ | Baseline |
|---|---|
| backend `npx tsc --noEmit` | ✅ 0 errors (ณ `0c980bd` — T1 ไม่ได้แตะ backend) |
| data-pipeline `npx tsc --noEmit` | ✅ 0 errors (ณ `0c980bd`) |
| frontend `npx tsc -b` | ✅ 0 errors (Windows) |
| frontend `npm run lint` | ❌ 29 errors, 4 warnings (หลังตั้ง `argsIgnorePattern: "^_"` 2026-10-17) |
| frontend `npm run build` | ✅ ผ่านบน Windows (มีคำเตือน chunk > 500 kB) · ยังไม่ได้ทดสอบบน Linux/CI |
| `npm test` (ทั้งสองฝั่ง) | ไม่มีไฟล์ test |

ถ้า baseline เปลี่ยนเพราะงานที่ทำเสร็จแล้ว ให้อัปเดตตารางนี้และ `docs/DEVELOPMENT_STATUS.md`

## ขั้นตอน
1. **ตรวจขอบเขตการเปลี่ยนแปลง**: `git status` และ `git diff --stat` ต้องมีเฉพาะไฟล์ที่ตั้งใจแก้ ถ้ามีไฟล์ที่ทั้งไฟล์เปลี่ยนเพราะ line ending ให้ย้อนกลับ
2. **Type check ของ package ที่แตะ** (ถ้าแตะไฟล์ mirror ให้รันทั้งสองฝั่ง):
   ```bash
   cd backend && npx tsc --noEmit
   cd frontend && npx tsc -b
   cd data-pipeline && npx tsc --noEmit
   ```
3. **Lint (frontend)**: `cd frontend && npm run lint` แล้วเทียบกับ baseline ห้ามเพิ่ม error ใหม่ในไฟล์ที่แตะ จะดูเฉพาะไฟล์ก็ได้: `npx eslint <path>`
4. **Build (frontend)** ถ้าแตะ frontend: `cd frontend && npm run build`
5. **Tests**: `npm test` ใน package ที่มี test ถ้ายังไม่มีไฟล์ test ให้รายงานตรงๆ ว่า "ไม่มี test" อย่าเขียนว่า "test ผ่าน"
6. **Runtime check** (ทำเมื่อเป็นไปได้ และผู้ใช้อนุญาตให้รัน dev server):
   - backend: `npm run dev` ต้องเห็น "เชื่อมต่อ Supabase สำเร็จ" และ "Server running on port …"
   - เรียก endpoint ที่ไม่ต้อง auth เพื่อ smoke test: `GET /api/categories`, `GET /api/place-dropdown/provinces`
   - endpoint ที่ต้อง auth: ต้องใช้ token ของผู้ใช้ ซึ่ง Claude ไม่ควรขอหรือเก็บ ให้ผู้ใช้ทดสอบผ่าน UI แทน
7. **Manual E2E checklist** (ให้ผู้ใช้ทำ แล้วรายงานผลกลับมา) — เลือกเฉพาะข้อที่เกี่ยวกับงาน:
   - [ ] Register → ยืนยันอีเมล → Login → ไปหน้า `/home`
   - [ ] สร้างทริป (กำหนดงบ + เลือก category + ปักหมุด) → ได้ trip ใหม่
   - [ ] หน้า Recommendations แสดงรายการพร้อมคะแนน มีแผนที่ และแสดงที่มาของระยะทาง (ors/haversine)
   - [ ] เลือก 3–5 ที่ → จัดเส้นทาง → editor แสดงทุกที่ในช่อง "ยังไม่จัดลงวัน"
   - [ ] ลากลงวัน → เวลา/ระยะทางอัปเดต และ conflict badge ถูกต้อง
   - [ ] ยืนยันแผน → ไปหน้า detail แล้วข้อมูลตรงกับที่เห็นใน editor
   - [ ] แก้ไขแผนจาก detail → editor โหลดแผนเดิม
   - [ ] Auto trip → แสดงผล → ยืนยัน
   - [ ] MyTrips → ลบทริป
   - [ ] Refresh หน้า editor/auto → ไม่ crash
8. **ตรวจ secrets**: `git diff` ต้องไม่มี key/token/URL ของโปรเจกต์ Supabase และไม่มีไฟล์ `.env` ถูก stage

## ปัญหาที่รู้แล้วของ environment
- `node_modules` ปัจจุบันติดตั้งบน Windows ถ้ารันใน WSL/Linux/CI ต้อง `npm ci` ใหม่ในเครื่องนั้น (ห้ามลบ node_modules ของผู้ใช้เอง ให้ถามก่อน)
- jest 30 กับ ts-jest 29 major version ไม่ตรงกัน ถ้า `npm test` ของ backend error ตอนโหลด transform ให้รายงานว่าเป็นปัญหา config (DEVELOPMENT_PLAN T15) ไม่ใช่ test fail
- ปัญหาตัวพิมพ์เล็ก-ใหญ่ของชื่อไฟล์จะไม่เห็นบน Windows (เคสเดิม `ConfirmEmail.css`, `Navbar.tsx` แก้แล้วใน T1 แต่ยังไม่ได้ยืนยันบน Linux/CI)

## ข้อควรระวัง
- ห้ามรายงานว่าผ่านถ้าไม่ได้รันในรอบนี้ และห้ามคัดลอกผลจาก baseline มาใช้แทน
- ห้ามแก้ไฟล์ test/config เพื่อให้ "ผ่าน" โดยไม่บอก
- ห้ามรัน data-pipeline scripts เป็นส่วนหนึ่งของการตรวจ

## หยุดแล้วถามผู้ใช้เมื่อ
- ต้องติดตั้ง dependency ใหม่หรือ `npm ci` ใหม่
- ต้องรัน dev server ที่เชื่อม Supabase จริง (เป็นการแตะ DB จริง)

## รูปแบบรายงาน
```
## ผลการตรวจ
| ตรวจ | คำสั่ง | ผล | เทียบ baseline |
|---|---|---|---|
| backend types | npx tsc --noEmit | ✅/❌ (n errors) | |
| frontend types | npx tsc -b | | |
| frontend lint | npm run lint | x errors / y warnings | +/-n |
| frontend build | npm run build | | |
| tests | npm test | n passed / ไม่มี test | |
| manual | ข้อที่ผู้ใช้ต้องทดสอบ: ... | รอผล | |
ไม่ได้รัน: <ข้อ + เหตุผล>
```
