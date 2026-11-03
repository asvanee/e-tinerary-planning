import { Info, TriangleAlert } from "lucide-react";

interface ConflictFlags {
  isClosedConflict: boolean;
  isTimeConflict: boolean;
  isBudgetConflict: boolean;
  isHoursUnknown: boolean;
  isCostUnknown: boolean;
}

// ป้ายปัญหาของสถานที่ในแผน: ปิด/เวลาไม่พอ/งบเกิน ใช้สีแดง · "ไม่ทราบข้อมูล" ใช้สีกลาง
// ("ไม่ทราบราคา" แยกจาก "งบเกิน" ให้ผู้ใช้เห็นความต่าง)
export default function ConflictBadges({
  item,
  closedLabel,
  className,
}: {
  item: ConflictFlags;
  closedLabel: string;
  className: string;
}) {
  const badges: { label: string; warn: boolean }[] = [];

  if (item.isClosedConflict) badges.push({ label: closedLabel, warn: true });
  if (item.isTimeConflict) badges.push({ label: "เวลาไม่พอ", warn: true });
  if (item.isBudgetConflict) badges.push({ label: "งบเกิน", warn: true });
  if (item.isHoursUnknown) badges.push({ label: "ไม่ทราบเวลาเปิด-ปิด", warn: false });
  if (item.isCostUnknown) badges.push({ label: "ไม่ทราบราคา", warn: false });

  if (badges.length === 0) return null;

  return (
    <div className={`flex flex-wrap gap-1.5 ${className}`}>
      {badges.map((b) => (
        <span
          key={b.label}
          className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border bg-white ${
            b.warn
              ? "text-[color:var(--danger)] border-[color:var(--danger)]"
              : "text-[color:var(--muted)] border-[color:var(--line)]"
          }`}
        >
          {b.warn ? (
            <TriangleAlert size={12} strokeWidth={1.75} />
          ) : (
            <Info size={12} strokeWidth={1.75} />
          )}
          {b.label}
        </span>
      ))}
    </div>
  );
}
