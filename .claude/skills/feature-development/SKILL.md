---
name: feature-development
description: วางแผนและพัฒนาฟีเจอร์ใหม่หรือแก้ฟีเจอร์เดิมใน E-tinerary ที่แตะ Express route/controller, หน้า React หรือทั้งสองฝั่ง ใช้เมื่อผู้ใช้ขอเพิ่ม/เปลี่ยนพฤติกรรมของระบบ (ไม่ใช่การแก้ bug ที่รู้สาเหตุแล้ว)
---

# Feature Development (E-tinerary)

## ขอบเขต
ใช้กับฟีเจอร์ใน `backend/src/features/*` และ `frontend/src/features/*` รวมถึงฝั่ง admin (`backend/src/admin/*`, `frontend/src/admin/*` — D-24) ถ้าฟีเจอร์แตะ logic ของ itinerary ให้ใช้ `itinerary-mirror-sync` ร่วมด้วย ถ้าแตะ query ให้ใช้ `supabase-data-access` ร่วมด้วย

## ขั้นตอน
1. **ทำความเข้าใจคำขอ** — เขียน requirement สั้นๆ แล้วเทียบกับ `docs/DECISIONS.md` และ `docs/DEVELOPMENT_PLAN.md` ถ้าคำขอขัดกับมติหรือกำกวม ให้หยุดแล้วถาม
2. **สำรวจโค้ดจริง** (ห้ามข้าม)
   - หา route ใน `backend/src/server.ts` → `features/<x>/<x>Routes.ts` → controller → queries/builder
   - หาหน้า UI ใน `frontend/src/App.tsx` → component → ดูว่า fetch ไป endpoint ไหน และส่ง `location.state` อะไรต่อ (editor/auto/detail ส่งข้อมูลกันผ่าน router state)
   - `grep` หา caller ทั้งหมดของฟังก์ชันหรือ field ที่จะเปลี่ยน รวมถึง response shape ที่ frontend อ่านอยู่ (เช่น `tripDays`, `items`, `travelMatrix`)
3. **เสนอแผนก่อนลงมือ** (ต้องทำถ้าแตะเกิน 2 ไฟล์ หรือเปลี่ยน API contract/DB): ไฟล์ที่จะแก้, contract ใหม่ของ request/response, ผลกระทบต่อหน้าเดิม, วิธีตรวจ แล้วรอผู้ใช้ยืนยัน
4. **Backend**
   - วาง route ใหม่ไว้ใน router ของ feature ที่มีอยู่แล้ว ถ้าต้องสร้าง feature ใหม่ให้ mount ใน `server.ts` (ห้ามใส่ใน `app.ts` เพราะไม่ถูกใช้)
   - ใส่ `requireAuth` และตรวจความเป็นเจ้าของทริปทุกครั้ง (copy pattern จาก `buildDraft`)
   - validate input ตาม pattern ของ `tripController.createTrip` แล้วคืน `{ message }` ภาษาไทยพร้อม status ที่เหมาะสม (400/401/403/404/409/500)
   - ห้ามเชื่อค่าที่คำนวณจาก client (ระยะทาง เวลา ราคา) ให้คำนวณซ้ำฝั่ง server
5. **Frontend**
   - ใช้ `useAuth()` → `session.access_token` · fetch `/api/...`
   - ถ้าหน้าต้องใช้ router state ต้องรองรับกรณีที่ refresh แล้ว state หายด้วย (ดูตัวอย่างที่ `ItineraryEditor.tsx` ~บรรทัด 571)
   - route ใหม่ที่ต้อง login ให้ครอบด้วย `ProtectedRoute` ใน `App.tsx`
   - ชื่อไฟล์และ import ต้องตรงกันทุกตัวอักษร และห้ามเพิ่ม `any`
6. **ตรวจผล** → ทำตาม skill `verify-changes`
7. **อัปเดต docs** → ทำตาม skill `update-project-docs`

## ข้อควรระวัง
- ห้ามเพิ่ม dependency ถ้าไม่ได้รับอนุญาต
- ห้ามแก้ data-pipeline หรือรัน upload script เพื่อ "เตรียมข้อมูล" (งาน admin ให้ copy โค้ดมาปรับใน `backend/src/admin/pipeline/` ตาม D-24)
- route ของ admin ต้องผ่าน `requireAuth` + `requireAdmin` (อ่าน role จาก DB) และหน้า admin ต้องครอบด้วย `AdminRoute`
- `daily_budget` คืองบรวมทั้งกลุ่มต่อวัน ซึ่ง frontend เป็นคนคำนวณ (D-01) ห้ามคำนวณซ้ำฝั่ง backend
- ฟีเจอร์ที่ต้องใช้คอลัมน์หรือตารางใหม่: ต้องให้ผู้ใช้สร้างใน Supabase เอง Claude เขียน SQL ให้ได้ แต่ห้ามรันเอง

## หยุดแล้วถามผู้ใช้เมื่อ
- ต้องการ schema ใหม่ หรือไม่รู้ schema/RLS
- งานขัดกับ `docs/DECISIONS.md`
- ต้องเปลี่ยน response shape ที่มีหน้าอื่นใช้อยู่
- ต้องใช้ API key/บริการภายนอกเพิ่ม

## รูปแบบรายงาน
```
## สรุปงาน: <ชื่อฟีเจอร์>
ไฟล์ที่เปลี่ยน: - path — สิ่งที่เปลี่ยน
API contract: <ใหม่/เปลี่ยน/ไม่เปลี่ยน>
ผลการตรวจ: <คำสั่ง → ผลจริง> (อ้างอิง verify-changes)
ยังไม่ได้ตรวจ: <ข้อ + เหตุผล>
ผลกระทบ/ความเสี่ยง:
docs ที่อัปเดต:
ปัญหาอื่นที่พบ (ไม่ได้แก้):
```
