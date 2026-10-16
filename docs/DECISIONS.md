# DECISIONS — ข้อสรุปทางเทคนิคที่ตัดสินใจแล้ว

> รวบรวมจาก comment "✅ มติ…" ในโค้ด (เอกสารต้นทาง เช่น `PRICE_SCORE_REDESIGN.md`, `itineraries_feature_status.md` ไม่มีใน ZIP) ห้ามเปลี่ยนโดยไม่ถามเจ้าของโปรเจกต์ ถ้าเปลี่ยนต้องเพิ่ม entry ใหม่ไว้ด้านล่าง (ห้ามลบของเดิม)
> รูปแบบ: **D-xx** · ข้อสรุป · เหตุผล · ที่อยู่ในโค้ด

| ID | ข้อสรุป | เหตุผล (ตาม comment) | ที่อยู่ |
|---|---|---|---|
| D-01 | Business logic ของงบคำนวณที่ **frontend จุดเดียว** (`daily_budget` เป็นค่าสำเร็จรูป) backend ห้ามหารจำนวนคนซ้ำ | กันการคำนวณซ้ำซ้อน/ไม่ตรงกัน | `poiPlaceQueries.ts` ขั้น 3, `itineraryPlaceQueries.ts` |
| D-02 | Backend `itineraryBuilder.ts` คือ **source of truth** ส่วน frontend เก็บ copy แบบ mirror ไว้ recompute ทันที และ backend ต้อง re-validate ซ้ำก่อน save เสมอ | ลากวางแล้วเห็นผลทันทีโดยไม่ต้องรอ network | หัวไฟล์ `backend/.../itineraryBuilder.ts` |
| D-03 | Itinerary editor เป็นแบบ **manual drag เท่านั้น** draft แรกไม่จัดลงวันให้ (`buildInitialDraft` คืน `[]`) และไม่มีปุ่ม "จัดลำดับอัตโนมัติ" ในหน้านี้ | final design | `itineraryBuilder.ts` |
| D-04 | เก็บ `buildNearestNeighborOrder` ไว้ แม้ตอนนี้ไม่มีที่เรียกใช้ | อาจนำไปใช้กับ Auto Trip | `itineraryBuilder.ts` |
| D-05 | ราคา v2: **ไม่เดาราคา** เมื่อไม่มี `price_level` จริง ยกเว้น category `free` (ให้ประมาณเป็น 0) ถ้าเป็น paid ที่ไม่มีราคา ให้ `placeCost=null`, ปล่อยผ่าน hard filter, ไม่นับเข้ายอดสะสม และให้ price weight = 0 | การเดาราคาซ่อนความไม่รู้ไว้และลงโทษผิด | `poiScoreCalculator.ts`, `poiPlaceQueries.ts`, `itineraryBuilder.ts` |
| D-06 | `price_nature` เหลือแค่ `free` / `paid` (ยุบ food + paid_other) และ DB migrate แล้ว | logic ของสองหมวดเหมือนกันทุกกรณี | `poiPlaceQueries.ts` |
| D-07 | เลิกใช้ `categories.default_price_level` ("column กำลังจะ drop") | ดู D-05 | หลายไฟล์ |
| D-08 | Multi-category: เลือกแถว `confidence_score` สูงสุดต่อ place (MAX) ห้าม sum/average และต้องใช้เกณฑ์เดียวกันในทุก query | ค่าที่เห็นตอน POI list และตอน confirm ต้องตรงกัน | `poiPlaceQueries`, `itineraryPlaceQueries`, `placesController` |
| D-09 | ไม่รองรับทริปที่ข้ามเที่ยงคืน: validate ตอนสร้าง/แก้ทริป (`start_time + available_time_per_day ≤ 24:00`) | Postgres `time` ไม่รู้ว่าเวลาข้ามวัน | `tripController.validateNoMidnightCrossing` |
| D-10 | ถ้าไม่มีข้อมูลเวลาเปิด-ปิด ให้ **flag `is_hours_unknown`** ไม่ถือว่าปิด (ไม่ block) | 21% ของสถานที่ไม่มีข้อมูล | `utils/openingHoursChecker.ts` |
| D-11 | ห้าม confirm แผนที่ยังมี closed/time/budget conflict (unknown hours/cost ไม่นับ) และต้องเช็คก่อนลบแผนเดิม | กันแผนเก่าหาย | `confirmItinerary` |
| D-12 | `province` บังคับกรอก ส่วน `district` ไม่บังคับ ถ้ามีให้กรองแบบ AND | แก้ bug ที่ district ไม่ถูกกรอง | `tripController`, `poiPlaceQueries` |
| D-13 | Dropdown จังหวัด/อำเภอดึงจากข้อมูลจริงใน `places` ไม่ hardcode | กันการเลือกจังหวัดที่ไม่มีข้อมูลแล้วได้ผลลัพธ์ 0 แบบเงียบๆ | `placeDropdownController.ts` |
| D-14 | ใช้ ORS แทน Google Distance Matrix และ fallback เป็น haversine **ต่อคู่** (ห้าม throw) · fallback speed 25 km/h · เวลาเดินทางขั้นต่ำ 1 นาที | เกิน free tier ของ Google และระบบต้องไม่ล่มเมื่อ ORS ล่ม | `utils/orsTravelMatrix.ts`, `orsDistance.ts` |
| D-15 | ORS base URL = `https://api.heigit.org/openrouteservice` (โดเมนเก่าปิดแล้วตาม comment) | | `config/ors.ts` |
| D-16 | Weather v1 ใช้แค่โอกาสฝน เฉลี่ยทั้งช่วงทริป ใช้ grid 0.1° ถ้าไม่มีพยากรณ์ให้ score 1.0 ทุกที่ และค่า exposure INDOOR/MIXED/OUTDOOR = 0/0.5/1 | POI คำนวณก่อนจะรู้ว่าแต่ละที่ลงวันไหน | `weatherForecast.ts`, `poiScoreCalculator.ts` |
| D-17 | POI weights: category .35, rating .25, distance .15, budget .15, weather .10 และ renormalize เมื่อ budget weight < .15 | | `poiScoreCalculator.ts` |
| D-18 | Insert `trip_categories` แบบ best-effort ไม่ rollback ทริปหลัก แต่คืน `categoryWarning` | ระบบเรียบง่าย ไม่ทำ fallback ซับซ้อน | `tripController.ts` |
| D-19 | `trip_days` สร้างแบบ lazy ตอนเรียก draft/confirm/saved ครั้งแรก | | `getOrCreateTripDays` |
| D-20 | `/api/place-dropdown` แยกจาก `/api/places` โดยตั้งใจ | กัน path ชนกัน | `server.ts` |

