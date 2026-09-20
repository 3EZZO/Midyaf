import { useMemo } from "react";
import { Command } from "cmdk";
import * as DialogPrimitive from "radix-ui/dialog";
import { ArrowLeft, ArrowRight, Search } from "lucide-react";
import type { PortalKey } from "@shared/domain";
import { COMMAND_ITEMS, type CommandItem } from "../lib/commandItems";
import { smoothScrollToSection } from "../lib/navigation";
import { cn } from "../lib/cn";
import { Kbd } from "./ui/Kbd";

interface QuickNavigatorProps {
  isOpen: boolean;
  onClose: () => void;
  isArabic: boolean;
  activePortal: PortalKey;
  allowedPortals: PortalKey[];
  onSelectPortal: (portal: PortalKey) => void;
  onToggleLanguage: () => void;
  isDemoMode?: boolean;
  onOpenWarRoom?: () => void;
  onExportPdf?: () => void;
  onSharePlan?: () => void;
}

const groupLabels = {
  portal: { en: "Portals", ar: "بوابات العمل" },
  section: { en: "Sections", ar: "أقسام العمليات" },
  action: { en: "Actions & Tools", ar: "إجراءات وأدوات" }
} as const;

/**
 * ⌘K command palette on cmdk + Radix Dialog: fuzzy filter, focus trap,
 * roving selection, Escape to close. Command data lives in lib/commandItems.
 */
export function QuickNavigator({
  isOpen,
  onClose,
  isArabic,
  activePortal,
  allowedPortals,
  onSelectPortal,
  onToggleLanguage,
  isDemoMode,
  onOpenWarRoom,
  onExportPdf,
  onSharePlan
}: QuickNavigatorProps) {
  const items = useMemo(
    () =>
      COMMAND_ITEMS.filter((item) => {
        if (item.demoOnly && !isDemoMode) return false;
        if (item.portalTarget && !allowedPortals.includes(item.portalTarget)) return false;
        if (item.category === "portal" && item.portalTarget === activePortal) return false;
        return true;
      }),
    [allowedPortals, activePortal, isDemoMode]
  );

  const groups = useMemo(
    () =>
      (["portal", "section", "action"] as const)
        .map((cat) => ({ cat, items: items.filter((i) => i.category === cat) }))
        .filter((g) => g.items.length),
    [items]
  );

  function run(item: CommandItem) {
    onClose();
    if (item.category === "portal" && item.portalTarget) {
      onSelectPortal(item.portalTarget);
      return;
    }
    if (item.category === "section" && item.sectionId) {
      if (item.portalTarget && item.portalTarget !== activePortal) {
        onSelectPortal(item.portalTarget);
        smoothScrollToSection(item.sectionId, 150);
      } else {
        smoothScrollToSection(item.sectionId, 30);
      }
      return;
    }
    switch (item.actionType) {
      case "export-pdf":
        onExportPdf?.();
        break;
      case "share-plan":
        onSharePlan?.();
        break;
      case "switch-lang":
        onToggleLanguage();
        break;
      case "war-room":
        onOpenWarRoom?.();
        break;
    }
  }

  const EnterArrow = isArabic ? ArrowLeft : ArrowRight;

  return (
    <DialogPrimitive.Root open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-palette bg-surface-0/70 backdrop-blur-sm animate-fade-in" />
        <DialogPrimitive.Content
          className={cn(
            "fixed inset-x-0 top-[12vh] z-palette mx-auto w-[calc(100vw-2rem)] max-w-2xl",
            "overflow-hidden rounded-lg border border-gold-500/30 bg-surface-2 shadow-dropdown animate-scale-in",
            "focus:outline-none"
          )}
        >
          <DialogPrimitive.Title className="sr-only">{isArabic ? "البحث السريع" : "Quick search"}</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            {isArabic ? "انتقل إلى بوابة أو قسم أو نفّذ إجراءً" : "Jump to a portal or section, or run an action"}
          </DialogPrimitive.Description>

          <Command
            label={isArabic ? "البحث السريع" : "Quick search"}
            loop
            filter={(value, search, keywords) => {
              const hay = `${value} ${keywords?.join(" ") ?? ""}`.toLowerCase();
              const q = search.toLowerCase().trim();
              if (!q) return 1;
              return q.split(/\s+/).every((t) => hay.includes(t)) ? 1 : 0;
            }}
          >
            <div className="flex items-center gap-3 border-b border-hairline px-4">
              <Search className="size-4 shrink-0 text-gold-500" aria-hidden />
              <Command.Input
                autoFocus
                placeholder={
                  isArabic
                    ? "ابحث عن أي بوابة، قسم، إعداد، أو إجراء سريع (مثال: عقود، CSV، خريطة، PDF)..."
                    : "Search any portal, section, setting or quick action (e.g. contracts, CSV, map, PDF)..."
                }
                className="h-14 w-full bg-transparent text-base text-ink placeholder:text-ink-faint focus:outline-none"
              />
              <Kbd>Esc</Kbd>
            </div>

            <Command.List className="max-h-[60vh] overflow-y-auto p-2">
              <Command.Empty className="px-4 py-10 text-center text-sm text-ink-muted">
                {isArabic ? "لم يتم العثور على نتائج مطابقة" : "No matching results"}
              </Command.Empty>

              {groups.map((group) => (
                <Command.Group
                  key={group.cat}
                  heading={isArabic ? groupLabels[group.cat].ar : groupLabels[group.cat].en}
                  className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-2 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-label [&_[cmdk-group-heading]]:text-ink-faint"
                >
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    return (
                      <Command.Item
                        key={item.id}
                        value={`${item.id} ${item.titleEn} ${item.titleAr}`}
                        keywords={[...item.keywordsEn, ...item.keywordsAr]}
                        onSelect={() => run(item)}
                        className={cn(
                          "group flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-ink",
                          "data-[selected=true]:bg-surface-3 data-[selected=true]:ring-1 data-[selected=true]:ring-inset data-[selected=true]:ring-gold-500/40"
                        )}
                      >
                        <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-hairline bg-surface-1 text-gold-500">
                          <Icon size={16} aria-hidden />
                        </span>
                        <span className="min-w-0 flex-1 truncate font-medium">{isArabic ? item.titleAr : item.titleEn}</span>
                        {item.shortcut ? <Kbd>{item.shortcut}</Kbd> : null}
                        <EnterArrow
                          className="size-4 shrink-0 text-ink-faint opacity-0 transition-opacity group-data-[selected=true]:opacity-100"
                          aria-hidden
                        />
                      </Command.Item>
                    );
                  })}
                </Command.Group>
              ))}
            </Command.List>

            <footer className="flex items-center justify-between gap-4 border-t border-hairline px-4 py-2.5 text-xs text-ink-faint">
              <span className="flex items-center gap-3">
                <span className="flex items-center gap-1">
                  <Kbd>↑</Kbd>
                  <Kbd>↓</Kbd> {isArabic ? "للتنقل" : "Navigate"}
                </span>
                <span className="flex items-center gap-1">
                  <Kbd>↵</Kbd> {isArabic ? "للاختيار" : "Select"}
                </span>
              </span>
              <span className="flex items-center gap-1.5">
                <span>{isArabic ? "نظام مضياف الذكي" : "Midyaf Fast Nav"}</span>
                <Kbd>Ctrl</Kbd>
                <Kbd>K</Kbd>
              </span>
            </footer>
          </Command>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
