export type OpeningHoursStatus = "open" | "closed" | "unknown";

export interface OpeningHoursDisplay {
  label: string;
  text: string;
  status: OpeningHoursStatus;
}

const TH_DAYS = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];

const cleanText = (value: string | null | undefined) => {
  if (typeof value !== "string") return "";
  return value.trim();
};

export function getOpeningHoursDisplay(openingHours: unknown): OpeningHoursDisplay {
  if (typeof openingHours === "string") {
    const text = cleanText(openingHours);
    return {
      label: text ? "เวลาเปิด-ปิด" : "ไม่มีข้อมูล",
      text: text || "ไม่มีข้อมูลเวลาเปิด-ปิด",
      status: "unknown",
    };
  }

  if (!openingHours || typeof openingHours !== "object") {
    return {
      label: "ไม่มีข้อมูล",
      text: "ไม่มีข้อมูลเวลาเปิด-ปิด",
      status: "unknown",
    };
  }

  const hours = openingHours as Record<string, any>;

  if (typeof hours.text === "string" && cleanText(hours.text)) {
    return {
      label: "เวลาเปิด-ปิด",
      text: cleanText(hours.text),
      status: "unknown",
    };
  }

  if (Array.isArray(hours.weekday_text) && hours.weekday_text.length > 0) {
    const today = new Date().getDay();
    const index = (today + 6) % 7;
    const rawText = cleanText(hours.weekday_text[index] ?? hours.weekday_text[0]);
    const text = rawText.includes(":")
      ? rawText.split(":").slice(1).join(":").trim()
      : rawText;

    if (typeof hours.open_now === "boolean") {
      return {
        label: hours.open_now ? "เปิดอยู่ตอนนี้" : "ปิดตอนนี้",
        text: text || "ไม่มีข้อมูลเวลาเปิด-ปิด",
        status: hours.open_now ? "open" : "closed",
      };
    }

    return {
      label: `วันนี้ · ${TH_DAYS[today]}`,
      text: text || "ไม่มีข้อมูลเวลาเปิด-ปิด",
      status: "unknown",
    };
  }

  if (typeof hours.open_now === "boolean") {
    return {
      label: hours.open_now ? "เปิดอยู่ตอนนี้" : "ปิดตอนนี้",
      text: hours.open_now ? "สถานที่เปิดอยู่ตอนนี้" : "สถานที่ปิดอยู่ตอนนี้",
      status: hours.open_now ? "open" : "closed",
    };
  }

  return {
    label: "ไม่มีข้อมูล",
    text: "ไม่มีข้อมูลเวลาเปิด-ปิด",
    status: "unknown",
  };
}
