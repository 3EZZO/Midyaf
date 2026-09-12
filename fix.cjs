const fs = require('fs');

function fix(filePath, englishStr, arabicStr) {
  let content = fs.readFileSync(filePath, 'utf8');
  let lines = content.split('\n');
  let changed = false;
  for(let i = 0; i < lines.length; i++) {
    if(lines[i].includes(englishStr)) {
      if(lines[i].includes('{isArabic ?')) {
        let match = lines[i].match(/\{isArabic \? ".*?" : ".*?"\}/);
        if(match) {
          lines[i] = lines[i].replace(match[0], `{isArabic ? "${arabicStr}" : "${englishStr}"}`);
          changed = true;
        }
      } else if (lines[i].includes('{ui.isArabic ?')) {
        let match = lines[i].match(/\{ui\.isArabic \? ".*?" : ".*?"\}/);
        if(match) {
          lines[i] = lines[i].replace(match[0], `{ui.isArabic ? "${arabicStr}" : "${englishStr}"}`);
          changed = true;
        }
      }
    }
  }
  if (changed) fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
}

fix('client/src/components/AdminExecutiveDashboard.tsx', 'Submitters Log', 'سجل الجهات المدخلة');
fix('client/src/components/AdminExecutiveDashboard.tsx', 'Logistics Plans', 'الخطط اللوجستية');
fix('client/src/components/AdminExecutiveDashboard.tsx', 'Complaints', 'الشكاوى والبلاغات');
fix('client/src/components/AdminExecutiveDashboard.tsx', 'Live Activities', 'الفعاليات الجارية');
fix('client/src/components/AdminExecutiveDashboard.tsx', 'Contracts Vault', 'خزنة العقود والمالية');

fix('client/src/components/ClientDashboard.tsx', 'Schedule Amendments', 'التعديلات المباشرة');
fix('client/src/components/ClientDashboard.tsx', 'Logistics Chat', 'التواصل اللوجستي');
fix('client/src/components/ClientDashboard.tsx', 'Executive Reports', 'التقارير التنفيذية');

fix('client/src/pages/OperationsPortals.tsx', 'Activity Summary', 'ملخص الفعالية');
fix('client/src/pages/OperationsPortals.tsx', 'Client Portal', 'بوابة العميل');
fix('client/src/pages/OperationsPortals.tsx', 'Reports', 'التقارير والمخرجات');
fix('client/src/pages/OperationsPortals.tsx', 'Activity Updates', 'تحديثات الفعالية');

// Also GuestSelfOnboarding.tsx
function fixGuest(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let changed = false;
  
  const replacements = [
    ['Guest Self-Registration', 'تسجيل الضيوف الذاتي'],
    ['Sila Guest Portal', 'بوابة ضيوف صلة'],
    ['Basic Information', 'المعلومات الأساسية'],
    ['Full Name', 'الاسم الكامل'],
    ['As shown on ID', 'كما هو موضح في الهوية'],
    ['Phone Number', 'رقم الجوال'],
    ['Hospitality Preferences', 'تفضيلات الضيافة'],
    ['Dietary Restrictions (Optional)', 'القيود الغذائية (اختياري)'],
    ['Vegan, Gluten-free...', 'نباتي، خالي من الجلوتين...'],
    ['Upload National ID / Passport', 'رفع الهوية الوطنية / الجواز'],
    ['Click to upload image', 'انقر لرفع صورة'],
    ['Ready to Submit', 'جاهز للإرسال'],
    ['Your profile will be created and digital boarding pass (QR) issued.', 'سيتم إنشاء ملفك وإصدار بطاقة الصعود الرقمية (QR).'],
    ['Next', 'التالي'],
    ['Complete Registration', 'إكمال التسجيل']
  ];
  
  let lines = content.split('\n');
  for(let i = 0; i < lines.length; i++) {
    for (let [en, ar] of replacements) {
      if(lines[i].includes(en) && lines[i].includes('{isArabic ?')) {
        // Need a safe regex for english strings with dots or parenthesis
        let safeEn = en.replace(/([.()])/g, '\\$1');
        let regex = new RegExp(`\\{isArabic \\? ".*?" : "${safeEn}"\\}`);
        let match = lines[i].match(regex);
        if(match) {
          lines[i] = lines[i].replace(match[0], `{isArabic ? "${ar}" : "${en}"}`);
          changed = true;
        }
      }
    }
  }
  if (changed) fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
}

fixGuest('client/src/pages/GuestSelfOnboarding.tsx');
console.log("Done fixing all corrupted text.");
