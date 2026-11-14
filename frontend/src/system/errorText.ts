// ข้อความจาก error ที่ catch ได้ — ไม่มีใช้ fallback
export function errorText(err: unknown, fallback: string): string {
  return (err as { message?: string } | null)?.message || fallback;
}

// ดึงข้อความ message จากผลที่ backend ตอบ (ไม่มี = undefined)
export function apiMessage(payload: unknown): string | undefined {
  if (
    typeof payload === "object" &&
    payload !== null &&
    "message" in payload &&
    typeof payload.message === "string"
  ) {
    return payload.message;
  }

  return undefined;
}