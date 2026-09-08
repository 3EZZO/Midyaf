import { useState } from "react";
import { 
  Send, 
  CheckCircle2, 
  Clock, 
  FileText, 
  ShieldCheck, 
  Plane, 
  Car, 
  Users, 
  Zap, 
  Truck, 
  Building, 
  Hotel,
  ArrowRight,
  Sparkles,
  Lock,
  ExternalLink
} from "lucide-react";
import { money } from "../lib/format";
import { DEMO_CONTRACTS } from "../lib/useLiveDemoSimulation";
import type { DemoContract } from "../lib/useLiveDemoSimulation";

interface SupplierContractWorkflowProps {
  isPlanApproved: boolean;
  onApprovePlan?: () => Promise<void> | void;
  isArabic: boolean;
}

const CATEGORY_ICONS: Record<string, any> = {
  "AIRLINE": Plane,
  "VEHICLE_BROKERAGE": Car,
  "CAR_RENTAL": Car,
  "MAN_POWER": Users,
  "GOLF_CARTS": Zap,
  "HEAVY_TRUCKS": Truck,
  "HEAVY_EQUIPMENT": Building,
  "HOTEL": Hotel
};

export function SupplierContractWorkflow({
  isPlanApproved,
  onApprovePlan,
  isArabic
}: SupplierContractWorkflowProps) {
  const [isDispatched, setIsDispatched] = useState(false);
  const [isContractsReceived, setIsContractsReceived] = useState(false);
  const [selectedContract, setSelectedContract] = useState<DemoContract | null>(null);
  const [isDispatching, setIsDispatching] = useState(false);
  const [isReceiving, setIsReceiving] = useState(false);

  const handleDispatchTo8 = async () => {
    setIsDispatching(true);
    await new Promise((resolve) => setTimeout(resolve, 800));
    setIsDispatched(true);
    setIsDispatching(false);
  };

  const handleReceiveContracts = async () => {
    setIsReceiving(true);
    await new Promise((resolve) => setTimeout(resolve, 800));
    setIsContractsReceived(true);
    setIsReceiving(false);
  };

  return (
    <div id="section-supplier-contracts" className="rounded-2xl border border-midyaf-purple/15 bg-white p-5 shadow-luxury dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <div className="grid size-10 place-items-center rounded-xl bg-gradient-to-br from-midyaf-purple to-midyaf-purple-dark text-midyaf-gold shadow-glow-purple">
            <ShieldCheck size={20} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-black text-midyaf-purple dark:text-white">
                {isArabic ? "مسار اعتماد العقود مع الموردين الـ 8 المعتمدين" : "8-Category Supplier Contract Workflow"}
              </h3>
              <span className="rounded-md bg-midyaf-gold/15 px-2 py-0.5 text-[10px] font-bold text-midyaf-gold ring-1 ring-midyaf-gold/30">
                {isArabic ? "بروتوكول العقود" : "Contract Protocol"}
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {isArabic
                ? "اعتماد الخطة اللوجستية ← الإرسال التلقائي للشركات الـ 8 المتعاقدة ← استلام وتدقيق العقود الموقعة وإعادتها للمنصة"
                : "Plan Approval → Supervisor sends to 8 contracted supplier companies → Companies return signed contracts to platform"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isContractsReceived ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-600 ring-1 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300">
              <CheckCircle2 size={13} />
              {isArabic ? "اكتمل توقيع كافة عقود الفئات الـ 8" : "All 8 Category Contracts Verified"}
            </span>
          ) : isDispatched ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-600 ring-1 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-300">
              <Clock size={13} className="animate-spin" />
              {isArabic ? "تم الإرسال للشركات الـ 8 · بانتظار العقود" : "Sent to 8 Suppliers · Awaiting Signatures"}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              <Lock size={13} />
              {isArabic ? "المرحلة 1: بانتظار اعتماد الخطة" : "Stage 1: Awaiting Plan Approval"}
            </span>
          )}
        </div>
      </div>

      {/* 3-Step Visual Stepper */}
      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        {/* Step 1 */}
        <div
          className={`relative rounded-xl border p-4 transition-all ${
            isPlanApproved
              ? "border-emerald-500/40 bg-emerald-50/40 dark:border-emerald-500/30 dark:bg-emerald-950/20"
              : "border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/50"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              {isArabic ? "الخطوة 1" : "Step 1"}
            </span>
            {isPlanApproved ? (
              <CheckCircle2 size={16} className="text-emerald-600" />
            ) : (
              <Clock size={16} className="text-slate-400" />
            )}
          </div>
          <h4 className="mt-1 text-sm font-black text-slate-800 dark:text-white">
            {isArabic ? "اعتماد الخطة اللوجستية" : "Approve Logistics Plan"}
          </h4>
          <p className="mt-1 text-xs text-slate-500">
            {isPlanApproved
              ? (isArabic ? "تم اعتماد الخطة التشغيلية ومعالجة البيانات" : "Logistics plan confirmed & locked")
              : (isArabic ? "يجب اعتماد الخطة قبل تعميد الموردين" : "Requires plan confirmation before supplier dispatch")}
          </p>
          {!isPlanApproved && onApprovePlan && (
            <button
              type="button"
              onClick={() => void onApprovePlan()}
              className="mt-3 w-full rounded-lg bg-midyaf-purple px-3 py-1.5 text-xs font-bold text-white transition hover:bg-midyaf-purple-dark cursor-pointer"
            >
              {isArabic ? "اعتماد الخطة الآن" : "Confirm Plan Now"}
            </button>
          )}
        </div>

        {/* Step 2 */}
        <div
          className={`relative rounded-xl border p-4 transition-all ${
            isDispatched
              ? "border-emerald-500/40 bg-emerald-50/40 dark:border-emerald-500/30 dark:bg-emerald-950/20"
              : isPlanApproved
              ? "border-amber-500/40 bg-amber-50/30 dark:border-amber-500/30 dark:bg-amber-950/10 ring-1 ring-amber-400/30"
              : "border-slate-200 bg-slate-50 opacity-60 dark:border-slate-800 dark:bg-slate-800/50"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              {isArabic ? "الخطوة 2" : "Step 2"}
            </span>
            {isDispatched ? (
              <CheckCircle2 size={16} className="text-emerald-600" />
            ) : (
              <Send size={16} className={isPlanApproved ? "text-amber-500" : "text-slate-400"} />
            )}
          </div>
          <h4 className="mt-1 text-sm font-black text-slate-800 dark:text-white">
            {isArabic ? "إرسال الخطة للموردين الـ 8" : "Dispatch to 8 Suppliers"}
          </h4>
          <p className="mt-1 text-xs text-slate-500">
            {isDispatched
              ? (isArabic ? "تم إرسال الخطة للشركات الـ 8 المتعاقدة" : "Dispatched to all 8 contracted companies")
              : (isArabic ? "إرسال بنود الخطة رسمياً للموردين المعتمدين" : "Send plan specifications to contracted vendors")}
          </p>
          {isPlanApproved && !isDispatched && (
            <button
              type="button"
              onClick={() => void handleDispatchTo8()}
              disabled={isDispatching}
              className="mt-3 w-full btn-gold rounded-lg py-1.5 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
            >
              {isDispatching ? (
                <span>{isArabic ? "جاري الإرسال..." : "Dispatching..."}</span>
              ) : (
                <>
                  <Send size={13} />
                  <span>{isArabic ? "إرسال الخطة للموردين الـ 8" : "Send Plan to 8 Suppliers"}</span>
                </>
              )}
            </button>
          )}
        </div>

        {/* Step 3 */}
        <div
          className={`relative rounded-xl border p-4 transition-all ${
            isContractsReceived
              ? "border-emerald-500/40 bg-emerald-50/40 dark:border-emerald-500/30 dark:bg-emerald-950/20"
              : isDispatched
              ? "border-amber-500/40 bg-amber-50/30 dark:border-amber-500/30 dark:bg-amber-950/10 ring-1 ring-amber-400/30"
              : "border-slate-200 bg-slate-50 opacity-60 dark:border-slate-800 dark:bg-slate-800/50"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              {isArabic ? "الخطوة 3" : "Step 3"}
            </span>
            {isContractsReceived ? (
              <CheckCircle2 size={16} className="text-emerald-600" />
            ) : (
              <FileText size={16} className={isDispatched ? "text-amber-500" : "text-slate-400"} />
            )}
          </div>
          <h4 className="mt-1 text-sm font-black text-slate-800 dark:text-white">
            {isArabic ? "استلام العقود وتدقيقها بالمنصة" : "Receive & Verify Contracts"}
          </h4>
          <p className="mt-1 text-xs text-slate-500">
            {isContractsReceived
              ? (isArabic ? "تم استلام 8 عقود موقعة ومطابقتها وتوثيقها" : "8 signed contracts returned & verified")
              : (isArabic ? "إعادة العقود الموقعة من الشركات إلى المنصة" : "Suppliers return executed contracts to platform")}
          </p>
          {isDispatched && !isContractsReceived && (
            <button
              type="button"
              onClick={() => void handleReceiveContracts()}
              disabled={isReceiving}
              className="mt-3 w-full rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-emerald-700 flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
            >
              {isReceiving ? (
                <span>{isArabic ? "جاري التدقيق والاستلام..." : "Verifying..."}</span>
              ) : (
                <>
                  <CheckCircle2 size={13} />
                  <span>{isArabic ? "استلام ومطابقة عقود الموردين" : "Receive & Verify Contracts"}</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Contract List & Transmission Status for all 8 Categories */}
      <div className="mt-5">
        <h4 className="text-xs font-black uppercase tracking-wider text-slate-400 mb-3">
          {isArabic ? "قائمة الشركات المعتمدة عبر الفئات الـ 8:" : "Official 8 Contracted Supplier Companies:"}
        </h4>
        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
          {DEMO_CONTRACTS.map((c, idx) => {
            const iconKey = ["AIRLINE", "VEHICLE_BROKERAGE", "CAR_RENTAL", "MAN_POWER", "GOLF_CARTS", "HEAVY_TRUCKS", "HEAVY_EQUIPMENT", "HOTEL"][idx] || "HOTEL";
            const Icon = CATEGORY_ICONS[iconKey] || FileText;

            return (
              <div
                key={c.id}
                className={`flex flex-col justify-between rounded-xl border p-3 transition-all ${
                  isContractsReceived
                    ? "border-emerald-500/30 bg-emerald-50/30 dark:border-emerald-500/20 dark:bg-emerald-950/20"
                    : isDispatched
                    ? "border-amber-500/30 bg-amber-50/20 dark:border-amber-500/20 dark:bg-amber-950/10"
                    : "border-slate-200/70 bg-slate-50/40 dark:border-slate-800 dark:bg-slate-800/40"
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-1">
                    <div className="flex items-center gap-2">
                      <div className="grid size-7 place-items-center rounded-lg bg-midyaf-purple/10 text-midyaf-purple dark:bg-purple-500/20 dark:text-purple-300">
                        <Icon size={14} />
                      </div>
                      <span className="text-[10px] font-bold text-midyaf-gold uppercase">
                        {isArabic ? c.categoryAr : c.categoryEn}
                      </span>
                    </div>
                    <span className="text-[9px] font-mono text-slate-400">
                      {c.contractNumber}
                    </span>
                  </div>

                  <h5 className="mt-2 text-xs font-black text-slate-800 dark:text-white truncate">
                    {isArabic ? c.vendorNameAr : c.vendorNameEn}
                  </h5>
                  <p className="mt-0.5 text-[10px] text-slate-500 line-clamp-2">
                    {isArabic ? c.scopeAr : c.scopeEn}
                  </p>
                </div>

                <div className="mt-3 border-t border-slate-100 pt-2 dark:border-slate-800 flex items-center justify-between text-[10px]">
                  <span className="font-black text-midyaf-purple dark:text-purple-300">
                    {money(c.amount)}
                  </span>
                  {isContractsReceived ? (
                    <span className="font-bold text-emerald-600 flex items-center gap-0.5">
                      <CheckCircle2 size={11} />
                      {isArabic ? "عقد موقع ومعتمد" : "Signed & Sealed"}
                    </span>
                  ) : isDispatched ? (
                    <span className="font-bold text-amber-600 flex items-center gap-0.5">
                      <Clock size={11} />
                      {isArabic ? "تم الإرسال للمورد" : "Dispatched"}
                    </span>
                  ) : (
                    <span className="text-slate-400">
                      {isArabic ? "بانتظار الإرسال" : "Pending Dispatch"}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
