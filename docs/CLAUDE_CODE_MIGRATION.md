# CLAUDE_CODE_MIGRATION — ย้ายการพัฒนา E-tinerary ไปใช้ Claude Code

> คู่มือนี้ไม่ลบไฟล์เดิม ไม่ติดตั้ง dependency ใหม่ทั้งหมด และไม่ปรับโครงสร้างโปรเจกต์ ทุกขั้นเป็นการ **เพิ่ม** ไฟล์เท่านั้น
> ⚠️ รายละเอียดเฉพาะของ Claude Code (วิธีติดตั้ง, รูปแบบ `.claude/settings.json`, frontmatter ของ skill) เขียนจากความรู้ของ Claude ณ ช่วงที่ตัดข้อมูล **ยังไม่ได้ตรวจกับเอกสารทางการในรอบนี้** (ผู้ใช้กำหนดว่าห้ามใช้ข้อมูลภายนอกโดยไม่ขออนุญาต) ควรเทียบกับ https://docs.claude.com/en/docs/claude-code/overview ก่อนใช้

## 1. สิ่งที่ต้องเตรียมก่อนเริ่ม
1. **Rotate secrets ก่อนทำอย่างอื่น** (DEVELOPMENT_PLAN T1) เพราะ `.env` เคยหลุดอยู่ใน history ของ `origin/dev`
2. Git ทำงานได้ และ `git status` สะอาด หรือรู้ว่าอะไรค้างอยู่ (ตอนนี้ที่ปรากฏคือ `Navbar.tsx` ลบ/เปลี่ยนชื่อ ซึ่งเกิดจากปัญหาตัวพิมพ์เล็ก-ใหญ่ — บน Windows อาจไม่เห็น)
3. Node.js ≥ 18 (โค้ดใช้ global `fetch`/`AbortSignal.timeout`) ตรวจด้วย `node -v` และ npm (`npm -v`) ยังไม่ทราบว่าทีมใช้เวอร์ชันใด ควรเพิ่ม `.nvmrc` หรือ `engines` ภายหลัง
4. ไฟล์ `.env` ทั้ง 3 package อยู่ในเครื่อง (ห้าม commit)
5. ติดตั้ง Claude Code ตามเอกสารทางการ (ปกติคือ `npm install -g @anthropic-ai/claude-code` แล้วรัน `claude` ใน root ของ repo — ให้ตรวจกับเอกสารอีกครั้ง)
6. ถ้ามีเอกสารที่โค้ดอ้างถึง (`PROJECT_BRIEF*.md`, `PRICE_SCORE_REDESIGN.md`, `itineraries_feature_status.md`, `DATA_PREPARATION_4.md`) ให้เตรียมไว้

## 2. โครงสร้างหลังตั้งค่าเสร็จ (เพิ่มไฟล์เท่านั้น)
```text
e-tinerary-project/
├── CLAUDE.md                         ← ใหม่
├── .claude/
│   ├── settings.json                 ← ใหม่ (permission: กันการอ่าน .env, ต้องถามก่อนรัน data-pipeline/push)
│   └── skills/
│       ├── feature-development/SKILL.md
│       ├── bug-investigation/SKILL.md
│       ├── itinerary-mirror-sync/SKILL.md
│       ├── supabase-data-access/SKILL.md
│       ├── verify-changes/SKILL.md
│       └── update-project-docs/SKILL.md
├── docs/
│   ├── PROJECT_OVERVIEW.md  ARCHITECTURE.md  DEVELOPMENT_STATUS.md
│   ├── DEVELOPMENT_PLAN.md  DECISIONS.md     CLAUDE_CODE_MIGRATION.md
│   └── legacy/                       ← (ถ้ามี) เอกสารเดิมที่โค้ดอ้างถึง
├── backend/.env.example              ← ใหม่ (ชื่อตัวแปรอย่างเดียว)
├── frontend/.env.example             ← ใหม่
├── data-pipeline/.env.example        ← ใหม่ (ไฟล์นี้จะถูก ignore เพราะ .gitignore มี data-pipeline/ ต้อง `git add -f` ถ้าต้องการ commit)
├── backend/ frontend/ data-pipeline/ (เหมือนเดิมทุกไฟล์)
```
ก่อนคัดลอก ให้ตรวจว่ายังไม่มีไฟล์/โฟลเดอร์ชื่อเดียวกันอยู่ (ณ `0c980bd` ยังไม่มี `CLAUDE.md`, `.claude/` และ `docs/`)

