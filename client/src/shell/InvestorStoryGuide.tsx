import { useId, useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  Compass,
  FileEdit,
  Keyboard,
  LockOpen,
  Shield
} from "lucide-react";
import type { DemoPersonaDto, DemoPersonaKey, DemoStatusDto } from "@shared/demo";
import type { PortalKey } from "@shared/domain";
import { cn } from "../lib/cn";
import { Kbd } from "../components/ui/Kbd";

export type StoryStepId = "plan" | "approve" | "vault" | "warroom";

export interface StoryStep {
  id: StoryStepId;
  step: number;
  personaKey: DemoPersonaKey;
  fallbackPortal: PortalKey;
  titleEn: string;
  titleAr: string;
  subtitleEn: string;
  subtitleAr: string;
  icon: typeof FileEdit;
}

export const INVESTOR_STORY_STEPS: StoryStep[] = [
  {
    id: "plan",
    step: 1,
    personaKey: "company",
    fallbackPortal: "company",
    titleEn: "Edit AI Plan",
    titleAr: "تعديل خطة الذكاء",
    subtitleEn: "Organizer workspace · human-in-the-loop",
    subtitleAr: "مساحة المنظم · تعديل واعتماد بشري",
    icon: FileEdit
  },
  {
    id: "approve",
    step: 2,
    personaKey: "client",
    fallbackPortal: "client",
    titleEn: "Client 1-Click Approve",
    titleAr: "اعتماد العميل بنقرة",
    subtitleEn: "Client portal · ceremonial brass seal",
    subtitleAr: "بوابة العميل · ختم الاعتماد الرسمي",
    icon: CheckCircle2
  },
  {
    id: "vault",
    step: 3,
    personaKey: "admin",
    fallbackPortal: "admin",
    titleEn: "Sealed Quote & Vault",
    titleAr: "العروض المختومة والخزنة",
    subtitleEn: "Super Admin D-011 key · bid comparison",
    subtitleAr: "مفتاح المشرف العام · مقارنة العروض",
    icon: LockOpen
  },
  {
    id: "warroom",
    step: 4,
    personaKey: "logistics",
    fallbackPortal: "sila_operations",
    titleEn: "Live War Room",
    titleAr: "غرفة العمليات المباشرة",
    subtitleEn: "Riyadh convoy radar · Noura AI brief",
    subtitleAr: "رادار المواكب بالرياض · إحاطة نورة",
    icon: Shield
  }
];

export function activeStoryStep(
  portal: PortalKey,
  isWarRoomOpen?: boolean
): StoryStepId | null {
  if (isWarRoomOpen) return "warroom";
  if (portal === "company") return "plan";
  if (portal === "client") return "approve";
  if (portal === "admin" || portal === "supplier") return "vault";
  if (portal === "sila_operations") return "warroom";
  return null;
}

/**
 * Optional collapsible 4-step presenter guide rendered ONLY when Investor Demo
 * mode (`investorDemoStatus?.canSwitch`) is active. Starts collapsed so it adds
 * zero visual clutter to regular workspace views.
 */
