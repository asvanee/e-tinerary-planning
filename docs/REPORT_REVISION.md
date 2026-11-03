# สิ่งที่ต้องแก้ในเล่มรายงาน (เทียบกับโค้ดปัจจุบัน)

เทียบเล่ม `propersal.pdf` (61 หน้า) กับโค้ดบน `dev` ที่ `0ce75c1` เมื่อ 2026-11-04 · ⚠️ = ส่วน Auto Trip ของกิ่ง ให้กิ่งตรวจ
คำศัพท์ในเล่ม: ไม่ใช้ "ทริป" — แผนการเดินทาง (`trips`) / ลำดับการเดินทาง (`itineraries`)
รายละเอียดเรื่องน้ำหนักและตัวอย่างคำนวณ: `docs/AHP_POI_WEIGHTS.md` (ข้อ 3–9)

## สถานะ
- [ ] ยังไม่ได้แก้ในเล่ม — ร่างข้อความอยู่ในแชต 2026-11-04 (4.1.3 AHP, 4.1.12–4.1.15, 5.2.3.3, ข้อจำกัด, ตัวอย่างคำนวณ)
- ❓ ข้อมูลจังหวัด: เล่มเขียน 3 จังหวัด (กรุงเทพฯ เชียงใหม่ ชลบุรี) แต่ DB มีแค่น่าน 114 แห่ง — รอผู้ใช้ตัดสินว่าจะนำเข้าใหม่ (ผู้ใช้กดเองในหน้า admin มีค่า Google) หรือแก้เล่มเป็นน่าน

## 1. บทคัดย่อ / วัตถุประสงค์
- บทคัดย่อ + Abstract: จำนวนจังหวัด (ดูสถานะ) · เพิ่มว่าน้ำหนักมาจาก AHP · เพิ่ม AHP ในคำสำคัญ
- วัตถุประสงค์ข้อ 2: เพิ่ม AHP · ข้อ 3: ผู้ใช้กรอกเวลาที่อยู่เอง ระบบคำนวณเวลาเริ่ม/จบ/เดินทาง

## 2. ขอบเขต (3)
- 3.1.1.2–3.1.1.4 ยังว่าง: ตรวจซ้ำ (merge / separate / exclude / fix_location / ok) · Google Find Place + Place Details (Legacy) + priceRange (Places API New) รับผลเมื่อ ≤ 1 km และชื่อคล้าย ไม่งั้นส่ง admin · หน้าความคืบหน้าการนำเข้า
- 3.1.2: หน้า Category Mapping ย้ายป้าย ททท. ไปหมวด
- 3.2.5.1 / 3.3.5.1: ผู้ใช้กรอกเวลาที่อยู่ ยืนยันไม่ได้จนกรอกครบ
- 3.2.5.2 / 3.3.5.2 ⚠️: เวลาต่อหมวดเลือก 30–180 นาที
- 3.3.4: ชื่อปัจจัยให้ตรงกันทั้งเล่ม (Price Score / Budget Score)

## 3. ทบทวนวรรณกรรม (4)
- แทรก 4.1.3 AHP หลัง WSM (อ้าง [3]–[6] ครบ) → เลื่อนเลขหัวข้อเดิม 4.1.3–4.1.14 เป็น 4.1.4–4.1.15
- 4.1.2: น้ำหนักมาจาก AHP
- 4.1.5 Google Places: นำเข้าผ่านหน้า admin (ไม่ใช่ data pipeline) · ค้นด้วย "ชื่อ อำเภอ จังหวัด" + locationbias 1 km · ราคาจาก priceRange ไม่ใช่ price_level
- 4.1.13 Haversine: ORS เป็นหลัก Haversine เป็นตัวสำรอง (ตอนนี้ขัดกับหัวข้อ ORS)
- 4.1.12 ORS: ใช้ 3 ส่วน (POI distance, จัดเอง, Auto Trip) · Leaflet ~40 KB · แผนที่ 4 หน้า (แนะนำ, จัดเอง, อัตโนมัติ, รายละเอียดแผน)
- 4.3.1: Lopes ให้ที่มา 5 ปัจจัย แต่ไม่ให้ค่าน้ำหนัก · "TSP + Haversine" → "TSP + ORS (สำรอง Haversine)"
- 4.3.2: ลบ 35/25/15/15/10% ใส่น้ำหนัก AHP

## 4. ออกแบบ (5.2.1)
- ภาพ 15 DFD Process 2: ใช้ `category_labels` แทนแฟ้มน้ำหนักหมวด/ประเภทสถานที่
- ภาพ 24–25 ER/Relational: ลบ type_category_weights, place_categories, place_types, api_types · เพิ่ม category_labels, pipeline_jobs, pipeline_job_items, admin_place_decisions · users ลบ age/gender · categories ลบ default_duration_min/default_price_level เพิ่ม parent_group · places เพิ่ม price_range_start/end · itineraries เพิ่ม visit_duration_min
- พจนานุกรม: `poi_score` → `poi_scores` · "ตารางที่ 9" ซ้ำ และ categories ไม่มีเลข · google_place_id = TEXT · gmaps_types = TEXT[] · role = user/admin · daily_budget = งบต่อคนต่อวัน · budget_scope GROUP/PER_PERSON · budget_period TOTAL_TRIP/PER_DAY · district = อำเภอ/เขต · att_id / att_type_label เป็นรหัส/ป้ายของ ททท. ไม่ใช่ไฟล์หรือรูปภาพ · ใส่คำอธิบาย price_range_* และ parent_group · คำสะกดผิด BOOLEANA/BOOLAEN/NUMBERIC/TIMESTAMPT
- ภาพ 27 หน้าสมัครสมาชิกยังมีอายุ/เพศ → ถ่ายใหม่ · ยังไม่มีภาพหน้า admin

