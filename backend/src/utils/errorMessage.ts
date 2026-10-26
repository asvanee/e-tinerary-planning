/** ข้อความของ error ที่ catch ได้ (รับ object ที่มี message) — undefined ถ้าไม่มี */
export function errorMessage(err: unknown): string | undefined {
  return (err as { message?: string } | null)?.message;
}
