---
name: itinerary-mirror-sync
description: ใช้ทุกครั้งที่แก้ logic การคำนวณ itinerary (เวลาเริ่ม/จบ, เวลาเดินทาง, travel matrix, ราคา/งบ, เวลาเปิด-ปิด, conflict flags) เพราะ backend และ frontend มีโค้ด mirror ที่ต้องตรงกันทุกบรรทัด
---

# Itinerary Mirror Sync

## ทำไมต้องมี skill นี้
มติ D-02: backend เป็น source of truth ส่วน frontend เก็บ copy ไว้เพื่อ recompute ทันทีตอนลากวาง แล้ว backend re-validate ซ้ำตอน confirm ถ้าสองฝั่งไม่ตรงกัน ผู้ใช้จะเห็นว่าไม่มี conflict ใน editor แต่ confirm แล้วได้ 400 (หรือกลับกัน) ทั้งสอง package import ข้ามกันไม่ได้ จึงต้อง mirror ด้วยมือ

## คู่ไฟล์ที่ต้องตรงกัน
| Backend (source of truth) | Frontend mirror |
|---|---|
| `backend/src/features/itinerary/itineraryBuilder.ts` (`buildDayItems`, `buildItinerary`, `resolveTravelMetric`, `buildInitialDraft`, `buildNearestNeighborOrder`) | `frontend/src/features/trip/e-tinerary/lib/itineraryBuilder.ts` |
| `backend/src/utils/openingHoursChecker.ts` | `frontend/src/features/trip/e-tinerary/lib/openingHoursChecker.ts` |
| `backend/src/utils/haversine.ts` | `frontend/src/features/trip/e-tinerary/lib/haversine.ts` |
| ค่าคงที่ `TRIP_START_ID`, `FALLBACK_AVG_SPEED_KMH`, type `TravelMatrix`/`TravelMetric` ใน `backend/src/utils/orsTravelMatrix.ts` | ประกาศซ้ำในไฟล์ `lib/itineraryBuilder.ts` ของ frontend |
| `getKnownPrice`, `getPlaceCost` ใน `backend/src/utils/placePrice.ts` (D-52 — POI filter / price score ใช้ตัวเดียวกัน) | ประกาศซ้ำในไฟล์ `lib/itineraryBuilder.ts` ของ frontend |
| `timeStringToMinutes`, `minutesToTimeString` ใน `backend/src/utils/timeString.ts` (`itineraryPlaceQueries.ts` ใช้ตัวเดียวกัน) | ประกาศซ้ำในไฟล์ `lib/itineraryBuilder.ts` ของ frontend |
| type `PriceNature` ใน `backend/src/features/poi/poiPlaceQueries.ts` | type ใน frontend lib |

ค่าที่ต้องตรงกัน (ณ `0c980bd`): `TRIP_START_ID="__trip_start__"`, `FALLBACK_AVG_SPEED_KMH=25`, เวลาเดินทางขั้นต่ำ 1 นาที, เวลาที่เกิน 23:59 ให้ cap ไว้ที่ 23:59

นอกจากนี้ยังมีโค้ดที่ไม่ได้ mirror แต่ต้องสอดคล้องกัน: `toMinutes()` ใน `orsTravelMatrix.ts` และ logic ของ `autoTripBuilder.ts` (ซึ่งตอนนี้ **ไม่**ใช้ builder ตัวนี้ ดู Known Issue #9)

## ขั้นตอน
1. อ่านทั้งสองไฟล์ของคู่ที่จะแก้ แล้วรัน diff เพื่อดูว่าตอนนี้ตรงกันหรือไม่ ก่อนแก้:
   ```bash
   diff <(sed -n '/^export function buildDayItems/,/^}/p' backend/src/features/itinerary/itineraryBuilder.ts) \
        <(sed -n '/^export function buildDayItems/,/^}/p' frontend/src/features/trip/e-tinerary/lib/itineraryBuilder.ts)
   ```
   (ใช้ได้ใน Git Bash/WSL ถ้าอยู่บน Windows PowerShell ให้เปรียบเทียบด้วยการอ่านไฟล์) ถ้าก่อนแก้ก็ไม่ตรงกันอยู่แล้ว ให้รายงานผู้ใช้ก่อน
2. แก้ backend ก่อน แล้ว port ไป frontend **ทีละบรรทัด** (เฉพาะ logic เท่านั้น ส่วน import path/type ต่างกันได้)
3. ถ้าเปลี่ยน output shape (`ItineraryItemResult`) ต้องตรวจทุกจุดที่ใช้:
   - `itineraryController.confirmItinerary` (`rowsToInsert` → คอลัมน์ `itineraries`)
   - `itineraryController.getSavedItinerary` (mapping กลับ)
   - `ItineraryEditor.tsx`, `TripDetail.tsx`, `RouteMap.tsx`
4. ถ้าแก้กฎ conflict ต้องเช็คว่า `confirmItinerary` (filter conflicts) และปุ่มยืนยันใน `ItineraryEditor.tsx` (`conflictCount`) ยังใช้กฎเดียวกัน
5. ทำ diff ซ้ำหลังแก้ ต้องได้ผลว่า logic เหมือนกัน
6. ถ้ามี parity test (DEVELOPMENT_PLAN T14) ให้รันด้วย ถ้ายังไม่มีให้เสนอเพิ่ม test case สำหรับกฎที่เปลี่ยน
7. ตรวจตาม `verify-changes` (ต้องรันทั้ง backend `tsc --noEmit` และ frontend `tsc -b`)

## ข้อควรระวัง
- ห้ามแก้แค่ฝั่งเดียว แม้ผู้ใช้จะขอแค่ "ให้ UI แสดงต่างไป" ถ้าเป็นเรื่องการแสดงผลล้วนๆ ให้แก้ใน component แทน builder
- การเปลี่ยนกฎจะทำให้แผนที่บันทึกไว้แล้วใน `itineraries` มี flag ไม่ตรงกับกฎใหม่จนกว่าจะ confirm ใหม่ ต้องแจ้งผู้ใช้
- อย่าแตะมติ D-03 (manual drag), D-05 (ไม่เดาราคา), D-10 (unknown hours ไม่ใช่ conflict) โดยไม่ถาม

## หยุดแล้วถามผู้ใช้เมื่อ
- พบว่าสองฝั่งไม่ตรงกันตั้งแต่ก่อนแก้ (ต้องถามว่าฝั่งไหนถูก)
- งานเปลี่ยนความหมายของงบ/ราคา (ดู DEVELOPMENT_PLAN T5)

## รูปแบบรายงาน
```
## Itinerary logic change
กฎที่เปลี่ยน:
Backend: path — สิ่งที่เปลี่ยน
Frontend mirror: path — สิ่งที่เปลี่ยน
Diff หลังแก้: ตรงกัน / ต่างเฉพาะ <import/type>
Consumers ที่ตรวจแล้ว:
ผลการตรวจ (verify-changes):
ผลต่อข้อมูลเดิม:
```