## 3. ติดตั้งและตรวจเครื่องมือของโปรเจกต์ (อ้างอิง dependencies จริง)
ใช้ `node_modules` ที่มีอยู่แล้วบน Windows ได้เลย **ไม่ต้องติดตั้งใหม่** ถ้ายังไม่มีหรือเสีย ให้ใช้ `npm ci` (ติดตั้งตาม lockfile เป๊ะ ไม่อัปเกรด) ทีละ package:
```bash
cd backend && npm ci
cd ../frontend && npm ci
cd ../data-pipeline && npm ci
```
จากนั้นตรวจ baseline (ผลที่คาดตาม `DEVELOPMENT_STATUS.md`):
```bash
cd backend && npx tsc --noEmit         # คาดว่า: ผ่าน
cd ../frontend && npx tsc -b           # คาดว่า: 1 error ใน auto.tsx
cd ../frontend && npm run lint         # คาดว่า: 34 errors / 4 warnings
```
ถ้าผลไม่ตรงกับที่คาด ให้จดผลไว้และอัปเดต DEVELOPMENT_STATUS ก่อนเริ่มงาน

ถ้าจะรันใน WSL/Linux ต้อง `npm ci` ใหม่ในสภาพแวดล้อมนั้น เพราะ native binary (esbuild/rollup/tailwind oxide) ของ Windows ใช้บน Linux ไม่ได้ ควร clone แยกไว้อีกชุด ไม่ควรใช้ `node_modules` ร่วมกันข้าม OS

## 4. เปิดโปรเจกต์และเริ่ม Session แรก
1. ตรวจว่าอยู่บน branch `dev` และ working tree ว่าง (ห้ามสร้าง branch ใหม่ — ดู D-21):
   ```bash
   git checkout dev
   git pull            # ถ้าทำงานหลายเครื่อง
   git status          # ต้องว่าง ถ้าไม่ว่างให้หยุดจัดการก่อน
   ```
2. แตก ZIP ที่ได้จาก Claude แล้วคัดลอก `CLAUDE.md`, `.claude/`, `docs/`, `*/.env.example` ไปที่ root ของ repo (ตำแหน่งตามหัวข้อ 2)
3. ตรวจด้วย `git status` ต้องเห็นเฉพาะไฟล์ใหม่ (และ `Navbar.tsx` ถ้าเคยค้างอยู่)
4. Commit:
   ```bash
   git add CLAUDE.md .claude docs backend/.env.example frontend/.env.example
   git commit -m "chore: add Claude Code setup (CLAUDE.md, skills, docs)"
   ```
5. รัน `claude` ที่ root ของ repo แล้วใช้ prompt แรกจากหัวข้อ 11

## 5. ให้ Claude Code ทำความเข้าใจโปรเจกต์ก่อนแก้
- session แรกให้สั่งเป็น **read-only** (ห้ามแก้ไฟล์) ให้อ่าน `CLAUDE.md` + `docs/*` แล้วเทียบกับโค้ดจริง จากนั้นรายงานจุดที่ docs ไม่ตรงกับโค้ด
- ถ้า Claude Code มีโหมดวางแผน (plan mode) ให้ใช้ในงานที่มีความเสี่ยง เพื่อให้เสนอแผนก่อนลงมือ
- ทุกงานให้ระบุ skill ที่ต้องใช้ หรือให้ Claude เลือกเองตามตารางใน `CLAUDE.md`