export function InvestorStoryGuide({
  status,
  portal,
  isArabic,
  isWarRoomOpen,
  busy = false,
  defaultOpen = false,
  onSwitchPersona,
  onSelectPortal,
  onLaunchWarRoom,
  onOpenShortcuts
}: {
  status: DemoStatusDto;
  portal: PortalKey;
  isArabic: boolean;
  isWarRoomOpen?: boolean;
  busy?: boolean;
  defaultOpen?: boolean;
  onSwitchPersona: (persona: DemoPersonaDto) => Promise<void> | void;
  onSelectPortal: (portal: PortalKey) => void;
  onLaunchWarRoom?: () => void;
  onOpenShortcuts?: () => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = `investor-story-${useId().replace(/:/g, "")}`;
  const currentStep = activeStoryStep(portal, isWarRoomOpen);

  function handleStepClick(step: StoryStep) {
    if (step.id === "warroom" && onLaunchWarRoom) {
      onLaunchWarRoom();
      return;
    }
    const targetPersona = status.personas.find(
      (p) => p.key === step.personaKey && p.available
    );
    if (targetPersona && status.activePersona !== targetPersona.key) {
      void onSwitchPersona(targetPersona);
    } else {
      onSelectPortal(step.fallbackPortal);
    }
  }

  return (
    <div
      data-investor-story-guide
      data-story-open={open ? "true" : "false"}
      className="border-b border-hairline bg-surface-1/95 px-4 py-1.5 text-xs lg:px-6"
    >
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            aria-expanded={open}
            aria-controls={panelId}
            data-story-guide-toggle
            onClick={() => setOpen((prev) => !prev)}
            className="inline-flex items-center gap-2 rounded-md px-1.5 py-1 text-xs font-semibold text-ink-muted transition-colors hover:text-ink focus-visible:outline-none focus-visible:shadow-focus"
          >
            <Compass className="size-3.5 text-gold-500" aria-hidden />
            <span className="text-gold-300">
              {isArabic ? "دليل عرض المستثمرين" : "Investor Story Guide"}
            </span>
            <span className="hidden text-ink-faint sm:inline">
              {isArabic ? "· 4 خطوات تفاعلية" : "· 4 guided chapters"}
            </span>
            <ChevronDown
              className={cn(
                "size-3.5 text-ink-faint transition-transform duration-base motion-reduce:transition-none",
                open && "rotate-180"
              )}
              aria-hidden
            />
          </button>

          {onOpenShortcuts ? (
            <button
              type="button"
              data-open-presenter-shortcuts
              onClick={onOpenShortcuts}
              className="hidden items-center gap-1.5 rounded-md border border-hairline bg-surface-2 px-2 py-1 text-xs font-medium text-ink-muted transition-colors hover:border-gold-500/40 hover:text-ink focus-visible:outline-none focus-visible:shadow-focus md:inline-flex"
            >
              <Keyboard className="size-3.5 text-gold-500" aria-hidden />
              <span>{isArabic ? "الاختصارات" : "Shortcuts"}</span>
              <Kbd>?</Kbd>
            </button>
          ) : null}
        </div>

        {open ? (
          <ol
            id={panelId}
            className="mt-2 grid grid-cols-1 gap-2 pb-1.5 sm:grid-cols-2 lg:grid-cols-4"
          >
            {INVESTOR_STORY_STEPS.map((step) => {
              const Icon = step.icon;
              const active = currentStep === step.id;
              return (
                <li key={step.id} className="min-w-0">
                  <button
                    type="button"
                    disabled={busy}
                    data-story-step={step.id}
                    aria-current={active ? "step" : undefined}
                    onClick={() => handleStepClick(step)}
                    className={cn(
                      "flex w-full min-w-0 items-start gap-2.5 rounded-lg border px-3 py-2 text-start transition-colors",
                      "focus-visible:outline-none focus-visible:shadow-focus disabled:opacity-40",
                      active
                        ? "border-gold-500/60 bg-gold-500/12 text-ink"
                        : "border-hairline bg-surface-2 text-ink-muted hover:border-gold-500/40 hover:text-ink"
                    )}
                  >
                    <span
                      className={cn(
                        "mt-0.5 grid size-6 shrink-0 place-items-center rounded-md",
                        active
                          ? "bg-gold-500 text-surface-0"
                          : "bg-surface-3 text-gold-500"
                      )}
                      aria-hidden
                    >
                      <Icon className="size-3.5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold text-ink">
                        {step.step}. {isArabic ? step.titleAr : step.titleEn}
                      </span>
                      <span className="block truncate text-xs text-ink-muted">
                        {isArabic ? step.subtitleAr : step.subtitleEn}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        ) : null}
      </div>
    </div>
  );
}
