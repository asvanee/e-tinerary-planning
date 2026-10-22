import { useEffect, useState } from "react";
import { ChevronDown, Info, Loader2, Save, Tags, TriangleAlert } from "lucide-react";
import { useAuth } from "../../system/auth/useAuth";
import { CATEGORY_GROUPS, ENVIRONMENT_TYPES, PRICE_NATURES } from "../../system/categoryGroups";
import { adminRequest, errorMessage } from "../lib/adminApi";

// หน้า Category Mapping (R5 P5e — D-40): ย้ายป้าย ททท. ไปหมวดอื่น + แก้ชื่อ/กลุ่ม/env/price ของหมวด
// ไม่มีเพิ่ม/ลบ/รวมหมวด

interface AdminCategoryLabel {
  category_label_id: string;
  att_type_label: string;
  place_count: number;
}

interface AdminCategory {
  category_id: string;
  category_name: string;
  parent_group: string;
  environment_type: string;
  price_nature: string;
  labels: AdminCategoryLabel[];
}

type CategoryFields = Pick<AdminCategory, "category_name" | "parent_group" | "environment_type" | "price_nature">;

interface CategoriesResponse {
  categories: AdminCategory[];
}

const fieldClass =
  "w-full min-h-10 px-3 rounded-lg border border-[color:var(--line)] bg-white text-sm text-[color:var(--navy)] focus:outline-none focus:border-[color:var(--navy)] focus:ring-4 focus:ring-[color:var(--line)] transition-all duration-200";
const selectClass = `${fieldClass} appearance-none pr-9`;
const labelTextClass = "font-prompt text-xs font-medium text-[color:var(--deep)]";

function fieldsOf(category: AdminCategory): CategoryFields {
  const { category_name, parent_group, environment_type, price_nature } = category;
  return { category_name, parent_group, environment_type, price_nature };
}

function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className={labelTextClass}>{label}</span>
      <span className="relative">
        <select value={value} onChange={(e) => onChange(e.target.value)} className={selectClass}>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <ChevronDown
          size={16}
          strokeWidth={1.75}
          className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[color:var(--deep)]"
        />
      </span>
    </label>
  );
}