## 6. วิธีพัฒนา ทดสอบ และตรวจสอบผล
รอบการทำงานต่อหนึ่งงาน:
1. เลือกงาน Tn จาก `DEVELOPMENT_PLAN.md`
2. สั่ง Claude: "ทำ Tn โดยใช้ skill <x> เสนอแผนก่อนแก้"
3. อ่านแผน แล้วตอบยืนยัน/ปรับ
4. Claude แก้ แล้วรัน `verify-changes`
5. คุณทดสอบ manual ตาม checklist ใน skill `verify-changes`
6. Claude อัปเดต docs ด้วย `update-project-docs`
7. Review diff (`git diff`) แล้วสั่งให้ commit (1 งาน = 1 commit บน `dev` และ Claude ห้าม commit เองจนกว่าจะสั่ง)

## 7. Git Branch และ Commit (มติ D-21)
- ทำงานบน branch `dev` เท่านั้น ห้ามสร้าง branch ใหม่
- ห้าม checkout, merge, commit หรือ push เข้า `main` เด็ดขาด เพราะ `main` คือ production
- ยังไม่ deploy จริง รันเฉพาะ local
- ก่อนเริ่มงาน `git status` ต้องว่าง ถ้าไม่ว่าง Claude ต้องหยุดถามก่อน
- 1 งาน = 1 commit และ Claude ห้าม commit เองจนกว่าจะสั่ง เขียน message ให้บอกว่าทำอะไร (ไม่ใช้แบบเดิม เช่น "nwe", "go next")
- ห้ามใส่ zip, `node_modules`, `.env` หรือ `dist` ลงใน commit (เคยเกิดขึ้นใน `060c798`)
- ก่อน commit ให้ตรวจ `git diff --cached --stat` ทุกครั้ง
- ห้ามให้ Claude `push --force`, rebase branch ที่ push ไปแล้ว หรือแก้ history ถ้าไม่ได้สั่งชัดเจน
- ถ้างานเสียหาย: `git restore <file>` (ยังไม่ commit) หรือ `git revert <commit>` (commit แล้ว)

## 8. ทำงานต่อเมื่อเริ่ม Session ใหม่
1. `git status` / `git log --oneline -10` (ต้องอยู่บน `dev` และ `git status` ต้องว่าง ถ้าไม่ว่างให้จัดการก่อน)
2. ใช้ prompt "เริ่ม session ใหม่" (หัวข้อ 11)
3. ก่อนปิด session ทุกครั้ง: สั่ง "ใช้ skill update-project-docs บันทึกสถานะงานที่ทำวันนี้ แล้วระบุสิ่งที่ค้างอยู่" เพื่อให้ session ถัดไปเริ่มจาก docs ได้ทันที

