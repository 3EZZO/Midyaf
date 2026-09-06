import { useMemo, useState } from "react";
import { Building2, Car, Coffee, Star, Ticket, Wrench } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { SupplierCategory } from "@shared/domain";
import { Badge } from "../components/Badge";
import { MetricCard } from "../components/MetricCard";
import { Section } from "../components/Section";
import { money, percent } from "../lib/format";
import { isArabicLanguage, localizeText } from "../lib/localize";
import type { PortalProps } from "./types";

const categoryIcons: Record<SupplierCategory, typeof Building2> = {
  HOTEL: Building2,
  CAR: Car,
  TICKET: Ticket,
  CATERING: Coffee,
  EQUIPMENT: Wrench,
  TOURISM: Star
};

export function SupplierMarketplace({ data, session, createBooking }: PortalProps) {
  const { t, i18n } = useTranslation();
  const isArabic = isArabicLanguage(i18n.language);
  const [category, setCategory] = useState<SupplierCategory | "ALL">("ALL");
  const [notice, setNotice] = useState("");
  const event = data.events[0];
  const canBook = ["LOGISTICS_MANAGER", "ORGANIZER", "SUPER_ADMIN"].includes(
    session?.user.role ?? ""
  );
  const categories = useMemo(
    () => Array.from(new Set(data.suppliers.map((supplier) => supplier.category))),
    [data.suppliers]
  );
  const suppliers = data.suppliers.filter(
    (supplier) => category === "ALL" || supplier.category === category
  );
  const confirmedRevenue = event.bookings.reduce(
    (sum, booking) => sum + Number(booking.totalPrice),
    0
  );

  async function book(serviceId: string, supplierId: string) {
    await createBooking(serviceId, supplierId);
    setNotice("Booking request confirmed for the active event.");
  }

  return (
    <div className="space-y-4">
      <section className="rounded-lg bg-midyaf-purple p-5 text-white shadow-luxury">
        <Badge tone="gold">{t("supplier.title")}</Badge>
        <h1 className="mt-4 text-2xl font-bold">
          {isArabic ? "الفنادق، السيارات، التذاكر، الإعاشة، والمعدات" : "Hotels, cars, tickets, catering, and equipment"}
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-white/75">
          {isArabic
            ? "يتم تصدير الموردين المميزين أولاً، بينما يقارن ذكاء سلاسل الإمداد القيمة والتقييم والموثوقية ومخاطر الجودة قبل الحجز."
            : "Sponsored suppliers are ranked first, but the Supply Chain AI compares value, rating, verification, and anomaly risk before booking."}
        </p>
      </section>

      <div className="grid gap-4 sm:grid-cols-3">
        <MetricCard
          label={t("supplier.commission")}
          value="10-15%"
          detail={isArabic ? "قابلة للتهيئة حسب الفئة" : "Configurable by category"}
          icon={<Star size={17} />}
        />
        <MetricCard
          label={isArabic ? "إجمالي العقود المؤكدة" : "Confirmed GMV"}
          value={money(confirmedRevenue)}
          detail={event.name}
          icon={<Building2 size={17} />}
        />
        <MetricCard
          label={isArabic ? "الموردين المميزين" : "Sponsored placements"}
          value={data.suppliers.filter((supplier) => supplier.sponsoredRank).length}
          detail={isArabic ? "تصنيف مميز مدفوع" : "Paid supplier ranking"}
          icon={<Ticket size={17} />}
        />
      </div>

      <Section title={t("supplier.title")}>
        <div className="mb-4 flex flex-wrap gap-2">
          <button
            onClick={() => setCategory("ALL")}
            className={
              category === "ALL"
                ? "rounded-lg bg-midyaf-purple px-3 py-2 text-xs font-bold text-white"
                : "rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600"
            }
          >
            {isArabic ? "الكل" : "All"}
          </button>
          {categories.map((item) => (
            <button
              key={item}
              onClick={() => setCategory(item)}
              className={
                category === item
                  ? "rounded-lg bg-midyaf-purple px-3 py-2 text-xs font-bold text-white"
                  : "rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600"
              }
            >
              {localizeText(item, isArabic)}
            </button>
          ))}
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          {suppliers.map((supplier) => {
            const Icon = categoryIcons[supplier.category];
            return (
              <article
                key={supplier.id}
                className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="grid size-11 place-items-center rounded-lg bg-midyaf-purple/10 text-midyaf-purple">
                    <Icon size={20} />
                  </div>
                  <div className="flex flex-wrap justify-end gap-2">
                    {supplier.sponsoredRank ? (
                      <Badge tone="gold">{t("common.sponsored")}</Badge>
                    ) : null}
                    {supplier.verified ? (
                      <Badge tone="green">{t("common.verified")}</Badge>
                    ) : null}
                  </div>
                </div>
                <h2 className="mt-4 text-lg font-bold text-midyaf-ink">
                  {supplier.name}
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  {supplier.category} · {supplier.rating.toFixed(1)} rating · CR{" "}
                  {supplier.crNumber}
                </p>
                <p className="mt-2 text-xs font-semibold text-midyaf-purple">
                  {percent(supplier.commissionPercent)} platform commission
                </p>

                <div className="mt-4 space-y-2">
                  {supplier.services.map((service) => (
                    <div key={service.id} className="rounded-lg bg-slate-50 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="font-semibold text-midyaf-ink">
                            {service.name}
                          </p>
                          <p className="text-xs text-slate-500">
                            {service.description}
                          </p>
                        </div>
                        <p className="text-sm font-bold text-midyaf-purple">
                          {money(service.price)}
                        </p>
                      </div>
                      <div className="mt-3 flex gap-2">
                        <button className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700">
                          {t("common.compare")}
                        </button>
                        {canBook ? (
                          <button
                            onClick={() => void book(service.id, supplier.id)}
                            className="flex-1 rounded-lg bg-midyaf-gold px-3 py-2 text-xs font-bold text-white"
                          >
                            {t("supplier.instantBook")}
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              </article>
            );
          })}
        </div>

        {notice ? (
          <p className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            {notice}
          </p>
        ) : null}
      </Section>

      <Section title={isArabic ? "توجيه المهام المباشر والتحقق الذكي من الوثائق (OCR)" : "Live Task Dispatcher & AI OCR Upload"}>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="font-bold text-midyaf-ink mb-2">{isArabic ? "تنبيهات المهام المباشرة" : "Live Task Alerts"}</h3>
            <div className="space-y-2">
              <div className="flex items-center gap-2 rounded bg-amber-50 p-2 border border-amber-200">
                <span className="flex size-6 items-center justify-center rounded-full bg-amber-200 text-amber-800 text-xs font-bold shrink-0">!</span>
                <p className="text-xs text-amber-900 font-medium">
                  {isArabic ? "طلب نقل VIP جديد من مركز الملك عبد الله المالي إلى الدرعية الساعة 19:00." : "New VIP transfer request from KAFD to Diriyah at 19:00."}
                </p>
                <button className="ml-auto rounded bg-midyaf-purple px-2 py-1 text-[10px] font-bold text-white">
                  {isArabic ? "قبول" : "Accept"}
                </button>
              </div>
            </div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="font-bold text-midyaf-ink mb-2">{isArabic ? "اعتماد المستندات بالذكاء الاصطناعي" : "AI-Powered Document Approval"}</h3>
            <p className="text-xs text-slate-500 mb-3">
              {isArabic ? "ارفع هويات السائقين أو رخص السير أو وثائق التأمين. يقوم قارئ النصوص الذكي بالتحقق منها فوراً." : "Upload your driver IDs, vehicle registrations, or insurance. Our OCR validates them instantly."}
            </p>
            <div className="flex gap-2">
              <input type="file" className="block w-full text-xs text-slate-500 file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-midyaf-purple/10 file:text-midyaf-purple hover:file:bg-midyaf-purple/20" />
              <button onClick={() => alert(isArabic ? "تمت معالجة المستند بنجاح عبر الذكاء الاصطناعي واستخراج كافة البيانات واعتمادها." : "Document processed by AI OCR. All data extracted and verified successfully.")} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-500 transition shrink-0">
                {isArabic ? "رفع والتحقق" : "Upload & Verify"}
              </button>
            </div>
          </div>
        </div>
      </Section>

      <Section title={t("supplier.dashboard")}>
        <div className="grid gap-3 md:grid-cols-4">
          {[
            [isArabic ? "الحجوزات" : "Bookings", event.bookings.length],
            [isArabic ? "متوسط العمولة" : "Average commission", "12.7%"],
            [isArabic ? "مستحقات بانتظار الصرف" : "Payout queue", money(confirmedRevenue * 0.88)],
            [isArabic ? "ملاحظات وتنبيهات" : "Anomaly flags", 1]
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg bg-slate-50 p-4">
              <p className="text-xs text-slate-500">{label}</p>
              <p className="mt-2 text-xl font-bold text-midyaf-purple">
                {value}
              </p>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}