## 5. พัฒนา (5.2.2–5.2.3)
- 5.2.2: แยก "Open-Meteo Leaflet/OpenStreetMap" · เพิ่ม Places API (New) · เพิ่ม Jest
- 5.2.3.1: เขียนใหม่ — หมวดมาจากป้าย ททท. ผ่าน `category_labels` (1 สถานที่ = 1 หมวด) Google ใช้เติมรีวิว เวลาเปิด-ปิด ราคา
- 5.2.3.2: ลำดับ จังหวัด/อำเภอ → งบ → หมวด · หมวดนับหลังงบ (≥ 50 เหลือที่ตรง, < 50 เติมหมวดอื่น คะแนนหมวด 0) · ลบขั้นกรองเวลาและ Confidence Score
- 5.2.3.3: สูตร AHP + หัวข้อที่มาของน้ำหนัก + ตัวอย่างคำนวณ (AHP_POI_WEIGHTS ข้อ 9) · ลบตาราง Price Score เดิม ใช้ `1 − ราคาต่อคน ÷ งบต่อคนต่อวัน` (ฟรี = 1 · ไม่ทราบราคา = ไม่คิด) · คะแนนหมวด 1/0/ไม่คิด · ไม่มีรีวิว = ไม่คิด · **ลบ log `[WEATHER-DEBUG]` / `[POI]` (หน้า 44–52)**
- 5.2.3.4: Default Duration → เวลาที่ผู้ใช้กรอก · เวลาเดินทางจาก ORS
- 5.2.3.5 ⚠️: Default Duration → เวลาต่อหมวด 30–180 นาที · เวลาเดินทางจาก ORS ใช้ 30 กม./ชม. เฉพาะคู่ที่ ORS ไม่มี

## 6. ทดสอบ / สรุป
- 5.2.4.1: ลบการทดสอบกรองเวลา · "แมปประเภทจาก Google" → "จัดหมวดจากป้าย ททท." · เพิ่ม jest ของสคริปต์ AHP
- 5.2.4.3: "ปรับน้ำหนักจากผลทดสอบ" ขัดกับที่ทีมตัดสินใจ → "น้ำหนักจาก AHP" · "ใช้ API ถนนจริง" ทำแล้ว (ORS)
- 5.2.5: เลิกใช้คำว่า "คาดว่า" · ลบข้อเสนอแนะ API ถนนจริง / สภาพอากาศจริง (ทำแล้ว) · เพิ่มข้อจำกัด AHP (AHP_POI_WEIGHTS ข้อ 5)

## 7. เอกสารอ้างอิง — เรียงตามลำดับที่อ้างครั้งแรก (หลังแทรก 4.1.3)

| ใหม่ | งาน | เลขเดิมในเล่ม |
|---|---|---|
| [1] | Ricci et al. 2011 (Recommender) | [1] |
| [2] | Ouchra & Belangour 2021 (WSM) | [2] |
| [3] | R. W. Saaty 1987 (AHP) | ใหม่ |
| [4] | Forman & Peniwati 1998 | ใหม่ |
| [5] | Battistoni et al. 2013 | ใหม่ |
| [6] | T. L. Saaty 1994 | ใหม่ |
| [7] | Hoffman et al. 2013 (TSP) | [3] |
| [8] | Google Places API | [4] |
| [9] | Express.js | [5] |
| [10] | RESTful API | [6] |
| [11] | JSON | [7] |
| [12] | Supabase | [8] |
| [13] | Haversine (Muttaqin et al. 2024) | [9] |
| [14] | JWT (RFC 7519) | [10] |
| [15] | openrouteservice — https://github.com/GIScience/openrouteservice | [13] (เดิมไม่มีในรายการ) |
| [16] | ORS Matrix Endpoint — https://giscience.github.io/openrouteservice/api-reference/endpoints/matrix/ | [14] (เดิมไม่มี) |
| [17] | Open-Meteo Weather Forecast API — https://open-meteo.com/en/docs | [15] (เดิมไม่มี) |
| [18] | Leaflet — https://leafletjs.com/ | [16] (เดิมไม่มี) |
| [19] | OpenStreetMap Copyright and License — https://www.openstreetmap.org/copyright | [17] (เดิมไม่มี) |
| [20] | Lopes et al. 2020 (E-tinerary) | [11] |
| [21] | โครงงานรุ่นก่อน (Kokitsuntorasarn et al. 2568) | [12] |

[15]–[19] ตรวจเนื้อหากับเว็บทางการเมื่อ 4 พ.ย. 2569 (สืบค้น 4 พฤศจิกายน 2569)
