// ช่องกรอกหมายเหตุของ admin (ไม่บังคับ) รับข้อความที่พิมพ์และฟังก์ชันเมื่อพิมพ์
export default function NoteField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <label className="flex flex-col gap-1 grow">
      <span className="font-prompt text-[color:var(--navy)]">หมายเหตุ (ไม่บังคับ)</span>
      {/* [ช่องกรอก] หน้าAdmin ช่องหมายเหตุ · หมายเหตุ — ข้อความหมายเหตุของคำตัดสิน (note) */}
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-10 px-3 rounded-lg border border-[color:var(--line)]"
      />
    </label>
  );
}
