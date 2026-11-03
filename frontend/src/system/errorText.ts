// ข้อความจาก error ที่ catch ได้ — ไม่มีใช้ fallback
export function errorText(err: unknown, fallback: string): string {
  return (err as { message?: string } | null)?.message || fallback;
}
