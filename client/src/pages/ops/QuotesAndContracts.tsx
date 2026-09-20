// Vendor quotes and contract workflow.
// Extracted verbatim from OperationsPortals.tsx (Phase 1 split).
import { useEffect, useState } from "react";
import { CheckCircle2, Crown, FileText, Key, Lock, RotateCcw, ShieldCheck, Sparkles, Unlock, X } from "lucide-react";
import { Badge } from "../../components/Badge";
import { useTacticalToast } from "../../components/TacticalToast";
import { Section } from "../../components/Section";
import { money, percent } from "../../lib/format";
import { DEMO_CONTRACTS } from "../../lib/useLiveDemoSimulation";
import type { DemoContract } from "../../lib/useLiveDemoSimulation";
import type { PortalProps } from "../types";
import { MiniStat, useOpsText } from "./shared";

export function QuotesAndContracts({
  data,
  canManage = false,
  isDemoMode = false,
  onApproveVendorQuote,
  onApproveContract
}: Pick<PortalProps, "data"> & {
  canManage?: boolean;
  isDemoMode?: boolean;
  onApproveVendorQuote?: PortalProps["approveVendorQuote"];
  onApproveContract?: PortalProps["approveContract"];
}) {
  const ui = useOpsText();
  const toast = useTacticalToast();
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [selectedDemoContract, setSelectedDemoContract] = useState<DemoContract | null>(null);

  useEffect(() => {
    if (!selectedDemoContract) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSelectedDemoContract(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [selectedDemoContract]);

  // Triple-Key Security Vault state for Anti-Corruption protocol
  const hasSealedQuotes = data.vendorQuotes.some((q) => q.isVaultSealed);
  const [vaultState, setVaultState] = useState({
    key1: !hasSealedQuotes,
    key2: !hasSealedQuotes,
    key3: !hasSealedQuotes,
    isUnlocked: !hasSealedQuotes
  });

  const isVaultLocked = !vaultState.isUnlocked;

  function turnKey(keyNum: 1 | 2 | 3) {
    setVaultState((prev) => {
      const next = { ...prev };
      if (keyNum === 1) next.key1 = true;
      if (keyNum === 2) next.key2 = true;
      if (keyNum === 3) next.key3 = true;
      if (next.key1 && next.key2 && next.key3) {
        next.isUnlocked = true;
        toast.success(
          ui.isArabic ? "تم فك تشفير الخزنة الثلاثية بنجاح" : "Triple-Key Security Vault Unlocked",
          ui.isArabic ? "كافة العروض المشفرة أصبحت متاحة للاعتماد" : "All procurement bids unmasked"
        );
      } else {
        toast.info(
          ui.isArabic ? `تم تدوير المفتاح الأمني ${keyNum}` : `Security Key ${keyNum} Turned`,
          ui.isArabic ? "بانتظار بقية التواقيع المعتمدة" : "Awaiting remaining multi-sig keys"
        );
      }
      return next;
    });
  }

  function turnAllKeys() {
    setVaultState({
      key1: true,
      key2: true,
      key3: true,
      isUnlocked: true
    });
    toast.success(
      ui.isArabic ? "تم فك تشفير الخزنة الثلاثية فورياً" : "Vault Instantly Unmasked",
      ui.isArabic ? "تم التحقق من كافة المفاتيح الأمنية الثلاثة" : "All 3 cryptographic keys validated"
    );
  }

  function resetVault() {
    setVaultState({
      key1: false,
      key2: false,
      key3: false,
      isUnlocked: false
    });
    toast.info(
      ui.isArabic ? "تم إعادة قفل وتشفير الخزنة الثلاثية" : "Vault Sealed & Re-Encrypted",
      ui.isArabic ? "عروض الأسعار محمية ببروتوكول النزاهة" : "Bids secured under anti-corruption lock"
    );
  }

  const totalCommission = data.vendorQuotes.reduce(
    (sum, quote) => sum + Number(quote.commissionAmount),
    0
  );

  async function handleApproveQuote(quoteId: string) {
    if (!onApproveVendorQuote) {
      return;
    }

    setPendingAction(quoteId);
    try {
      await onApproveVendorQuote(quoteId);
      const quote = data.vendorQuotes.find((q) => q.id === quoteId);
      toast.success(
        ui.isArabic ? "تم اعتماد عرض السعر بنجاح" : "Vendor Quote Approved",
        `${quote ? ui.l(quote.vendorName) : quoteId}`
      );
    } finally {
      setPendingAction(null);
    }
  }

  async function handleApproveContract(contractId: string) {
    if (!onApproveContract) {
      return;
    }

    setPendingAction(contractId);
    try {
      await onApproveContract(contractId);
      toast.success(
        ui.isArabic ? "تم توقيع واعتماد العقد بنجاح" : "Contract Approved & Sealed",
        contractId
      );
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <Section title={ui.l("Vendor quotations, contracts, and commissions")}>
      {/* Triple-Key Anti-Corruption Security Vault Banner */}
      <div id="triple-key-vault" className="mb-6 scroll-mt-6 overflow-hidden rounded-lg border border-emerald-500/30 bg-gradient-to-br from-slate-900 via-slate-800 to-emerald-950 p-5 text-white shadow-xl transition-all duration-500">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-emerald-500/20 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500/40">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="font-bold tracking-wide text-white md:text-base">
                  {ui.l("Midyaf Anti-Corruption Vault: Multi-Party Authorization")}
                </h4>
                <span className="rounded-md bg-amber-400/20 px-2 py-0.5 text-xs font-bold text-amber-300 ring-1 ring-amber-400/30">
                  {ui.l("PATENT-PENDING")}
                </span>
              </div>
              <p className="text-xs text-slate-300">
                {ui.l(
                  "Vendor bids are cryptographically sealed to eliminate procurement corruption. Requires 2 Organizer keys + 1 Midyaf auditor key."
                )}
              </p>
            </div>
          </div>

          <div>
            {vaultState.isUnlocked ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/40 bg-emerald-500/20 px-3 py-1 text-xs font-bold text-emerald-300">
                <Unlock className="h-3.5 w-3.5" />
                {ui.l("VAULT UNLOCKED & AUDITED")}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/20 px-3 py-1 text-xs font-bold text-amber-300">
                <Lock className="h-3.5 w-3.5 animate-pulse" />
                {ui.l("3-KEY SEAL ACTIVE")}
              </span>
            )}
          </div>
        </div>

        {/* The Three Keys Grid */}
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {/* Key 1 */}
          <div
            className={`flex flex-col justify-between rounded-xl border p-3 transition-all ${
              vaultState.key1
                ? "border-emerald-500/50 bg-emerald-950/40 text-emerald-200"
                : "border-slate-700 bg-slate-800/60 text-slate-300"
            }`}
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold text-slate-400">
                  {ui.l("Key 1: Organizer Ops")}
                </p>
                <p className="text-sm font-bold text-white">
                  {ui.l("Sila Operations Director")}
                </p>
              </div>
              <Key
                className={`h-5 w-5 ${
                  vaultState.key1 ? "text-emerald-400" : "text-slate-500"
                }`}
              />
            </div>
            <div className="mt-3 flex items-center justify-between">
              <span className="text-xs">
                {vaultState.key1 ? (
                  <span className="font-semibold text-emerald-400 flex items-center gap-1">
                    <CheckCircle2 size={13} className="shrink-0" />
                    <span>{ui.l("Key Turned (Khalid Al-Omar)")}</span>
                  </span>
                ) : (
                  <span className="text-slate-400">{ui.l("Awaiting turn")}</span>
                )}
              </span>
              {!vaultState.key1 && (
                <button
                  onClick={() => turnKey(1)}
                  className="rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-500"
                >
                  {ui.l("Turn Key 1")}
                </button>
              )}
            </div>
          </div>

          {/* Key 2 */}
          <div
            className={`flex flex-col justify-between rounded-xl border p-3 transition-all ${
              vaultState.key2
                ? "border-emerald-500/50 bg-emerald-950/40 text-emerald-200"
                : "border-slate-700 bg-slate-800/60 text-slate-300"
            }`}
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold text-slate-400">
                  {ui.l("Key 2: Organizer Finance")}
                </p>
                <p className="text-sm font-bold text-white">
                  {ui.l("Sila Procurement / Finance")}
                </p>
              </div>
              <Key
                className={`h-5 w-5 ${
                  vaultState.key2 ? "text-emerald-400" : "text-slate-500"
                }`}
              />
            </div>
            <div className="mt-3 flex items-center justify-between">
              <span className="text-xs">
                {vaultState.key2 ? (
                  <span className="font-semibold text-emerald-400 flex items-center gap-1">
                    <CheckCircle2 size={13} className="shrink-0" />
                    <span>{ui.l("Key Turned (Noura Al-Saud)")}</span>
                  </span>
                ) : (
                  <span className="text-slate-400">{ui.l("Awaiting turn")}</span>
                )}
              </span>
              {!vaultState.key2 && (
                <button
                  onClick={() => turnKey(2)}
                  className="rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-500"
                >
                  {ui.l("Turn Key 2")}
                </button>
              )}
            </div>
          </div>

          {/* Key 3 */}
          <div
            className={`flex flex-col justify-between rounded-xl border p-3 transition-all ${
              vaultState.key3
                ? "border-emerald-500/50 bg-emerald-950/40 text-emerald-200"
                : "border-slate-700 bg-slate-800/60 text-slate-300"
            }`}
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold text-slate-400">
                  {ui.l("Key 3: Midyaf Compliance")}
                </p>
                <p className="text-sm font-bold text-white">
                  {ui.l("Midyaf Compliance Auditor")}
                </p>
              </div>
              <Key
                className={`h-5 w-5 ${
                  vaultState.key3 ? "text-emerald-400" : "text-slate-500"
                }`}
              />
            </div>
            <div className="mt-3 flex items-center justify-between">
              <span className="text-xs">
                {vaultState.key3 ? (
                  <span className="font-semibold text-emerald-400 flex items-center gap-1">
                    <CheckCircle2 size={13} className="shrink-0" />
                    <span>{ui.l("Key Turned (Audit Team)")}</span>
                  </span>
                ) : (
                  <span className="text-slate-400">{ui.l("Awaiting turn")}</span>
                )}
              </span>
              {!vaultState.key3 && (
                <button
                  onClick={() => turnKey(3)}
                  className="rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-500"
                >
                  {ui.l("Turn Key 3")}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Vault Controls & Audit Footer */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-700/60 pt-3 text-xs">
          {vaultState.isUnlocked ? (
            <p className="flex items-center gap-1.5 text-emerald-300">
              <CheckCircle2 className="h-4 w-4" />
              {ui.l(
                "Audit Entry #MIDYAF-SEC-2027 confirmed. Quotations decrypted for transparent selection."
              )}
            </p>
          ) : (
            <p className="text-amber-300">
              {ui.l(
                "All 3 keys required simultaneously. Quotation amounts are locked and encrypted."
              )}
            </p>
          )}

          <div className="flex items-center gap-2">
            {!vaultState.isUnlocked && (
              <button
                onClick={turnAllKeys}
                className="flex items-center gap-1 rounded-lg bg-amber-500/20 px-3 py-1.5 text-xs font-bold text-amber-300 ring-1 ring-amber-400/40 hover:bg-amber-500/30"
              >
                <Sparkles className="h-3.5 w-3.5" />
                {ui.l("Authorize All Keys (Emergency Protocol)")}
              </button>
            )}
            <button
              onClick={resetVault}
              className="flex items-center gap-1 rounded-lg bg-slate-700 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-600"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              {ui.l("Re-Seal Security Vault")}
            </button>
          </div>
        </div>
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <MiniStat label={ui.l("Quotes received")} value={data.vendorQuotes.length} />
        <MiniStat label={ui.l("Contracts")} value={data.contracts.length} />
        <MiniStat
          label={ui.l("Midyaf commission")}
          value={isVaultLocked ? ui.l("Sealed until unlock") : money(totalCommission)}
        />
      </div>

      <div className="space-y-3">
        {data.vendorQuotes.map((quote) => {
          const isSealed = isVaultLocked;

          return (
            <div
              key={quote.id}
              className={`grid gap-3 rounded-xl border p-4 transition-all md:grid-cols-[1fr_auto_auto] ${
                isSealed
                  ? "border-amber-200 bg-amber-50/50"
                  : "border-white/5 bg-slate-50"
              }`}
            >
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-slate-900 dark:text-white">
                    {ui.l(quote.vendorName)}
                  </p>
                  {isSealed && (
                    <span className="inline-flex items-center gap-1 rounded-md bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800">
                      <Lock className="h-2.5 w-2.5" />
                      {ui.l("ENCRYPTED BID")}
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500">
                  {ui.l(quote.category)} · {ui.l(quote.item)}
                </p>
              </div>

              <div className="text-sm">
                <p className="font-bold text-midyaf-pearl">
                  {isSealed ? (
                    <span className="font-mono tracking-wider text-slate-400">
                      SAR ●●●,●●●
                    </span>
                  ) : (
                    money(quote.totalPrice)
                  )}
                </p>
                <p className="text-xs text-slate-500">
                  {isSealed ? (
                    <span>{ui.l("Commission sealed until unlock")}</span>
                  ) : (
                    <>
                      {ui.l("Commission")} {percent(quote.commissionPercent)} ·{" "}
                      {money(quote.commissionAmount)}
                    </>
                  )}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <Badge
                  tone={
                    isSealed
                      ? "gold"
                      : quote.status === "APPROVED"
                        ? "green"
                        : "gold"
                  }
                >
                  {isSealed
                    ? ui.l("Vault Sealed")
                    : `${ui.l("Score")} ${quote.score} · ${ui.l(quote.status)}`}
                </Badge>

                {canManage && quote.status !== "APPROVED" ? (
                  <button
                    onClick={() => void handleApproveQuote(quote.id)}
                    disabled={isSealed || pendingAction !== null}
                    className={`rounded-xl px-3 py-2 text-xs font-semibold ${
                      isSealed
                        ? "cursor-not-allowed bg-slate-200 text-slate-400"
                        : "btn-primary"
                    }`}
                  >
                    {isSealed
                      ? ui.l("Unlock Vault to Select")
                      : pendingAction === quote.id
                        ? ui.l("Saving")
                        : ui.l("Approve quote")}
                  </button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
      {/* Certified Contracts & Procurement Hub: Strictly visible in Full Demo Mode */}
      {isDemoMode && (
        <div className="mt-8 space-y-4">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <div className="flex items-center gap-2">
                <Sparkles size={18} className="text-midyaf-gold" />
                <h3 className="text-base font-black text-midyaf-pearl dark:text-white">
                  {ui.p("Certified Contracts & Procurement Hub", "مركز العقود المعتمدة والمشتريات الذكية")}
                </h3>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {ui.p(
                  "Legally binding procurement contracts authenticated via Triple-Key Multi-Sig and sealed on-chain.",
                  "عقود توريد ملزمة قانونياً موثقة عبر بروتوكول التوقيع المتعدد ومختومة رقمياً."
                )}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-lg bg-emerald-500/10 px-2.5 py-1 text-xs font-black text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-300">
                {ui.p("Total: SAR 2,170,000", "الإجمالي: 2,170,000 ر.س")}
              </span>
              <span className="rounded-lg bg-midyaf-gold/15 px-2.5 py-1 text-xs font-black text-midyaf-gold">
                {ui.p("Midyaf Take: SAR 224,600", "عمولة مضياف: 224,600 ر.س")}
              </span>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {DEMO_CONTRACTS.map((contract) => (
              <div
                key={contract.id}
                className="relative overflow-hidden rounded-xl border border-white/5 bg-[#121626] p-4 shadow-card-sm transition hover:shadow-card dark:border-slate-800 dark:bg-slate-900"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-black text-midyaf-gold">
                        {contract.contractNumber}
                      </span>
                      <Badge tone="green">{ui.p("SIGNED & VERIFIED", "موقع ومعتمد")}</Badge>
                    </div>
                    <h4 className="mt-1 text-sm font-black text-slate-900 dark:text-white">
                      {ui.p(contract.vendorNameEn, contract.vendorNameAr)}
                    </h4>
                    <p className="text-xs font-bold text-midyaf-pearl dark:text-purple-300">
                      {ui.p(contract.categoryEn, contract.categoryAr)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-base font-black text-midyaf-pearl dark:text-midyaf-gold">
                      {money(contract.amount)}
                    </p>
                    <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                      {contract.commissionPercent}% {ui.p("Take Rate", "عمولة")} ({money(contract.commissionAmount)})
                    </p>
                  </div>
                </div>

                <p className="mt-2.5 text-xs text-slate-600 line-clamp-2 dark:text-slate-300">
                  {ui.p(contract.scopeEn, contract.scopeAr)}
                </p>

                <div className="mt-3.5 flex items-center justify-between border-t border-white/5 pt-3 dark:border-slate-800">
                  <span className="text-xs font-mono text-slate-400">
                    {contract.certifiedHash}
                  </span>
                  <button
                    type="button"
                    onClick={() => setSelectedDemoContract(contract)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-midyaf-purple/5 px-2.5 py-1 text-xs font-bold text-midyaf-pearl transition hover:bg-midyaf-purple/10 dark:bg-white/5 dark:text-purple-300 dark:hover:bg-white/10"
                  >
                    <FileText size={13} />
                    {ui.p("View Certified Contract", "استعراض العقد المعتمد")}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Certified Contract Modal */}
      {selectedDemoContract && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm animate-fadeIn">
          <div className="relative w-full max-w-2xl rounded-lg border-2 border-midyaf-gold bg-white p-6 shadow-2xl dark:bg-slate-900 animate-scaleIn">
            <div className="flex items-center justify-between border-b border-white/5 pb-4 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="grid size-10 place-items-center rounded-xl bg-gradient-to-br from-midyaf-gold to-amber-600 text-white shadow-glow">
                  <Crown size={22} />
                </div>
                <div>
                  <h3 className="text-base font-black text-midyaf-pearl dark:text-white">
                    {ui.p("Kingdom of Saudi Arabia · Event Procurement", "المملكة العربية السعودية · مشتريات الفعاليات")}
                  </h3>
                  <p className="text-xs text-slate-400">
                    {selectedDemoContract.contractNumber} · {ui.p("Legally Certified Agreement", "اتفاقية توريد معتمدة")}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedDemoContract(null)}
                className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-white"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-4 space-y-4 text-xs">
              <div className="rounded-xl bg-amber-500/10 p-3.5 border border-amber-500/20 text-slate-900 dark:text-white dark:text-amber-200">
                <p className="font-black text-amber-800 dark:text-amber-300">
                  {ui.p("CERTIFIED EXECUTION ORDER", "أمر تنفيذ وتوريد معتمد")}
                </p>
                <p className="mt-1">
                  {ui.p(
                    "This contract was unmasked through the Anti-Corruption Triple-Key Vault and digitally signed by Sila Operations, Sila Finance, and the Midyaf Independent Compliance Auditor.",
                    "تم فتح هذا العقد عبر الخزنة الأمنية الثلاثية وتوقيعه رقمياً من قبل عمليات صلة، ومالية صلة، ومدقق الامتثال المستقل بمضياف."
                  )}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800/50">
                  <p className="text-xs text-slate-400 uppercase font-bold">{ui.p("Vendor Name", "اسم المورد")}</p>
                  <p className="mt-0.5 font-bold text-sm text-slate-900 dark:text-white">
                    {ui.p(selectedDemoContract.vendorNameEn, selectedDemoContract.vendorNameAr)}
                  </p>
                </div>
                <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800/50">
                  <p className="text-xs text-slate-400 uppercase font-bold">{ui.p("Category", "التصنيف")}</p>
                  <p className="mt-0.5 font-bold text-sm text-slate-900 dark:text-white">
                    {ui.p(selectedDemoContract.categoryEn, selectedDemoContract.categoryAr)}
                  </p>
                </div>
              </div>

              <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800/50">
                <p className="text-xs text-slate-400 uppercase font-bold">{ui.p("Scope of Work", "نطاق العمل والتوريد")}</p>
                <p className="mt-1 text-xs text-slate-700 leading-relaxed dark:text-slate-300">
                  {ui.p(selectedDemoContract.scopeEn, selectedDemoContract.scopeAr)}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800/50">
                  <p className="text-xs text-slate-400 uppercase font-bold">{ui.p("Total Contract Value", "إجمالي قيمة العقد")}</p>
                  <p className="mt-0.5 font-black text-base text-midyaf-pearl dark:text-midyaf-gold">
                    {money(selectedDemoContract.amount)}
                  </p>
                </div>
                <div className="rounded-lg bg-emerald-500/10 p-3 border border-emerald-500/20">
                  <p className="text-xs text-emerald-600 uppercase font-bold">{ui.p("Midyaf Take Rate (Platform Fee)", "عمولة منصة مضياف")}</p>
                  <p className="mt-0.5 font-black text-base text-emerald-600 dark:text-emerald-400">
                    {money(selectedDemoContract.commissionAmount)} ({selectedDemoContract.commissionPercent}%)
                  </p>
                </div>
              </div>

              <div className="rounded-lg border border-dashed border-slate-300 p-3 text-center dark:border-slate-700">
                <p className="text-xs text-slate-400 font-mono">
                  {ui.p("IMMUTABLE AUDIT HASH", "بصمة التدقيق المشفرة وغير القابلة للتغيير")}
                </p>
                <p className="mt-1 font-mono font-bold text-midyaf-pearl dark:text-purple-300">
                  SHA-256: {selectedDemoContract.certifiedHash} · TIMESTAMP: {selectedDemoContract.signedDate}T12:00:00Z
                </p>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-2 border-t border-white/5 pt-4 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setSelectedDemoContract(null)}
                className="btn-primary rounded-xl px-5 py-2 text-xs font-bold"
              >
                {ui.p("Close Certificate", "إغلاق الشهادة")}
              </button>
            </div>
          </div>
        </div>
      )}
    </Section>
  );
}
