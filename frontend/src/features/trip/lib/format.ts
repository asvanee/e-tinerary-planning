// รูปแบบการแสดงผลที่ใช้ร่วมกันในหน้าทริป (TripDetail, ItineraryEditor, TripRecommendations)

export const DAY_NAMES_TH = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];

// "HH:MM:SS" -> "HH:MM น."
export function formatTime(time: string | null): string {
  if (!time) return "—";
  return time.slice(0, 5) + " น.";
}

// "YYYY-MM-DD" -> ชื่อวัน วันที่ เดือน (long = เต็ม เช่นหน้า TripDetail · short = ย่อ เช่นหน้า editor)
export function formatVisitDate(visitDate: string, style: "long" | "short"): string {
  const date = new Date(visitDate + "T00:00:00");
  return date.toLocaleDateString("th-TH", {
    weekday: style,
    day: "numeric",
    month: style,
  });
}

export function formatBaht(amount: number): string {
  return amount.toLocaleString("th-TH") + " ฿";
}

export function formatTimeRange(start: string | null, end: string | null): string {
  if (!start && !end) return "—";
  return `${start ? start.slice(0, 5) : "—"} - ${end ? end.slice(0, 5) : "—"} น.`;
}

// เวลาเดินทางเป็นนาที -> "6 นาที" / "1 ชม. 5 นาที"
export function formatTravelTime(minutes: number): string {
  const total = Math.round(minutes);
  if (total < 1) return "น้อยกว่า 1 นาที";
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m} นาที`;
  return m === 0 ? `${h} ชม.` : `${h} ชม. ${m} นาที`;
}

// ระยะทางเป็นกม. -> น้อยกว่า 1 กม. แสดงเป็นเมตร (เช่น "300 ม.")
export function formatDistance(km: number): string {
  return km < 1 ? `${Math.round(km * 1000)} ม.` : `${km.toFixed(1)} กม.`;
}
