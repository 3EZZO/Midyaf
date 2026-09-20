import { useState } from "react";
import { Banknote, Car, ClipboardList, Crown, Download, Plus, Radio, Search, Users } from "lucide-react";
import { useTranslation } from "react-i18next";
import { STATUS_META } from "@shared/statusMeta";
import {
  Badge,
  Button,
  DataTable,
  Dialog,
  EmptyState,
  Field,
  IconButton,
  IconTabNav,
  Input,
  Kbd,
  KpiTile,
  NumberInput,
  Section,
  Select,
  Sheet,
  Skeleton,
  SkeletonKpiRow,
  StatusPill,
  Surface,
  Switch,
  Textarea,
  useToast
} from "../components/ui";
import { PortalHero } from "../components/ui/PortalHero";
import { isArabicLanguage } from "../lib/localize";

/**
 * Dev-only gallery at #design. Every primitive and variant on one page so
 * the design system can be reviewed on the projector before it ships.
 */
export function DesignSystemPreview({ onLanguageToggle }: { onLanguageToggle: () => void }) {
  const { i18n } = useTranslation();
  const isArabic = isArabicLanguage(i18n.language);
  const toast = useToast();
  const [tab, setTab] = useState<"fleet" | "guests" | "contracts">("fleet");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [on, setOn] = useState(true);
  const [num, setNum] = useState<number | "">(12);
  const [kpi, setKpi] = useState(342000);

  const rows = [
    { id: "1", name: "سلطان العتيبي", plate: "RUH 4471", status: "EN_ROUTE", eta: 6 },
    { id: "2", name: "فهد القحطاني", plate: "RUH 1290", status: "ARRIVED", eta: 0 },
    { id: "3", name: "راكان الشهري", plate: "RUH 8813", status: "DELAYED", eta: 14 },
    { id: "4", name: "طارق الدوسري", plate: "RUH 2205", status: "AVAILABLE", eta: 0 }
  ];

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-8 px-5 py-8">
      <PortalHero
        badge={isArabic ? "نظام التصميم" : "Design system"}
        title={isArabic ? "معاينة مكونات مضياف" : "Midyaf component gallery"}
        body={isArabic ? "كل عنصر أساسي بكل حالاته على شاشة واحدة." : "Every primitive and every state on one screen."}
        action={
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onLanguageToggle}>
              {isArabic ? "English" : "العربية"}
            </Button>
            <Button variant="gold" leadingIcon={<Download className="size-4" />} onClick={() => toast.success("Exported", "PDF ready")}>
              {isArabic ? "تصدير" : "Export"}
            </Button>
          </div>
        }
      />

      <Section title={isArabic ? "الطباعة" : "Typography"} eyebrow="display / body">
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-3">
            <p className="text-display-xl text-ink">88</p>
            <p className="text-display-lg text-ink">1,950,000 ر.س</p>
            <p className="text-display-md text-ink">مركز القيادة</p>
            <p className="text-display-sm text-ink">Sovereign Command</p>
          </div>
          <div className="space-y-2 text-ink">
            <p className="text-xs font-semibold uppercase tracking-label text-ink-muted">Label · text-xs tracking-label</p>
            <p className="text-sm text-ink-muted">Muted body — text-sm text-ink-muted</p>
            <p className="text-base">Body — text-base. الأرقام دائماً غربية: 0123456789</p>
            <p className="text-lg font-semibold">Emphasis — text-lg</p>
            <p className="font-tnum text-base">Tabular: 1,234.56 · 9,876.54</p>
          </div>
        </div>
      </Section>

      <Section title={isArabic ? "الأزرار" : "Buttons"}>
        <div className="flex flex-wrap items-center gap-3">
          <Button>Primary</Button>
          <Button variant="gold">Gold</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger">Danger</Button>
          <Button loading>Loading</Button>
          <Button disabled>Disabled</Button>
          <Button size="sm">Small</Button>
          <Button size="lg" leadingIcon={<Plus className="size-4" />}>
            Large
          </Button>
          <Button size="xl" variant="gold">
            Projector XL
          </Button>
          <IconButton label={isArabic ? "بحث" : "Search"} variant="ghost">
            <Search className="size-4" />
          </IconButton>
          <Kbd>Ctrl</Kbd>
          <Kbd>K</Kbd>
        </div>
      </Section>

      <Section title={isArabic ? "مؤشرات الأداء" : "KPI tiles"} action={<Button size="sm" onClick={() => setKpi((v) => v + 12500)}>+12,500</Button>}>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <KpiTile label={isArabic ? "إجمالي العمولات" : "Total commission"} value={kpi} format="money" delta={18.4} sparkline={[3, 4, 3.5, 5, 6, 5.5, 7, 8]} icon={<Banknote className="size-4" />} tone="gold" />
          <KpiTile label={isArabic ? "استغلال الأسطول" : "Fleet utilisation"} value={86.5} format="percent" delta={-2.1} sparkline={[9, 8, 8.5, 7, 7.5, 8, 8.7]} icon={<Car className="size-4" />} />
          <KpiTile label={isArabic ? "الضيوف" : "Guests"} value={1200} format="compact" detail={isArabic ? "150 من كبار الشخصيات" : "150 VIP"} icon={<Users className="size-4" />} onClick={() => setDialogOpen(true)} />
          <KpiTile label={isArabic ? "المهام النشطة" : "Active tasks"} value={42} detail="derived" source="derived" icon={<ClipboardList className="size-4" />} tone="info" />
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <KpiTile size="lg" label="Large" value={98.2} format="percent" delta={0.6} />
          <KpiTile size="hero" label={isArabic ? "الالتزام بالوقت" : "On-time"} value={99.4} format="percent" tone="ok" sparkline={[97, 98, 98.5, 99, 99.4]} />
        </div>
      </Section>

      <Section title={isArabic ? "الشارات والحالات" : "Badges & status"}>
        <div className="flex flex-wrap gap-2">
          {(["ok", "warn", "danger", "info", "neutral", "gold"] as const).map((t) => (
            <Badge key={t} tone={t} dot>
              {t}
            </Badge>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {Object.keys(STATUS_META).map((k) => (
            <StatusPill key={k} status={k} />
          ))}
        </div>
      </Section>

      <Section title={isArabic ? "التبويبات" : "Icon tabs"}>
        <IconTabNav
          value={tab}
          onChange={setTab}
          tabs={[
            { id: "fleet", icon: Car, labelEn: "Fleet", labelAr: "الأسطول", badge: <Badge size="sm" tone="ok">12</Badge> },
            { id: "guests", icon: Users, labelEn: "Guests", labelAr: "الضيوف" },
            { id: "contracts", icon: Banknote, labelEn: "Contracts", labelAr: "العقود" }
          ]}
        />
        <p className="mt-3 text-sm text-ink-muted">Active: {tab}</p>
      </Section>

      <Section title={isArabic ? "الجداول" : "Data table"}>
        <DataTable
          rows={rows}
          rowKey={(r) => r.id}
          defaultSort={{ id: "eta", dir: "desc" }}
          onRowClick={(r) => toast.info(r.name, r.plate)}
          columns={[
            { id: "name", header: isArabic ? "الكابتن" : "Captain", cell: (r) => <span className="font-semibold">{r.name}</span>, sortValue: (r) => r.name },
            { id: "plate", header: isArabic ? "اللوحة" : "Plate", cell: (r) => <span className="font-mono">{r.plate}</span> },
            { id: "status", header: isArabic ? "الحالة" : "Status", cell: (r) => <StatusPill status={r.status} />, sortValue: (r) => r.status },
            { id: "eta", header: "ETA", cell: (r) => `${r.eta} min`, sortValue: (r) => r.eta, align: "end", numeric: true }
          ]}
        />
        <div className="mt-4">
          <DataTable rows={[]} rowKey={() => ""} columns={[{ id: "a", header: "A", cell: () => null }]} />
        </div>
      </Section>

      <Section title={isArabic ? "النماذج" : "Forms"}>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label={isArabic ? "اسم الضيف" : "Guest name"} required hint={isArabic ? "كما في جواز السفر" : "As on passport"}>
            <Input placeholder={isArabic ? "الاسم الكامل" : "Full name"} />
          </Field>
          <Field label={isArabic ? "عدد المرافقين" : "Companions"} error={num !== "" && num > 10 ? (isArabic ? "الحد الأقصى 10" : "Max 10") : undefined}>
            <NumberInput value={num} onChange={setNum} min={0} />
          </Field>
          <Field label={isArabic ? "المنطقة" : "Zone"}>
            <Select placeholder={isArabic ? "اختر" : "Choose"} defaultValue="" options={[{ value: "N", label: "North" }, { value: "C", label: "Central" }]} />
          </Field>
          <Field label={isArabic ? "ملاحظات" : "Notes"}>
            <Textarea placeholder="…" />
          </Field>
          <Switch checked={on} onCheckedChange={setOn} label={isArabic ? "مشاركة الموقع" : "Share location"} />
        </div>
      </Section>

      <Section title={isArabic ? "الحالات الفارغة والتحميل" : "Empty & loading"}>
        <div className="grid gap-4 lg:grid-cols-2">
          <Surface padding="none">
            <EmptyState icon={<Radio className="size-5" />} title={isArabic ? "لا توجد إشارات بعد" : "No signals yet"} description={isArabic ? "ستظهر التحديثات هنا فور وصولها." : "Updates appear here as they arrive."} action={<Button size="sm">Refresh</Button>} />
          </Surface>
          <div className="space-y-3">
            <SkeletonKpiRow count={2} />
            <Skeleton className="h-24 w-full" />
          </div>
        </div>
      </Section>

      <Section title={isArabic ? "الطبقات" : "Overlays"}>
        <div className="flex flex-wrap gap-3">
          <Button onClick={() => setDialogOpen(true)}>Dialog</Button>
          <Button onClick={() => setSheetOpen(true)}>Sheet</Button>
          <Button variant="ghost" onClick={() => toast.success("Saved", "Everything is in order")}>Toast · success</Button>
          <Button variant="ghost" onClick={() => toast.warning("Slow link")}>Toast · warning</Button>
          <Button variant="ghost" onClick={() => toast.alert("Convoy delayed", "Corridor B closed")}>Toast · alert</Button>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen} title={isArabic ? "ملف الضيف" : "Guest dossier"} description="Radix dialog with focus trap" footer={<div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setDialogOpen(false)}>Cancel</Button><Button variant="gold">Confirm</Button></div>}>
          <p className="text-sm text-ink-muted">Press Escape or click outside to close. Focus is trapped inside.</p>
          <Surface className="mt-4" tone="gold"><Crown className="size-5 text-gold-500" /><p className="mt-2 text-sm">Tone bar sits on the inline-start side.</p></Surface>
        </Dialog>
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen} title={isArabic ? "تفاصيل الرحلة" : "Trip details"}>
          <p className="text-sm text-ink-muted">Side panel from the inline-end edge; used on mobile for details.</p>
        </Sheet>
      </Section>
    </div>
  );
}
