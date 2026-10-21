---
name: clean-code
description: แนวทางเขียนโค้ดใน E-tinerary ให้ง่ายที่สุด สะอาด อ่านง่าย และทำงานได้ครบ ใช้ทุกครั้งที่เขียนหรือแก้โค้ด (backend/frontend/admin) รวมถึงตอน refactor หรือ cleanup ร่วมกับ feature-development / bug-investigation
---

# Clean Code (E-tinerary)

เป้าหมาย: โค้ดที่ **ทำงานถูกต้องครบ** ก่อน แล้วจึง **ง่ายที่สุด** ที่ยังทำงานนั้นได้ — คนในทีมอ่านแล้วเข้าใจทันทีโดยไม่ต้องเดา

## หลักการ
1. **ทำงานได้ก่อนสวย** — ห้ามแลกความถูกต้องกับความสั้น ทุกการ "ทำให้สะอาด" ต้องพิสูจน์ได้ว่าพฤติกรรมเหมือนเดิม (ดูหัวข้อ "พิสูจน์ว่าทำงานเหมือนเดิม")
2. **ง่ายที่สุดที่ใช้ได้** — แก้ตรงจุด ไม่สร้าง abstraction/option/config เผื่ออนาคต ไม่สร้าง helper ที่มีคนเรียกจุดเดียว (ยกเว้นทำให้ฟังก์ชันหลักอ่านง่ายขึ้นชัดเจน)
3. **ไม่ซ้ำ** — logic เดียวกันที่อยู่ ≥ 2 ที่ ให้รวมไว้ที่เดียว แต่รวมเฉพาะเมื่อ "เหมือนกันจริงทุกกรณี" (เทียบ diff ก่อน) ถ้าต่างกันเล็กน้อย (เช่น class ปุ่มคนละขนาด, `formatVisitDate` long/short) ให้ใช้พารามิเตอร์หรือปล่อยแยก
4. **ไม่มีโค้ดตาย** — ลบ export/ฟังก์ชัน/parameter/state/import ที่ไม่มีใครใช้ (grep ทั้ง repo ก่อนลบ) · ห้ามคอมเมนต์โค้ดทิ้งไว้ · ห้าม `console.log` debug (ใช้ `console.error("<context> error:", err)` เฉพาะ error)
   - ยกเว้นสิ่งที่มีมติให้เก็บ เช่น `buildNearestNeighborOrder` (D-04) — เช็ค `docs/DECISIONS.md` ก่อนลบเสมอ
5. **อ่านเหมือนโค้ดรอบข้าง** — ตั้งชื่อ, การจัดบรรทัด, ความถี่ของ comment และ pattern ให้เหมือนไฟล์ข้างเคียง

## Type (TypeScript strict)
- ห้าม `any` (ตอนนี้ repo เป็น 0) — ผล query Supabase ให้ประกาศ interface ของแถวแล้ว `as unknown as Row[]`
- `catch (err)` ไม่ใส่ type — อ่านข้อความด้วย `(err as { message?: string } | null)?.message` (คงพฤติกรรมเดิมที่รับ object ที่มี `message`)
- type ที่ใช้ร่วมกันระหว่าง backend/frontend (คนละ package) ให้มีสำเนาพร้อม comment ระบุไฟล์คู่ เช่น `admin/lib/reviewTypes.ts` ↔ `backend/src/admin/pipeline/review/reviewTypes.ts`, `MERGE_FIELDS` ↔ `IMPORT_FIELDS`

## Comment
- ภาษาไทย อธิบาย **ทำไม** หรือกติกาที่ไม่เห็นจากโค้ด (เช่น "ต้องเช็คก่อนลบแผนเดิม ไม่งั้นแผนเก่าหาย") ไม่อธิบายสิ่งที่โค้ดบอกอยู่แล้ว
- เขียนตามสิ่งที่โค้ด **ทำตอนนี้** — ห้ามเขียนประวัติ ("เดิม…", "✅ แก้บั๊ก", "✅ เพิ่มใหม่", "← เพิ่ม") ประวัติอยู่ใน git และ docs
- อ้างมติด้วยรหัส (`D-26`, `Known Issue #6`) แทนการเล่าซ้ำ · ห้ามอ้างไฟล์ที่ไม่มีใน repo
- จุดที่รู้ว่ามี bug แต่ยังไม่แก้ ให้ใส่ `⚠️ … (Known Issue #n)` สั้นๆ

