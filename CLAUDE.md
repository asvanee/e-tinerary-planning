# CLAUDE.md — E-tinerary Planning

คู่มือการทำงานของ Claude Code ใน repo นี้ อ่านทุกครั้งก่อนเริ่มงาน รายละเอียดเชิงลึกแยกไว้ใน `docs/` และ `.claude/skills/`

## โปรเจกต์คืออะไร
เว็บวางแผนทริปท่องเที่ยวในไทย (UI และข้อความภาษาไทย): สร้างทริป → ระบบให้คะแนนสถานที่ (POI score) → ผู้ใช้ลากจัดลงวัน (หรือใช้ Auto Trip) → backend ตรวจซ้ำแล้วบันทึก
แยกเป็น 2 package อิสระ ไม่มี workspace รวม ต้อง `cd` เข้าไปในแต่ละ package ก่อนรันคำสั่ง

| Package | Stack | Entry |
|---|---|---|
| `backend/` | Express 5 + TS (CommonJS), Supabase (service role) | `src/server.ts` |
| `frontend/` | React 19 + Vite 7 + TS + Tailwind 4, Leaflet, dnd-kit | `src/main.tsx`, routes อยู่ใน `src/App.tsx` |

ภาพรวมระบบ: `docs/ARCHITECTURE.md` · สถานะ: `docs/DEVELOPMENT_STATUS.md` · แผน: `docs/DEVELOPMENT_PLAN.md` · มติที่ตัดสินแล้ว: `docs/DECISIONS.md` · โครงสร้าง DB: `docs/DATABASE_SCHEMA.md`
**แผนงานหลักของทีมคือ `README.md`** (requirement R1–R5) ส่วน `docs/DEVELOPMENT_PLAN.md` ใช้ติดตามรายละเอียดทางเทคนิค (กลุ่ม 0 โยง R กับโค้ด) ห้ามแก้ README.md ถ้าไม่ได้รับคำสั่ง

## คำสั่งที่มีอยู่จริง
```bash
# backend
cd backend && npm run dev          # ts-node-dev src/server.ts (ต้องมี .env และ Supabase ต้องเชื่อมต่อได้ ไม่งั้น exit 1)
cd backend && npx tsc --noEmit     # type check (ไม่มี script build/lint)
cd backend && npm test             # jest — test ของ admin pipeline (dedupe อ่าน backend/data/attraction.csv), trip และ Auto Trip

# frontend  (dev proxy /api → http://localhost:5000)
cd frontend && npm run dev
cd frontend && npm run build       # tsc -b && vite build
cd frontend && npm run lint
cd frontend && npm test            # vitest run — ยังไม่มีไฟล์ test
```
การนำเข้าสถานที่ทำผ่านหน้า admin (`backend/src/admin/`) — `data-pipeline/` เดิมลบแล้วใน R5 P6 (D-37, กู้ได้จาก git history ที่ `d73808f`)

Baseline หลัง T1 (2026-10-17): backend tsc ✅ · frontend `tsc -b` ✅ · `npm run build` ✅ (Windows — ไม่ทดสอบ Linux/CI ตาม D-22) · eslint ❌ 5 errors / 4 warnings (หลัง cleanup 2026-10-21) · backend jest ✅ 11 suites / 154 tests (2026-10-25 หลัง merge Auto Trip ของกิ่ง) ห้ามรายงานว่า "ผ่าน" ถ้าไม่ได้รันจริงในรอบนั้น และห้ามโทษว่า error เดิมเกิดจากงานของเรา

