import { useState, FormEvent } from "react";
import { UserPlus, UploadCloud, CheckCircle2 } from "lucide-react";

export function GuestSelfOnboarding({
  isArabic,
  onComplete
}: {
  isArabic: boolean;
  onComplete: (data: any) => void;
}) {
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    fullName: "",
    phone: "",
    dietary: ""
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (step < 3) {
      setStep(step + 1);
    } else {
      onComplete(formData);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4 dark:bg-slate-950 font-sans" dir={isArabic ? "rtl" : "ltr"}>
      <div className="w-full max-w-md bg-white rounded-3xl shadow-xl overflow-hidden dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
        <div className="bg-midyaf-purple p-6 text-white text-center">
          <UserPlus size={40} className="mx-auto mb-3 opacity-90" />
          <h2 className="text-xl font-bold">{isArabic ? "????? ??????? ??????" : "Guest Self-Registration"}</h2>
          <p className="text-xs opacity-80 mt-1">{isArabic ? "???? ???? ???" : "Sila Guest Portal"}</p>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div className="flex justify-between mb-4 relative">
            <div className="absolute top-1/2 left-0 w-full h-0.5 bg-slate-100 dark:bg-slate-800 -z-10 -translate-y-1/2"></div>
            {[1, 2, 3].map((s) => (
              <div key={s} className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                step >= s ? "bg-midyaf-purple text-white shadow-md" : "bg-white text-slate-400 border border-slate-200 dark:bg-slate-900 dark:border-slate-700"
              }`}>
                {s}
              </div>
            ))}
          </div>

          {step === 1 && (
            <div className="space-y-4 animate-fadeIn">
              <h3 className="font-bold text-midyaf-ink dark:text-white text-sm">{isArabic ? "????????? ????????" : "Basic Information"}</h3>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">{isArabic ? "????? ??????" : "Full Name"}</label>
                <input required type="text" value={formData.fullName} onChange={e => setFormData({...formData, fullName: e.target.value})} className="w-full rounded-xl border border-slate-200 px-4 py-2.5 outline-none focus:border-midyaf-purple dark:bg-slate-800 dark:border-slate-700 text-sm" placeholder={isArabic ? "??? ?? ???? ?? ??????" : "As shown on ID"} />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">{isArabic ? "??? ??????" : "Phone Number"}</label>
                <input required type="tel" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} className="w-full rounded-xl border border-slate-200 px-4 py-2.5 outline-none focus:border-midyaf-purple dark:bg-slate-800 dark:border-slate-700 text-sm" placeholder="+966 5X XXX XXXX" />
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4 animate-fadeIn">
              <h3 className="font-bold text-midyaf-ink dark:text-white text-sm">{isArabic ? "??????? ???????" : "Hospitality Preferences"}</h3>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">{isArabic ? "?????? ???????? (???????)" : "Dietary Restrictions (Optional)"}</label>
                <input type="text" value={formData.dietary} onChange={e => setFormData({...formData, dietary: e.target.value})} className="w-full rounded-xl border border-slate-200 px-4 py-2.5 outline-none focus:border-midyaf-purple dark:bg-slate-800 dark:border-slate-700 text-sm" placeholder={isArabic ? "?????? ???? ?? ????????..." : "Vegan, Gluten-free..."} />
              </div>
              <div className="pt-2">
                <label className="block text-xs font-bold text-slate-600 mb-2">{isArabic ? "????? ?????? ??????? / ??????" : "Upload National ID / Passport"}</label>
                <div className="border-2 border-dashed border-slate-200 rounded-2xl p-6 text-center hover:border-midyaf-purple hover:bg-midyaf-purple/5 transition-colors cursor-pointer dark:border-slate-700">
                  <UploadCloud size={24} className="mx-auto text-slate-400 mb-2" />
                  <span className="text-xs text-slate-500 font-medium">{isArabic ? "???? ???? ????" : "Click to upload image"}</span>
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4 animate-fadeIn text-center py-6">
              <div className="mx-auto w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mb-4 shadow-inner">
                <CheckCircle2 size={32} />
              </div>
              <h3 className="font-bold text-midyaf-ink dark:text-white text-lg">{isArabic ? "???? ???????" : "Ready to Submit"}</h3>
              <p className="text-xs text-slate-500">
                {isArabic ? "???? ????? ???? ?????? ?????? ????? ?????? ??????? (QR)." : "Your profile will be created and digital boarding pass (QR) issued."}
              </p>
            </div>
          )}

          <button type="submit" className="w-full bg-midyaf-purple hover:bg-midyaf-purple-dark text-white rounded-xl py-3 text-sm font-bold shadow-lg shadow-midyaf-purple/20 transition-all cursor-pointer">
            {step < 3 ? (isArabic ? "??????" : "Next") : (isArabic ? "????? ???????" : "Complete Registration")}
          </button>
        </form>
      </div>
    </div>
  );
}
