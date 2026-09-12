const fs = require('fs');

let path = 'client/src/pages/GuestSelfOnboarding.tsx';
let content = fs.readFileSync(path, 'utf8');

content = content.replace(/\(isArabic \? ".*?" : "Next"\)/, '(isArabic ? "التالي" : "Next")');
content = content.replace(/\(isArabic \? ".*?" : "Complete Registration"\)/, '(isArabic ? "إكمال التسجيل" : "Complete Registration")');

fs.writeFileSync(path, content, 'utf8');
console.log("Fixed Next and Complete Registration");