## 9. แก้ปัญหาที่พบบ่อย
| อาการ | สาเหตุที่น่าจะเป็น | วิธีแก้ |
|---|---|---|
| backend ขึ้น "ไม่สามารถเริ่ม server ได้…" แล้ว exit | `.env` ไม่ครบ หรือ Supabase ต่อไม่ได้ | ตรวจชื่อตัวแปรกับ `.env.example` (ห้ามส่งค่าให้ Claude ดู) |
| frontend เรียก `/api` ได้ 404/HTML | backend ไม่ได้รันที่ port 5000 | ดู `vite.config.ts` proxy |
| `npm run build` fail ที่ `tsc -b` | Known Issue #4 | DEVELOPMENT_PLAN T2 |
| build ผ่านบน Windows แต่ fail บน Linux/CI | ตัวพิมพ์เล็ก-ใหญ่ของชื่อไฟล์ (Known Issues #2, #3) | T2 |
| `Cannot find module @rollup/rollup-linux-…` หรือ `@esbuild/linux-x64` | ใช้ `node_modules` ของ Windows บน Linux | `npm ci` ใหม่ใน OS นั้น |
| `npm test` ของ backend error เรื่อง ts-jest | jest 30 / ts-jest 29 ไม่ตรงกัน | T16 (ต้องอนุญาตให้เปลี่ยน dependency ก่อน) |
| ทุก request ได้ 401 หลังใช้งานไปสักพัก | access token หมดอายุ และไม่มีโค้ด refresh | logout/login ใหม่ · T12 |
| ระยะทางเป็น "haversine" ทั้งหมด | ไม่มี/ใส่ `ORS_API_KEY` ผิด หรือโควต้าหมด | ดู warning `[orsTravelMatrix]` ใน log |
| weather score = 1.0 ทุกที่ | วันเดินทางอยู่เกิน 15 วันจากวันนี้ หรือ Open-Meteo ล่ม | เป็นพฤติกรรมที่ออกแบบไว้ (D-16) |
| Editor เด้งกลับไปหน้า recommendations | refresh แล้ว router state หาย หรือกดแก้ไขจากหน้า auto | Known Issue #10 |
| Dependency conflict ตอน `npm install <pkg>` | | อย่าใช้ `--force` ให้ถามก่อน และอย่าลบ lockfile |

## 10. Checklist หลังย้ายเสร็จ
- [ ] Rotate secrets แล้ว (T1)
- [ ] `CLAUDE.md`, `.claude/skills/*/SKILL.md`, `docs/*` อยู่ใน repo และ commit แล้ว
- [ ] `.env.example` ครบ 3 package และไม่มีค่าจริงอยู่ข้างใน
- [ ] `git status` ไม่มี `.env` ถูก track (`git ls-files | grep .env` ต้องได้แค่ `.env.example`)
- [ ] Claude Code เห็น skills ทั้ง 6 ตัว (ลองถาม "มี skill อะไรในโปรเจกต์นี้บ้าง")
- [ ] Session แรกแบบ read-only เสร็จ และอัปเดตจุดที่ docs ไม่ตรงกับโค้ดแล้ว
- [ ] รัน baseline checks แล้ว และผลตรงกับ DEVELOPMENT_STATUS (หรืออัปเดตแล้ว)
- [ ] backend + frontend dev server รันได้ และ login ได้
- [ ] ตอบคำถามค้างใน DEVELOPMENT_PLAN (T5, T6, T7) แล้วบันทึกลง DECISIONS
- [ ] นำเอกสารเดิมที่โค้ดอ้างถึงใส่ `docs/legacy/` แล้ว (ถ้ามี)

## 11. Prompts สำเร็จรูป

**Session แรก (read-only):**
```
อ่าน CLAUDE.md และไฟล์ทั้งหมดใน docs/ จากนั้นตรวจกับ source code จริงแบบ read-only (ห้ามแก้ไฟล์ใดๆ)
1) รัน baseline checks ตาม skill verify-changes แล้วเทียบกับ DEVELOPMENT_STATUS.md
2) ตรวจ Known Issues #2–#12 ว่ายังอยู่ในโค้ดจริงหรือไม่ พร้อมระบุไฟล์:บรรทัด
3) รายงานจุดที่ docs ไม่ตรงกับโค้ด และสิ่งที่ docs ยังไม่ได้พูดถึง
4) เสนอว่าควรเริ่มทำงานไหนจาก DEVELOPMENT_PLAN.md ก่อน พร้อมเหตุผล
ห้ามเปิดอ่านไฟล์ .env และห้ามรัน data-pipeline scripts
```

**เริ่ม session ใหม่:**
```
อ่าน CLAUDE.md, docs/DEVELOPMENT_STATUS.md และ docs/DEVELOPMENT_PLAN.md แล้วดู git status กับ git log -10 (ถ้า git status ไม่ว่างให้หยุดถามฉัน)
สรุปให้ว่างานล่าสุดค้างอยู่ตรงไหน แล้วเสนองานถัดไป ยังไม่ต้องแก้โค้ดจนกว่าฉันจะยืนยัน
```

**ทำงานตามแผน:**
```
ทำ T2 จาก docs/DEVELOPMENT_PLAN.md บน branch dev ด้วย skill feature-development และ verify-changes (ห้าม commit จนกว่าฉันจะสั่ง)
เสนอแผนและรายการไฟล์ที่จะแก้ก่อน แล้วรอฉันยืนยัน
```

**ปิด session:**
```
ใช้ skill update-project-docs บันทึกสิ่งที่ทำใน session นี้ลง docs แล้วสรุปสิ่งที่ค้างและคำถามที่ต้องให้ฉันตอบ
```
