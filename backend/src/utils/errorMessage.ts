// ดึงข้อความจาก error ที่ catch ได้ (ไม่มีคืน undefined)
export function errorMessage(err: unknown): string | undefined {
  return (err as { message?: string } | null)?.message;
}