## Pattern ของโปรเจกต์ (ใช้ของที่มีอยู่ก่อนเขียนใหม่)
| ต้องการ | ใช้ |
|---|---|
| เลือก category ที่ confidence สูงสุด | `backend/src/utils/bestCategoryRow.ts::pickBestCategoryRows` |
| query ที่อาจเกิน 1000 แถว | `selectAll` ใน `admin/provinces/decisionQueries.ts` + `.range()` |
| ระยะทางเส้นตรง | `utils/haversine.ts` (mirror ฝั่ง frontend) |
| format เวลา/ราคา/ระยะในหน้าทริป | `frontend/src/features/trip/lib/format.ts` |
| ช่วงเวลาเปิด-ปิดเพื่อแสดงผล | `frontend/src/features/trip/lib/openingDays.ts` |
| เรียก API ของ admin | `admin/lib/adminApi.ts::adminRequest` + `errorMessage` |
| ตรวจเจ้าของทริป | `loadOwnedTrip` (itinerary) / `.eq("user_id", userId)` (trip) |

- Controller: validate input → `try { … } catch (err) { console.error("<ชื่อ> error:", err); res.status(500).json({ message: "<ไทย>" }) }`
- ส่วนที่แตะ DB/บริการภายนอกให้รับเข้ามาเป็น parameter (เช่น `GooglePlacesClient`, `ImportStore`, `fetchFn`) เพื่อให้ logic หลักเป็น pure function และเขียน test ได้โดยไม่เรียกของจริง

## ไฟล์และ line ending
- ไฟล์บนดิสก์เป็น CRLF (`core.autocrlf=true`, git เก็บ LF) — ห้าม `sed -i` ใน Git Bash (ตัด CR ทิ้ง) ให้แก้ด้วย Edit tool หรือ node script ที่คง line ending เดิม
- ตรวจ line ending ด้วย node (`(s.match(/\r\n/g)||[]).length`) ไม่ใช่ `grep $'\r'` (ให้ผลผิดบน Git Bash)
- ไฟล์ใหม่ให้เป็น CRLF เหมือนไฟล์อื่นบนดิสก์
- ห้าม reformat ไฟล์ที่ไม่เกี่ยวกับงาน ถ้าจำเป็นต้องจัดรูปแบบทั้งไฟล์ให้แยก commit (`style:`) และพิสูจน์ด้วย compile output

## พิสูจน์ว่าทำงานเหมือนเดิม (refactor/cleanup)
- **Frontend จัดรูปแบบล้วน**: compile ไฟล์เก่า (`git show HEAD:<path>`) กับใหม่ด้วย `npx esbuild <file> --jsx=automatic --minify-whitespace --minify-syntax --charset=utf8` แล้ว `cmp` — ต้องเหมือนกันทุก byte
- **Pure function**: test เทียบผลเก่า/ใหม่ด้วย input สุ่มจำนวนมาก (เก็บไฟล์เก่าไว้ใน scratchpad ไม่ commit)
- **Controller/query**: mock `config/db` ด้วย Proxy ที่บันทึกการเรียก แล้วเทียบ status + JSON + ลำดับการเรียก Supabase ของโค้ดเก่า/ใหม่
- **Mirror**: diff สองฝั่งต้องต่างกันแค่ header/import/ค่าคงที่ที่ frontend ประกาศเอง (ดู `itinerary-mirror-sync`)

## Checklist ก่อนรายงานว่าเสร็จ
- [ ] ทำงานครบตามที่ขอ รวมกรณี error/ว่าง/โหลด (UI มีสถานะ loading, error พร้อมปุ่มลองใหม่, ว่าง)
- [ ] ไม่มี `any`, `console.log`, โค้ดที่คอมเมนต์ทิ้ง, import/ตัวแปรที่ไม่ใช้ (`npx tsc --noEmit --noUnusedLocals --noUnusedParameters`)
- [ ] ไม่มี logic ซ้ำกับที่มีอยู่แล้ว (grep ชื่อฟังก์ชัน/สูตรที่คล้ายกัน)
- [ ] comment ตรงกับโค้ด ไม่มีประวัติการแก้
- [ ] line ending ไม่เปลี่ยน (`git diff --stat` ไม่มีไฟล์ที่เปลี่ยนทั้งไฟล์โดยไม่ตั้งใจ)
- [ ] มี test สำหรับ logic ใหม่ (backend jest) และรันผ่าน · ไม่เรียก Google/Supabase จริงใน test
- [ ] ผ่าน `verify-changes` และ lint ไม่แย่กว่า baseline

## หยุดแล้วถามผู้ใช้เมื่อ
- การทำให้ง่ายขึ้นต้องเปลี่ยนพฤติกรรม (ข้อความที่ผู้ใช้เห็น, response shape, ลำดับ filter, สูตรคะแนน)
- โค้ดที่จะลบมีมติให้เก็บไว้ หรืออยู่ในส่วนที่มีคนอื่นรับผิดชอบ (สูตร POI รอ research, Auto Trip ของเพื่อน)
- ต้องเพิ่ม dependency