## กฎการทำงาน (ต้องทำทุกครั้ง)
1. **อ่านโค้ดจริงก่อนแก้** อย่าเชื่อ docs หรือ comment อย่างเดียว เพราะ comment ในโค้ดมักบอกว่า "แก้แล้ว" ทั้งที่อาจไม่ตรงกับโค้ด ให้ตรวจที่โค้ด
2. **แก้เท่าที่งานต้องการ** ห้าม reformat, normalize line ending (repo มีทั้ง CRLF และ LF), rename หรือ refactor ไฟล์ที่ไม่เกี่ยวกับงาน และห้ามลบ comment "✅ มติ…" ถ้าไม่ได้รับอนุญาต
3. **ห้ามสมมติว่าฟีเจอร์/API/ตารางทำงานตามที่คาด** โครงสร้าง DB ดูที่ `docs/DATABASE_SCHEMA.md` (snapshot 2026-10-18 — ไม่ใช่ migration) ถ้าไม่มีข้อมูลหรือไม่แน่ใจว่ายังตรงกับของจริงให้ถามผู้ใช้
4. **ก่อนทำงานที่มีความเสี่ยง** (เปลี่ยน logic คะแนน/งบ/เวลา, query ที่ลบหรือเขียนข้อมูล, auth, ไฟล์ mirror, dependency, git history) ให้สรุปแนวทาง ไฟล์ที่กระทบ และผลกระทบ แล้วรอผู้ใช้ยืนยันก่อน
5. **หลังแก้** ต้องรายงาน: ไฟล์ที่เปลี่ยน · เปลี่ยนอะไรและเพราะอะไร · คำสั่งตรวจที่รันจริงพร้อมผลลัพธ์ · สิ่งที่ยังไม่ได้ตรวจ ถ้ารันไม่ได้ให้บอกเหตุผล และห้ามอ้างว่าผ่าน
6. **เจอปัญหาที่ไม่เกี่ยวกับงาน** ให้รายงานแยก (หรือเสนอเพิ่มใน DEVELOPMENT_STATUS) ห้ามแก้เอง
7. **ข้อมูลไม่พอหรือข้อกำหนดขัดกัน** (เช่น docs กับโค้ดไม่ตรงกัน หรือ DECISIONS กับคำสั่งผู้ใช้ไม่ตรงกัน) ให้หยุดแล้วถามเป็นชุดเดียว พร้อมบอกว่าแต่ละทางเลือกจะทำอะไรบ้าง
8. **ห้ามลบหรือเขียนทับข้อมูลสำคัญ** (ไฟล์, ตาราง, `.env`, branch, history) ถ้าไม่ได้รับอนุญาต ห้าม `git push --force`, `git filter-repo` หรือ `git reset --hard` เอง
9. ใช้ docs/สถานะเป็นข้อมูลประกอบเท่านั้น ต้องตรวจโค้ดจริงก่อนตัดสินใจเสมอ

## Secrets และ Environment
- `.env` อยู่ใน `backend/`, `frontend/` **ห้ามเปิดอ่าน แสดง copy หรือ log ค่าเหล่านี้** ถ้าต้องรู้ว่ามีตัวแปรอะไร ให้ดูจาก `.env.example` หรือ grep `process.env` / `import.meta.env` ในโค้ด
- ห้ามใส่ key/token ลงในโค้ด docs ตัวอย่างคำสั่ง หรือ commit message
- ตัวแปร `VITE_*` ถูกฝังลงใน bundle ฝั่ง browser ห้ามใส่ secret ที่เป็นของ server ลงใน `VITE_*` เด็ดขาด
- Backend ใช้ `SUPABASE_SERVICE_ROLE_KEY` ซึ่ง **ข้าม RLS** query ทุกตัวที่แตะข้อมูลของผู้ใช้จึงต้องกรองด้วย `user_id` เอง (ดู skill `supabase-data-access`)
- เพิ่ม env ใหม่ต้องอัปเดต `.env.example` และตารางในหัวข้อ 9 ของ `docs/PROJECT_OVERVIEW.md`
- ห้าม commit `.env` หรือไฟล์ zip/archive ที่มี `.env` อยู่ข้างใน

