const API_URL = import.meta.env.VITE_API_URL || "";

export class AdminApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

function messageFrom(data: unknown): string | null {
  if (typeof data === "object" && data !== null && "message" in data) {
    const { message } = data as { message: unknown };
    if (typeof message === "string") return message;
  }
  return null;
}

// เรียก /api/admin/* พร้อม token · error จะ throw เป็น AdminApiError ที่มีข้อความภาษาไทยจาก backend
export async function adminRequest<T>(
  path: string,
  token: string | undefined,
  options: { method?: "GET" | "POST" | "PUT" | "DELETE"; body?: unknown } = {}
): Promise<T> {
  const hasBody = options.body !== undefined;
  const res = await fetch(`${API_URL}/api/admin${path}`, {
    method: options.method ?? "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      ...(hasBody ? { "Content-Type": "application/json" } : {}),
    },
    body: hasBody ? JSON.stringify(options.body) : undefined,
  });
  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    throw new AdminApiError(messageFrom(data) ?? "เกิดข้อผิดพลาด กรุณาลองใหม่", res.status);
  }
  return data as T;
}

export function errorMessage(err: unknown): string {
  if (err instanceof AdminApiError) return err.message;
  return "ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้";
}