function CategoryCard({
  category,
  allCategories,
  busy,
  onSave,
  onMoveLabel,
}: {
  category: AdminCategory;
  allCategories: AdminCategory[];
  busy: boolean;
  onSave: (fields: CategoryFields) => Promise<boolean>;
  onMoveLabel: (label: AdminCategoryLabel, toCategory: AdminCategory) => void;
}) {
  // ค่าที่แก้ค้างไว้ — ค่าใน DB เปลี่ยนเมื่อไร parent เปลี่ยน key ให้การ์ดเริ่มใหม่จากค่าล่าสุด
  const [fields, setFields] = useState<CategoryFields>(() => fieldsOf(category));

  const saved = fieldsOf(category);
  const dirty = (Object.keys(saved) as (keyof CategoryFields)[]).some((key) => fields[key] !== saved[key]);
  const placeCount = category.labels.reduce((sum, l) => sum + l.place_count, 0);
  const set = (key: keyof CategoryFields) => (value: string) => setFields((prev) => ({ ...prev, [key]: value }));

  return (
    <section className="bg-white rounded-2xl border border-[color:var(--line)] [box-shadow:var(--shadow)] p-4 flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="flex flex-col gap-1 sm:col-span-2 lg:col-span-1">
          <span className={labelTextClass}>ชื่อหมวด</span>
          <input
            value={fields.category_name}
            onChange={(e) => set("category_name")(e.target.value)}
            maxLength={100}
            className={fieldClass}
          />
        </label>
        <Select label="กลุ่มใหญ่" value={fields.parent_group} options={CATEGORY_GROUPS} onChange={set("parent_group")} />
        <Select label="ในร่ม / กลางแจ้ง" value={fields.environment_type} options={ENVIRONMENT_TYPES} onChange={set("environment_type")} />
        <Select label="ค่าเข้าชม" value={fields.price_nature} options={PRICE_NATURES} onChange={set("price_nature")} />
      </div>

      {dirty && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={busy || !fields.category_name.trim()}
            onClick={async () => {
              await onSave({ ...fields, category_name: fields.category_name.trim() });
            }}
            className="font-prompt text-sm font-medium min-h-10 px-4 rounded-xl flex items-center gap-2 text-white bg-[color:var(--navy)] hover:bg-[color:var(--navy-dark)] disabled:opacity-60 disabled:pointer-events-none transition-colors"
          >
            <Save size={16} strokeWidth={1.75} />
            บันทึก
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => setFields(saved)}
            className="font-prompt text-sm min-h-10 px-4 rounded-xl text-[color:var(--muted)] hover:bg-[color:var(--sky-soft)] transition-colors"
          >
            ยกเลิก
          </button>
        </div>
      )}

      <div className="border-t border-[color:var(--line)] pt-3">
        <p className="text-xs text-[color:var(--muted)] mb-2">
          ป้าย ททท. ในหมวดนี้ {category.labels.length} ป้าย · สถานที่ในระบบ {placeCount} แห่ง
        </p>
        {category.labels.length === 0 ? (
          <p className="flex items-center gap-1.5 text-sm text-[color:var(--danger)]">
            <TriangleAlert size={14} strokeWidth={1.75} />
            ไม่มีป้ายในหมวดนี้ — หมวดนี้จะไม่มีสถานที่ให้แนะนำ
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {category.labels.map((label) => (
              <li key={label.category_label_id} className="flex flex-wrap items-center gap-2 justify-between">
                <span className="text-sm text-[color:var(--navy)]">
                  {label.att_type_label}{" "}
                  <span className="text-[color:var(--muted)]">({label.place_count} แห่ง)</span>
                </span>
                <span className="relative">
                  <select
                    value=""
                    disabled={busy}
                    aria-label={`ย้ายป้าย ${label.att_type_label} ไปหมวดอื่น`}
                    onChange={(e) => {
                      const target = allCategories.find((c) => c.category_id === e.target.value);
                      if (target) onMoveLabel(label, target);
                    }}
                    className="appearance-none min-h-9 pl-3 pr-8 rounded-lg border border-[color:var(--line)] bg-white text-sm text-[color:var(--navy)] focus:outline-none focus:border-[color:var(--navy)] disabled:opacity-60"
                  >
                    <option value="">ย้ายไปหมวด…</option>
                    {CATEGORY_GROUPS.map((group) => (
                      <optgroup key={group.value} label={group.label}>
                        {allCategories
                          .filter((c) => c.parent_group === group.value && c.category_id !== category.category_id)
                          .map((c) => (
                            <option key={c.category_id} value={c.category_id}>
                              {c.category_name}
                            </option>
                          ))}
                      </optgroup>
                    ))}
                  </select>
                  <ChevronDown
                    size={16}
                    strokeWidth={1.75}
                    className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[color:var(--deep)]"
                  />
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

export default function CategoryMapping() {
  const { session } = useAuth();
  const token: string | undefined = session?.access_token;
  const [categories, setCategories] = useState<AdminCategory[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [busy, setBusy] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let ignore = false;
    adminRequest<CategoriesResponse>("/categories", token)
      .then((data) => {
        if (!ignore) setCategories(data.categories);
      })
      .catch((err) => {
        if (!ignore) setLoadError(errorMessage(err));
      });
    return () => {
      ignore = true;
    };
  }, [token, reloadKey]);

  // backend คืนรายการล่าสุดทั้งหมดทุกครั้งที่แก้สำเร็จ
  async function run(request: () => Promise<CategoriesResponse>): Promise<boolean> {
    setBusy(true);
    setActionError("");
    try {
      setCategories((await request()).categories);
      return true;
    } catch (err) {
      setActionError(errorMessage(err));
      return false;
    } finally {
      setBusy(false);
    }
  }

  function saveCategory(categoryId: string, fields: CategoryFields) {
    return run(() =>
      adminRequest<CategoriesResponse>(`/categories/${categoryId}`, token, { method: "PUT", body: fields })
    );
  }

  function moveLabel(label: AdminCategoryLabel, toCategory: AdminCategory) {
    const ok = window.confirm(
      `ย้ายป้าย "${label.att_type_label}" (${label.place_count} แห่ง) ไปหมวด "${toCategory.category_name}"?\nสถานที่ที่มีป้ายนี้จะเปลี่ยนหมวดทันที`
    );
    if (!ok) return;
    void run(() =>
      adminRequest<CategoriesResponse>(`/categories/labels/${label.category_label_id}`, token, {
        method: "PUT",
        body: { category_id: toCategory.category_id },
      })
    );
  }

  return (
    <div className="fade-in">
      <h1 className="flex items-center gap-2 font-prompt font-semibold text-2xl sm:text-3xl text-[color:var(--navy)]">
        <Tags size={26} strokeWidth={1.75} />
        Category Mapping
      </h1>
      <p className="text-[color:var(--deep)] mt-1">
        หมวดของสถานที่มาจากป้ายประเภทของ ททท. — ย้ายป้ายไปหมวดอื่น หรือแก้ชื่อ กลุ่ม และค่าของหมวดได้
      </p>

      <div className="mt-4 flex gap-2 p-3 rounded-xl bg-[color:var(--sky-soft)] text-sm text-[color:var(--navy)]">
        <Info size={18} strokeWidth={1.75} className="shrink-0 mt-0.5" />
        <p>
          การแก้มีผลกับผู้ใช้ทุกคนทันที · คะแนนในหน้าแนะนำของทริปเดิมจะเปลี่ยนเมื่อคำนวณใหม่ ·
          ค่าใช้จ่ายในแผนที่ยืนยันแล้วไม่เปลี่ยน · "ฟรี" = คิดค่าเข้า 0 บาทในงบ
        </p>
      </div>

      {actionError && (
        <p role="alert" className="mt-4 flex items-center gap-2 text-sm text-[color:var(--danger)]">
          <TriangleAlert size={16} strokeWidth={1.75} />
          {actionError}
        </p>
      )}

      {loadError ? (
        <div role="alert" className="mt-6 flex flex-wrap items-center gap-3 text-[color:var(--danger)]">
          <TriangleAlert size={18} strokeWidth={1.75} />
          {loadError}
          <button
            type="button"
            onClick={() => {
              setLoadError("");
              setReloadKey((k) => k + 1);
            }}
            className="font-prompt text-sm font-medium min-h-10 px-4 rounded-xl border border-[color:var(--line)] bg-white text-[color:var(--navy)] hover:bg-[color:var(--sky-soft)]"
          >
            ลองใหม่
          </button>
        </div>
      ) : categories === null ? (
        <p className="mt-6 flex items-center gap-2 text-[color:var(--muted)]">
          <Loader2 size={18} strokeWidth={1.75} className="animate-spin" />
          กำลังโหลดหมวดหมู่...
        </p>
      ) : (
        CATEGORY_GROUPS.map((group) => {
          const groupCategories = categories.filter((c) => c.parent_group === group.value);
          return (
            <section key={group.value} className="mt-8">
              <h2 className="font-prompt font-semibold text-lg text-[color:var(--navy)] mb-3">
                {group.label} ({groupCategories.length} หมวด)
              </h2>
              <div className="flex flex-col gap-3">
                {groupCategories.map((category) => (
                  <CategoryCard
                    key={`${category.category_id}|${Object.values(fieldsOf(category)).join("|")}`}
                    category={category}
                    allCategories={categories}
                    busy={busy}
                    onSave={(fields) => saveCategory(category.category_id, fields)}
                    onMoveLabel={moveLabel}
                  />
                ))}
              </div>
            </section>
          );
        })
      )}
    </div>
  );
}
