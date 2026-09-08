import { useState } from "react";
import { 
  Plane, 
  Car, 
  Users, 
  Zap, 
  Truck, 
  Building, 
  Hotel, 
  CheckCircle2, 
  Sparkles, 
  ChevronDown, 
  ChevronUp, 
  ShieldCheck, 
  TrendingDown, 
  Layers 
} from "lucide-react";
import type { CategoryPriceRange, VendorQuote, SupplierCategory } from "@shared/domain";
import { money } from "../lib/format";

interface CategoryPriceRangeCardProps {
  priceRanges: CategoryPriceRange[];
  vendorQuotes: VendorQuote[];
  isArabic: boolean;
}

const CATEGORY_ICON_MAP: Record<SupplierCategory, any> = {
  AIRLINE: Plane,
  VEHICLE_BROKERAGE: Car,
  CAR_RENTAL: Car,
  MAN_POWER: Users,
  GOLF_CARTS: Zap,
  HEAVY_TRUCKS: Truck,
  HEAVY_EQUIPMENT: Building,
  HOTEL: Hotel,
  CAR: Car,
  TICKET: Layers,
  CATERING: Sparkles,
  EQUIPMENT: Building,
  TOURISM: Sparkles
};

export function CategoryPriceRangeSection({
  priceRanges,
  vendorQuotes,
  isArabic
}: CategoryPriceRangeCardProps) {
  const [expandedCategory, setExpandedCategory] = useState<SupplierCategory | null>(null);

  const toggleCategory = (cat: SupplierCategory) => {
    setExpandedCategory((prev) => (prev === cat ? null : cat));
  };

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-luxury dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <div className="grid size-8 place-items-center rounded-lg bg-midyaf-purple/10 text-midyaf-purple dark:bg-purple-500/20 dark:text-purple-300">
              <TrendingDown size={17} />
            </div>
            <h3 className="text-base font-black text-midyaf-purple dark:text-white">
              {isArabic ? "مؤشر نطاقات الأسعار التنافسية (عروض الموردين)" : "Supplier Quotation Price Ranges"}
            </h3>
          </div>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {isArabic 
              ? "تحليل وتجميع عروض الأسعار المقدمة من الموردين عبر الفئات الـ 8 لتحديد أفضل نطاق سعري للشركة المنظمة"
              : "Aggregated price ranges and best available value tiers across all 8 supplier categories"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-lg bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300">
            {isArabic ? "35 عرض سعر نشط · 8 فئات" : "35 Active Bids · 8 Categories"}
          </span>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {priceRanges.map((range) => {
          const IconComponent = CATEGORY_ICON_MAP[range.category] || Layers;
          const isExpanded = expandedCategory === range.category;

          const categoryQuotes = vendorQuotes.filter((q) => {
            if (q.category === range.category) return true;
            if (range.category === "HOTEL" && q.category === "HOTEL_OPERATOR") return true;
            if (range.category === "CAR_RENTAL" && (q.category === "CAR" || q.category === "CAR_RENTAL")) return true;
            return false;
          });

          return (
            <div
              key={range.category}
              className="flex flex-col justify-between rounded-xl border border-slate-100 bg-slate-50/60 p-4 transition-all hover:border-midyaf-gold/40 hover:bg-white hover:shadow-card-sm dark:border-slate-800 dark:bg-slate-800/40 dark:hover:bg-slate-800"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="grid size-8 place-items-center rounded-lg bg-midyaf-gold/15 text-midyaf-gold ring-1 ring-midyaf-gold/30">
                      <IconComponent size={16} />
                    </div>
                    <div>
                      <h4 className="text-xs font-black text-midyaf-purple dark:text-white">
                        {isArabic ? range.categoryNameAr : range.categoryNameEn}
                      </h4>
                      <p className="text-[10px] text-slate-400">
                        {range.quoteCount} {isArabic ? "عروض متنافسة" : "bids evaluated"}
                      </p>
                    </div>
                  </div>
                  <span className="rounded-md bg-white px-2 py-0.5 text-[10px] font-bold text-midyaf-purple shadow-xs ring-1 ring-slate-200 dark:bg-slate-700 dark:text-slate-200">
                    {range.currency}
                  </span>
                </div>

                <div className="mt-4 space-y-2">
                  <div className="flex items-baseline justify-between text-xs">
                    <span className="text-[11px] text-slate-500">{isArabic ? "النطاق السعري:" : "Price Range:"}</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200">
                      {money(range.minPrice)} – {money(range.maxPrice)}
                    </span>
                  </div>

                  {/* Visual Range bar */}
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                    <div 
                      className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-midyaf-gold" 
                      style={{ width: "100%" }}
                    />
                  </div>

                  <div className="flex items-baseline justify-between pt-1 text-xs">
                    <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                      <Sparkles size={11} />
                      {isArabic ? "أفضل قيمة متوفرة:" : "Best Available Tier:"}
                    </span>
                    <span className="font-black text-emerald-600 dark:text-emerald-400">
                      {money(range.bestTierPrice)}
                    </span>
                  </div>

                  <div className="flex items-baseline justify-between text-[11px] text-slate-400">
                    <span>{isArabic ? "متوسط السوق:" : "Market Average:"}</span>
                    <span>{money(range.avgPrice)}</span>
                  </div>
                </div>
              </div>

              <div className="mt-4 border-t border-slate-100 pt-3 dark:border-slate-700/60">
                <button
                  type="button"
                  onClick={() => toggleCategory(range.category)}
                  className="flex w-full items-center justify-between text-[11px] font-bold text-midyaf-purple hover:text-midyaf-gold dark:text-purple-300 cursor-pointer"
                >
                  <span>{isArabic ? "استعراض عروض الشركات (4–5)" : "View Company Bids (4–5)"}</span>
                  {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>

                {isExpanded && (
                  <div className="mt-2.5 space-y-2 animate-fadeInUp">
                    {categoryQuotes.map((q) => (
                      <div
                        key={q.id}
                        className={`rounded-lg border p-2 text-[11px] ${
                          q.status === "APPROVED"
                            ? "border-emerald-500/40 bg-emerald-50/70 dark:bg-emerald-950/30"
                            : q.status === "RECOMMENDED"
                            ? "border-amber-500/30 bg-amber-50/50 dark:bg-amber-950/20"
                            : "border-slate-200/70 bg-white dark:border-slate-700 dark:bg-slate-800"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-800 dark:text-white truncate">
                            {q.vendorName}
                          </span>
                          <span className="font-black text-midyaf-purple dark:text-purple-300">
                            {money(q.totalPrice)}
                          </span>
                        </div>
                        <p className="mt-0.5 text-[10px] text-slate-500 truncate">
                          {q.item}
                        </p>
                        <div className="mt-1 flex items-center justify-between text-[9px]">
                          <span className="flex items-center gap-0.5 text-emerald-600 font-bold">
                            <ShieldCheck size={10} />
                            {isArabic ? "سجل تجاري معتمد" : "Verified CR"} · {q.score}%
                          </span>
                          <span className={`font-bold uppercase ${
                            q.status === "APPROVED" ? "text-emerald-600" : q.status === "RECOMMENDED" ? "text-amber-600" : "text-slate-400"
                          }`}>
                            {q.status}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