## Security checklist สำหรับ endpoint
- ทุก route ที่ใช้ข้อมูลทริปต้องมี `requireAuth` **และ** ตรวจความเป็นเจ้าของ (`getTripOwnerAndStart(tripId).userId === req.user.id` หรือ `.eq("user_id", userId)`)
- ตรวจ `tripId` ด้วย `!tripId || Array.isArray(tripId)` ตาม pattern เดิม
- อย่าเชื่อระยะทาง/เวลา/ราคาที่ frontend ส่งมา ให้ backend คำนวณซ้ำเอง (ทำแบบเดียวกับ `confirmItinerary`)
- Endpoint ของ admin (R5) ต้องอ่าน `role` จากตาราง `users` ฝั่ง backend ทุก request ห้ามเชื่อ `user.role` ที่ frontend เก็บใน `localStorage` (Known Issue #22)
- ห้ามเรียก `supabase.auth.signUp`/`signInWithPassword` บน client service role ที่แชร์กับ query (`config/db.ts`) ให้ใช้ `createAuthClient()` แทน — ดู Known Issue #21 / T22
- โค้ดใหม่ไม่ควรส่ง `err.message` ของ Supabase กลับให้ client ตรงๆ ให้ตอบข้อความภาษาไทยทั่วไปแล้ว `console.error` รายละเอียด (Known Issue #24)

## Conventions
- Backend: `src/features/<feature>/<feature>Routes.ts` + `<feature>Controller.ts` (+ `*PlaceQueries.ts`, `*Builder.ts`), ใส่ shared helper ใน `src/utils/`, mount route ใน `src/server.ts` · คืน `res.status(x).json({ message: "<ภาษาไทย>" })` · ใน controller ให้ใช้ `try/catch` แล้ว `console.error` พร้อมชื่อ context
- Admin (D-24): backend `src/admin/` (mount `/api/admin`, ทุก route ผ่าน `requireAuth` + `requireAdmin`) · frontend `src/admin/<page>/` (ครอบด้วย `AdminRoute` + `AdminLayout`) · ของที่ user และ admin ใช้ร่วมกันอยู่ใน `frontend/src/system/` (เช่น `system/auth/`)
- Frontend: `src/features/<area>/<page>/<Page>.tsx` · Tailwind + CSS variables (`--navy`, `--sky`, …) · fetch ใช้ path `/api/...` และส่ง `Authorization: Bearer ${session.access_token}` · ไอคอนใช้ `lucide-react`
- **ชื่อไฟล์และ import ต้องตรงกันทุกตัวอักษร (case-sensitive)** แม้ Windows จะไม่ฟ้อง เพราะ CI/Linux จะ fail
- TypeScript strict ห้ามใช้ `any` (ตอนนี้เป็น 0 ทั้ง backend/frontend) ให้ใช้ type ที่ชัดเจนแทน
- Comment และข้อความ UI เป็นภาษาไทยตามสไตล์เดิม

## จุดที่ต้องระวังเป็นพิเศษ
- **Mirror logic**: `backend/src/features/itinerary/itineraryBuilder.ts` ↔ `frontend/src/features/trip/e-tinerary/lib/itineraryBuilder.ts` และ `backend/src/utils/openingHoursChecker.ts` ↔ `frontend/.../lib/openingHoursChecker.ts` (รวมถึง `haversine.ts`) ต้องแก้คู่กันเสมอ → ใช้ skill `itinerary-mirror-sync`
- **Primary key ทุกตารางเป็น uuid คอลัมน์เดียว** (D-28) — ตารางใหม่ใช้ `gen_random_uuid()` ห้าม int/composite key · id ใน TS เป็น `string` · หา "ล่าสุด" ด้วยคอลัมน์เวลา ไม่ใช่ลำดับ id
- **หมวดของสถานที่มาจากป้าย ททท.** (D-35/D-39): `places.att_type_label` → `category_labels` → `categories` (embed `category_labels!inner(categories!inner(...))`) 1 สถานที่ = 1 หมวด ใช้เกณฑ์นี้ทุก query · ตาราง `place_categories` / `type_category_weights` / `place_types` และคอลัมน์ `categories.default_duration_min` ลบแล้ว (P5g) · `bestCategoryRow.ts` ไม่มีโค้ด import แล้วหลังกิ่งแก้ Auto Trip (2026-10-23 `55634a7`) รอลบ — ห้ามใช้ในโค้ดใหม่
- **ลำดับ filter ของ POI** (province → budget → category) ห้ามสลับ — ขั้นหมวดต้องนับหลังงบ: ตรงหมวด ≥ 50 เหลือเฉพาะที่ตรง, < 50 เติมหมวดอื่นด้วย `category_score` 0 (D-48) · ขั้นเวลาตัดออกแล้ว (D-38)
- `confirmItinerary` ต้องเช็ค conflict ก่อนลบแผนเดิม
- `docs/DECISIONS.md` คือมติที่ตกลงแล้ว ถ้างานขัดกับมติให้ถามก่อน
- **การนำเข้าใน admin เรียก Google Places ที่มีค่าใช้จ่าย** (`POST /api/admin/provinces/:province/import`, ยอมรับผล Google) — Claude ห้ามเรียกเอง ให้ผู้ใช้กดผ่านหน้าเว็บ · test ต้องใช้ Google ปลอมเสมอ

## Skills ในโปรเจกต์ (`.claude/skills/`)
| Skill | ใช้เมื่อ |
|---|---|
| `clean-code` | ทุกครั้งที่เขียน/แก้โค้ด — ง่ายที่สุด สะอาด ไม่ซ้ำ ทำงานครบ และพิสูจน์ว่าพฤติกรรมไม่เปลี่ยนเมื่อ refactor |
| `feature-development` | เพิ่ม/แก้ฟีเจอร์ที่แตะ route, controller หรือหน้า UI |
| `bug-investigation` | มี bug, error หรือพฤติกรรมผิดปกติ |
| `itinerary-mirror-sync` | แก้ logic เวลา/ระยะทาง/ราคา/เวลาเปิด-ปิด/conflict ของ itinerary |
| `supabase-data-access` | เพิ่มหรือแก้ query Supabase, ตาราง หรือ ownership |
| `verify-changes` | หลังแก้โค้ดทุกครั้ง ก่อนรายงานว่าเสร็จ |
| `update-project-docs` | งานสำคัญเสร็จ หรือเปลี่ยนสถานะ/มติ/env |

## Git และ Branch (มติ D-21)
- ทำงานบน branch `dev` เท่านั้น ห้ามสร้าง branch ใหม่
- ห้าม checkout, merge, commit หรือ push เข้า `main` เด็ดขาด (`main` = production)
- ยังไม่ deploy จริง รันเฉพาะ local
- ก่อนเริ่มงาน `git status` ต้องว่าง ถ้าไม่ว่างให้หยุดถามผู้ใช้
- 1 งาน = 1 commit และห้าม commit เองจนกว่าผู้ใช้จะสั่ง
- ห้าม push ทุก branch จนกว่าผู้ใช้จะสั่งชัดเจน
- ย้อนกลับด้วย `git restore <file>` (ยังไม่ commit) หรือ `git revert <commit>` (commit แล้ว)

## เริ่ม Session ใหม่
1. อ่าน `docs/DEVELOPMENT_STATUS.md` และงานที่กำลังทำใน `docs/DEVELOPMENT_PLAN.md`
2. `git status` และ `git log --oneline -10` เพื่อดูว่างานค้างอยู่ตรงไหน ต้องอยู่บน `dev` และ `git status` ต้องว่าง ถ้าไม่ว่างให้หยุดถามผู้ใช้
3. ยืนยันกับผู้ใช้ว่าจะทำงานไหน แล้วทำบน branch `dev` (ห้ามสร้าง branch ใหม่)
