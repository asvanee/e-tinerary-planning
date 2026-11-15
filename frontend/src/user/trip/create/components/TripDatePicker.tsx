import { useEffect, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Cloud, CloudOff } from "lucide-react";
import {
    FORECAST_MAX_DAYS_AHEAD, forecastLastDay, hasForecast, todayInBangkok,
} from "../tripDates";
import { formatThaiDate } from "../../lib/format";

const WEEKDAYS = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];

interface Props {
    id: string;
    value: string;
    onChange: (isoDate: string) => void;
    minDate: string;
    maxDate?: string;
    className: string;
}

// ปี เดือน(0-11) วัน → "YYYY-MM-DD"
function toIso(year: number, month: number, day: number): string {
    return new Date(Date.UTC(year, month, day)).toISOString().slice(0, 10);
}

// ชื่อเดือนและปีภาษาไทยที่หัวปฏิทิน
function monthLabel(year: number, month: number): string {
    return new Date(Date.UTC(year, month, 1)).toLocaleDateString("th-TH", {
        month: "long",
        year: "numeric",
        timeZone: "UTC",
    });
}

// ปฏิทินเลือกวัน ทุกวันมีไอคอนเมฆบอกว่ามีพยากรณ์อากาศหรือยัง
// รับค่าวันที่ที่เลือก ฟังก์ชันเมื่อเลือกวัน และช่วงวันที่เลือกได้ (minDate–maxDate)
export default function TripDatePicker({ id, value, onChange, minDate, maxDate, className }: Props) {
    const [open, setOpen] = useState(false);
    const [view, setView] = useState({ year: 0, month: 0 });
    const rootRef = useRef<HTMLDivElement>(null);

    const today = todayInBangkok();
    const lastForecast = forecastLastDay();

    // ปิดเมื่อคลิกนอกปฏิทินหรือกด Esc
    useEffect(() => {
        if (!open) return;
        const onMouseDown = (e: MouseEvent) => {
            if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
        };
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") setOpen(false);
        };
        document.addEventListener("mousedown", onMouseDown);
        document.addEventListener("keydown", onKeyDown);
        return () => {
            document.removeEventListener("mousedown", onMouseDown);
            document.removeEventListener("keydown", onKeyDown);
        };
    }, [open]);

    const toggle = () => {
        if (!open) {
            // เปิดที่เดือนของวันที่เลือกไว้ ถ้ายังไม่เลือกให้เปิดที่วันแรกที่เลือกได้
            const base = value || minDate;
            setView({ year: Number(base.slice(0, 4)), month: Number(base.slice(5, 7)) - 1 });
        }
        setOpen(!open);
    };

    const shiftMonth = (delta: number) => {
        const d = new Date(Date.UTC(view.year, view.month + delta, 1));
        setView({ year: d.getUTCFullYear(), month: d.getUTCMonth() });
    };

    const firstWeekday = new Date(Date.UTC(view.year, view.month, 1)).getUTCDay();
    const daysInMonth = new Date(Date.UTC(view.year, view.month + 1, 0)).getUTCDate();
    const firstOfView = toIso(view.year, view.month, 1);
    const lastOfView = toIso(view.year, view.month, daysInMonth);
    const canGoBack = firstOfView > minDate;
    const canGoNext = !maxDate || lastOfView < maxDate;

    return (
        <div ref={rootRef} className="relative">
            {/* ปุ่มช่องวันที่ → เปิด/ปิดปฏิทิน */}
            {/* [ปุ่ม] หน้าสร้างแผน(ปฏิทิน) · ช่องเลือกวันที่ — เปิด/ปิดปฏิทิน */}
            <button
                id={id}
                type="button"
                onClick={toggle}
                aria-haspopup="dialog"
                aria-expanded={open}
                className={`${className} flex items-center justify-between text-left`}
            >
                <span className={value ? "" : "text-[color:var(--muted)] opacity-60"}>
                    {value ? formatThaiDate(value) : "เลือกวันที่"}
                </span>
                <CalendarDays size={18} strokeWidth={1.75} className="shrink-0 text-[color:var(--deep)]" />
            </button>

            {open && (
                <div
                    role="dialog"
                    aria-label="เลือกวันที่"
                    className="absolute left-0 z-20 mt-2 w-full min-w-72 max-w-sm rounded-2xl border border-[color:var(--line)] bg-white p-4 shadow-[var(--shadow)]"
                >
                    <div className="flex items-center justify-between mb-3">
                        {/* ปุ่มเดือนก่อนหน้า */}
                        {/* [ปุ่ม] หน้าสร้างแผน(ปฏิทิน) · เดือนก่อนหน้า — เลื่อนปฏิทินไปเดือนก่อน (ปิดถ้าเป็นเดือนต่ำสุดที่เลือกได้) */}
                        <button
                            type="button"
                            onClick={() => shiftMonth(-1)}
                            disabled={!canGoBack}
                            aria-label="เดือนก่อนหน้า"
                            className="w-9 h-9 flex items-center justify-center rounded-full text-[color:var(--navy)] hover:bg-[color:var(--sky-soft)] disabled:opacity-30 disabled:hover:bg-transparent"
                        >
                            <ChevronLeft size={18} />
                        </button>
                        <p className="font-prompt font-medium text-[color:var(--navy)]">
                            {monthLabel(view.year, view.month)}
                        </p>
                        {/* ปุ่มเดือนถัดไป */}
                        {/* [ปุ่ม] หน้าสร้างแผน(ปฏิทิน) · เดือนถัดไป — เลื่อนปฏิทินไปเดือนถัดไป */}
                        <button
                            type="button"
                            onClick={() => shiftMonth(1)}
                            disabled={!canGoNext}
                            aria-label="เดือนถัดไป"
                            className="w-9 h-9 flex items-center justify-center rounded-full text-[color:var(--navy)] hover:bg-[color:var(--sky-soft)] disabled:opacity-30 disabled:hover:bg-transparent"
                        >
                            <ChevronRight size={18} />
                        </button>
                    </div>

                    <div className="grid grid-cols-7 gap-1 text-center">
                        {WEEKDAYS.map((w) => (
                            <span key={w} className="text-xs text-[color:var(--muted)] pb-1">{w}</span>
                        ))}
                        {Array.from({ length: firstWeekday }, (_, i) => <span key={`blank-${i}`} />)}
                        {Array.from({ length: daysInMonth }, (_, i) => {
                            const iso = toIso(view.year, view.month, i + 1);
                            const disabled = iso < minDate || (!!maxDate && iso > maxDate);
                            const selected = iso === value;
                            const forecast = hasForecast(iso, today, lastForecast);
                            const Icon = forecast ? Cloud : CloudOff;
                            // ปุ่มวันที่ 1 วัน กดแล้วเลือกวันนั้นและปิดปฏิทิน
                            return (
                                // [ปุ่ม] หน้าสร้างแผน(ปฏิทิน) · ช่องวันที่ในปฏิทิน — เลือกวันนั้น · ปิดวันที่ก่อน minDate หรือหลัง maxDate
                                <button
                                    key={iso}
                                    type="button"
                                    disabled={disabled}
                                    onClick={() => {
                                        onChange(iso);
                                        setOpen(false);
                                    }}
                                    aria-pressed={selected}
                                    aria-label={`${formatThaiDate(iso)} ${forecast ? "มีพยากรณ์อากาศ" : "ยังไม่มีพยากรณ์อากาศ"}`}
                                    className={`flex flex-col items-center justify-center gap-0.5 min-h-12 rounded-xl text-sm transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-30 ${selected
                                            ? "bg-[color:var(--navy)] text-white"
                                            : "text-[color:var(--text)] hover:bg-[color:var(--sky-soft)] disabled:hover:bg-transparent"
                                        }`}
                                >
                                    <span className={iso === today ? "font-semibold underline underline-offset-2" : ""}>{i + 1}</span>
                                    <Icon
                                        size={14}
                                        strokeWidth={2}
                                        aria-hidden="true"
                                        className={selected ? "text-white" : forecast ? "text-[color:var(--sky)]" : "text-[color:var(--muted)] opacity-60"}
                                    />
                                </button>
                            );
                        })}
                    </div>

                    <div className="mt-3 pt-3 border-t border-[color:var(--line)] flex flex-col gap-1 text-xs text-[color:var(--muted)]">
                        <span className="flex items-center gap-1.5">
                            <Cloud size={14} strokeWidth={2} className="text-[color:var(--sky)]" />
                            มีพยากรณ์อากาศ (ถึง {formatThaiDate(lastForecast)})
                        </span>
                        <span className="flex items-center gap-1.5">
                            <CloudOff size={14} strokeWidth={2} className="opacity-60" />
                            ยังไม่มีพยากรณ์ (ดูได้ล่วงหน้า {FORECAST_MAX_DAYS_AHEAD + 1} วัน)
                        </span>
                    </div>
                </div>
            )}
        </div>
    );
}