## Decision log ใหม่ (เพิ่มต่อจากนี้)

<!-- ตัวอย่าง:
### D-21 · 2026-10-20 · <หัวข้อ>
- บริบท:
- ทางเลือกที่พิจารณา:
- ข้อสรุป:
- ผู้ตัดสินใจ:
- ไฟล์ที่กระทบ:
-->

### D-21 · 2026-10-16 · Git workflow: ทำงานบน `dev` อย่างเดียว
- บริบท: `main` คือ production และยังไม่ deploy จริง จึงต้องกันไม่ให้ Claude แตะ `main` หรือสร้าง branch/commit เอง
- ทางเลือกที่พิจารณา: 1 งาน = 1 branch (`fix/`, `feat/`, …) ตามที่เขียนไว้เดิมใน `CLAUDE_CODE_MIGRATION.md` §7 → ยกเลิก
- ข้อสรุป:
  - ทำงานบน branch `dev` เท่านั้น ห้ามสร้าง branch ใหม่
  - ห้าม checkout, merge, commit หรือ push เข้า `main` เด็ดขาด (`main` = production)
  - ยังไม่ deploy จริง รันเฉพาะ local
  - ก่อนเริ่มงาน `git status` ต้องว่าง ถ้าไม่ว่างให้หยุดถามผู้ใช้
  - 1 งาน = 1 commit และห้าม commit เองจนกว่าผู้ใช้จะสั่ง
  - ห้าม push ทุก branch จนกว่าผู้ใช้จะสั่งชัดเจน
  - ตอนนี้ยังไม่ push อะไรเลย จนกว่าจะ rotate secrets เสร็จ (T1)
  - ย้อนกลับด้วย `git restore` (ยังไม่ commit) หรือ `git revert` (commit แล้ว)
- ผู้ตัดสินใจ: เจ้าของโปรเจกต์
- ไฟล์ที่กระทบ: `CLAUDE.md`, `docs/CLAUDE_CODE_MIGRATION.md`, `docs/DEVELOPMENT_PLAN.md`, `.claude/skills/update-project-docs/SKILL.md`, `.claude/settings.json`
