import { ACT_TIMING, SIMULATION_TICKER_EVENTS, type Waypoint } from "../data";
import type { Act, Command, Script } from "../director";

/**
 * "Sovereign Arrival" — the 7-minute storyboard. Five self-contained acts;
 * every act's `setup` places the world exactly where the previous act left
 * it, so the narrator can jump to any act cold.
 *
 * Route indices refer to DEMO_DRIVER_ROUTES in data.ts. Geofence ring
 * transitions are NOT scripted here: the director's built-in ring engine
 * derives them from the convoy's position, exactly as the server does for a
 * real captain's phone.
 */

const T = ACT_TIMING;
const filler = (i: number) =>
  SIMULATION_TICKER_EVENTS[i % SIMULATION_TICKER_EVENTS.length];

/** Prince Mohammed bin Salman Rd detour used when the Sovereign Financial corridor closes. */
const CHARLIE_DETOUR: Waypoint[] = [
  {
    lat: 24.7,
    lng: 46.635,
    speed: 45,
    locationEn: "Makkah Road · diversion point",
    locationAr: "طريق مكة · نقطة التحويل"
  },
  {
    lat: 24.715,
    lng: 46.66,
    speed: 70,
    locationEn: "Prince Mohammed bin Salman Rd eastbound",
    locationAr: "طريق الأمير محمد بن سلمان شرقاً"
  },
  {
    lat: 24.745,
    lng: 46.665,
    speed: 75,
    locationEn: "Northern Ring junction",
    locationAr: "تقاطع الدائري الشمالي"
  },
  {
    lat: 24.7642,
    lng: 46.6406,
    speed: 30,
    locationEn: "KAFD VIP Plenary Drop-off",
    locationAr: "نقطة إنزال كبار الشخصيات بكافد"
  }
];

const corridorsNormal: Command[] = [
  { type: "corridor.setState", code: "AIRPORT_PROTOCOL", state: "normal" },
  { type: "corridor.setState", code: "SOVEREIGN_FINANCIAL", state: "normal" },
  { type: "corridor.setState", code: "DIPLOMATIC_HERITAGE", state: "normal" }
];

const act1: Act = {
  id: "wheels-down",
  title: { en: "Act 1 · Wheels Down", ar: "الفصل 1 · الهبوط" },
  subtitle: {
    en: "Royal flight lands; Motorcade Alpha departs KKIA",
    ar: "هبوط الطائرة الملكية وانطلاق موكب ألفا من المطار"
  },
  durationMs: T.act1.durationMs,
  setup: [
    { type: "scorecard", visible: false },
    { type: "tminus.set", inMs: 8000 },
    ...corridorsNormal,
    { type: "flight.setPhase", flightNo: "SV 1044", phase: "FINAL_APPROACH" },
    { type: "flight.setPhase", flightNo: "SV 102", phase: "CHAUFFEUR_READY" },
    { type: "flight.setPhase", flightNo: "BA 263", phase: "LANDED" },
    { type: "flight.setPhase", flightNo: "EK 2042", phase: "INBOUND" },
    { type: "convoy.place", driver: "sultan", path: { from: 0, to: 0 } },
    { type: "convoy.place", driver: "fahad", path: { from: 0, to: 0 } },
    { type: "convoy.place", driver: "rakan", path: { from: 0, to: 0 } },
    { type: "convoy.place", driver: "tariq", path: { from: 0, to: 0 } },
    { type: "convoy.place", driver: "nasser", path: { from: 0, to: 0 } },
    { type: "task.setStatus", task: "airport", status: "ASSIGNED" },
    { type: "task.setStatus", task: "venue", status: "PENDING" }
  ],
  beats: [
    { at: 0, cmd: { type: "camera.overview" } },
    {
      at: 500,
      cmd: {
        type: "ticker.push",
        tag: "LIVE",
        text: {
          en: "[LIVE] Sovereign Arrival sequence armed · all corridors green.",
          ar: "[بث مباشر] تسلسل الوصول السيادي جاهز · جميع الممرات خضراء."
        }
      }
    },
    {
      at: 8000,
      cmd: { type: "flight.setPhase", flightNo: "SV 1044", phase: "LANDED" }
    },
    { at: 8000, cmd: { type: "tminus.set", inMs: 0 } },
    { at: 8000, cmd: { type: "audio.cue", cue: "chime" } },
    { at: 8000, cmd: { type: "highlight", panelId: "flightBoard" } },
    {
      at: 8200,
      cmd: {
        type: "ticker.push",
        tag: "FLIGHT",
        text: {
          en: "[FLIGHT] SV 1044 wheels down · KKIA Royal Terminal.",
          ar: "[رحلات] هبوط الرحلة SV 1044 · الصالة الملكية بمطار الملك خالد."
        }
      }
    },
    {
      at: 9000,
      cmd: {
        type: "toast",
        tone: "info",
        title: { en: "Royal flight landed", ar: "هبطت الطائرة الملكية" },
        message: {
          en: "SV 1044 on the ground at the Royal Terminal.",
          ar: "الرحلة SV 1044 على الأرض بالصالة الملكية."
        }
      }
    },
    {
      at: 20000,
      cmd: {
        type: "flight.setPhase",
        flightNo: "SV 1044",
        phase: "CHAUFFEUR_READY"
      }
    },
    {
      at: 20000,
      cmd: {
        type: "ticker.push",
        tag: "CHAUFFEUR",
        text: {
          en: "[CHAUFFEUR] Capt. Sultan at Royal Gate curb · Maybach KSA 9119 · cabin 20°C.",
          ar: "[الكابتن] الكابتن سلطان على رصيف البوابة الملكية · مايباخ KSA 9119 · المقصورة 20°."
        }
      }
    },
    {
      at: 26000,
      cmd: { type: "camera.focusConvoy", driver: "sultan", zoom: 15 }
    },
    {
      at: 30000,
      cmd: { type: "task.setStatus", task: "airport", status: "EN_ROUTE" }
    },
    { at: 30000, cmd: { type: "audio.cue", cue: "handshake" } },
    { at: 30000, cmd: { type: "highlight", panelId: "convoyRoster" } },
    {
      at: 30200,
      cmd: {
        type: "ticker.push",
        tag: "PROTOCOL",
        text: {
          en: "[PROTOCOL] VIP aboard · Motorcade Alpha rolling on the Airport Protocol Corridor.",
          ar: "[مراسم] الضيفة على متن المركبة · موكب ألفا ينطلق عبر ممر الاستقبال الدبلوماسي."
        }
      }
    },
    {
      at: 32000,
      cmd: {
        type: "convoy.moveAlong",
        driver: "sultan",
        path: { from: 0, to: 2 },
        durationMs: 38000
      }
    },
    {
      at: 34000,
      cmd: {
        type: "convoy.moveAlong",
        driver: "tariq",
        path: { from: 0, to: 2 },
        durationMs: 36000
      }
    },
    {
      at: 34000,
      cmd: {
        type: "convoy.moveAlong",
        driver: "fahad",
        path: { from: 0, to: 3 },
        durationMs: 36000
      }
    },
    {
      at: 45000,
      cmd: {
        type: "ticker.push",
        tag: "SECURITY",
        text: {
          en: "[SECURITY] Airport Protocol Corridor · green wave synchronized with traffic police.",
          ar: "[أمن] ممر الاستقبال الدبلوماسي · الموجة الخضراء متزامنة مع دوريات المرور."
        }
      }
    },
    { at: 60000, cmd: { type: "ticker.push", text: filler(2) } }
  ]
};

const act2: Act = {
  id: "approach",
  title: { en: "Act 2 · The Approach", ar: "الفصل 2 · الاقتراب" },
  subtitle: {
    en: "Alpha enters the Ritz-Carlton outer approach and staging hold",
    ar: "موكب ألفا يدخل نطاق الاقتراب ومنطقة الاصطفاف بالريتز-كارلتون"
  },
  durationMs: T.act2.durationMs,
  setup: [
    { type: "scorecard", visible: false },
    { type: "tminus.set", inMs: -T.act1.durationMs },
    ...corridorsNormal,
    { type: "flight.setPhase", flightNo: "SV 1044", phase: "DEPARTED_AIRPORT" },
    { type: "flight.setPhase", flightNo: "SV 102", phase: "CHAUFFEUR_READY" },
    { type: "flight.setPhase", flightNo: "BA 263", phase: "LANDED" },
    { type: "flight.setPhase", flightNo: "EK 2042", phase: "FINAL_APPROACH" },
    { type: "convoy.place", driver: "sultan", path: { from: 0, to: 2 } },
    { type: "convoy.place", driver: "fahad", path: { from: 0, to: 3 } },
    { type: "convoy.place", driver: "rakan", path: { from: 0, to: 0 } },
    { type: "convoy.place", driver: "tariq", path: { from: 0, to: 2 } },
    { type: "convoy.place", driver: "nasser", path: { from: 0, to: 0 } },
    { type: "task.setStatus", task: "airport", status: "EN_ROUTE" }
  ],
  beats: [
    { at: 0, cmd: { type: "camera.focusConvoy", driver: "sultan", zoom: 13 } },
    {
      at: 500,
      cmd: {
        type: "ticker.push",
        tag: "CONVOY",
        text: {
          en: "[CONVOY] Alpha clearing King Salman interchange · southbound.",
          ar: "[موكب] ألفا يتجاوز تقاطع الملك سلمان · باتجاه الجنوب."
        }
      }
    },
    {
      at: 2000,
      cmd: {
        type: "convoy.moveAlong",
        driver: "sultan",
        path: { from: 2, to: 5, stopShortMeters: 400 },
        durationMs: 64000
      }
    },
    {
      at: 4000,
      cmd: {
        type: "convoy.moveAlong",
        driver: "nasser",
        path: { from: 0, to: 1 },
        durationMs: 40000
      }
    },
    {
      at: 20000,
      cmd: {
        type: "ticker.push",
        tag: "HOSPITALITY",
        text: {
          en: "[HOSPITALITY] Ritz-Carlton delegation base · royal suite and concierge team ready.",
          ar: "[ضيافة] مقر الوفود بالريتز-كارلتون · الجناح الملكي وفريق الكونسيرج جاهزون."
        }
      }
    },
    { at: 36000, cmd: { type: "ticker.push", text: filler(3) } },
    {
      at: 56000,
      cmd: { type: "highlight", panelId: "radar", durationMs: 4000 }
    },
    {
      at: 58000,
      cmd: {
        type: "ticker.push",
        tag: "GEOFENCE",
        text: {
          en: "[GEOFENCE] Alpha inside the Ritz-Carlton outer approach ring.",
          ar: "[نطاق جغرافي] ألفا داخل حلقة الاقتراب الخارجية للريتز-كارلتون."
        }
      }
    },
    {
      at: 64000,
      cmd: { type: "highlight", panelId: "occupancy", durationMs: 4000 }
    },
    {
      at: 66000,
      cmd: {
        type: "ticker.push",
        tag: "GEOFENCE",
        text: {
          en: "[GEOFENCE] Staging hold · concierge team dispatched to the curb.",
          ar: "[نطاق جغرافي] منطقة الاصطفاف · تم توجيه فريق الاستقبال إلى الرصيف."
        }
      }
    },
    {
      at: 66500,
      cmd: {
        type: "toast",
        tone: "info",
        title: { en: "Staging hold reached", ar: "الوصول إلى منطقة الاصطفاف" },
        message: {
          en: "Concierge team dispatched to the curb.",
          ar: "تم توجيه فريق الاستقبال إلى الرصيف."
        }
      }
    },
    {
      at: 70000,
      cmd: { type: "camera.focusConvoy", driver: "sultan", zoom: 16 }
    }
  ]
};

const act3: Act = {
  id: "curbside-handshake",
  title: {
    en: "Act 3 · Curbside Handshake",
    ar: "الفصل 3 · المصافحة على الرصيف"
  },
  subtitle: {
    en: "Curbside gate entry; the guest's device receives the arrival pass",
    ar: "دخول بوابة الرصيف واستلام بطاقة الوصول على جهاز الضيفة"
  },
  durationMs: T.act3.durationMs,
  setup: [
    { type: "scorecard", visible: false },
    { type: "tminus.set", inMs: -(T.act1.durationMs + T.act2.durationMs) },
    ...corridorsNormal,
    { type: "flight.setPhase", flightNo: "SV 1044", phase: "DEPARTED_AIRPORT" },
    { type: "flight.setPhase", flightNo: "SV 102", phase: "DEPARTED_AIRPORT" },
    { type: "flight.setPhase", flightNo: "BA 263", phase: "CHAUFFEUR_READY" },
    { type: "flight.setPhase", flightNo: "EK 2042", phase: "LANDED" },
    {
      type: "convoy.place",
      driver: "sultan",
      path: { from: 2, to: 5, stopShortMeters: 400 }
    },
    { type: "convoy.place", driver: "fahad", path: { from: 0, to: 3 } },
    { type: "convoy.place", driver: "rakan", path: { from: 0, to: 0 } },
    { type: "convoy.place", driver: "tariq", path: { from: 0, to: 2 } },
    { type: "convoy.place", driver: "nasser", path: { from: 0, to: 1 } },
    { type: "task.setStatus", task: "airport", status: "EN_ROUTE" }
  ],
  beats: [
    { at: 0, cmd: { type: "camera.focusConvoy", driver: "sultan", zoom: 16 } },
    {
      at: 3000,
      cmd: {
        type: "convoy.moveAlong",
        driver: "sultan",
        path: { toward: 5, stopShortMeters: 120 },
        durationMs: 20000
      }
    },
    {
      at: 6000,
      cmd: {
        type: "ticker.push",
        tag: "CURB",
        text: {
          en: "[CURB] Royal protocol officer and concierge in position at the porte-cochère.",
          ar: "[الرصيف] ضابطة المراسم وفريق الاستقبال في موقعهم عند المدخل الرئيسي."
        }
      }
    },
    {
      at: 24000,
      cmd: { type: "task.setStatus", task: "airport", status: "ARRIVED" }
    },
    { at: 24000, cmd: { type: "audio.cue", cue: "handshake" } },
    { at: 24000, cmd: { type: "highlight", panelId: "convoyRoster" } },
    {
      at: 24200,
      cmd: {
        type: "ticker.push",
        tag: "HANDSHAKE",
        text: {
          en: "[HANDSHAKE] Curbside gate · captain confirms VIP identity · arrival pass issued.",
          ar: "[مصافحة] بوابة الرصيف · الكابتن يؤكد هوية الضيفة · تم إصدار بطاقة الوصول."
        }
      }
    },
    {
      at: 25000,
      cmd: {
        type: "toast",
        tone: "success",
        title: {
          en: "Curbside handshake confirmed",
          ar: "تأكيد المصافحة على الرصيف"
        },
        message: {
          en: "Arrival pass pushed to the guest's device.",
          ar: "تم إرسال بطاقة الوصول إلى جهاز الضيفة."
        }
      }
    },
    {
      at: 32000,
      cmd: {
        type: "ticker.push",
        tag: "GUEST",
        text: {
          en: "[GUEST] Arrival pass acknowledged on Noura Al Harbi's device.",
          ar: "[ضيف] تم تأكيد استلام بطاقة الوصول على جهاز نورة الحربي."
        }
      }
    },
    {
      at: 40000,
      cmd: {
        type: "convoy.moveAlong",
        driver: "rakan",
        path: { from: 0, to: 1 },
        durationMs: 22000
      }
    },
    {
      at: 42000,
      cmd: {
        type: "ticker.push",
        tag: "SHUTTLE",
        text: {
          en: "[SHUTTLE] Charlie departed Ritz-Carlton for KAFD Plenary via the Sovereign Financial Corridor.",
          ar: "[حافلة] تشارلي غادرت الريتز-كارلتون إلى قاعة كافد عبر الممر المالي السيادي."
        }
      }
    },
    { at: 54000, cmd: { type: "ticker.push", text: filler(4) } }
  ]
};

const act4: Act = {
  id: "sandstorm",
  title: { en: "Act 4 · Sandstorm", ar: "الفصل 4 · العاصفة الرملية" },
  subtitle: {
    en: "Corridor closed; Shuttle Charlie rerouted in real time",
    ar: "إغلاق الممر وإعادة توجيه الحافلة تشارلي فورياً"
  },
  durationMs: T.act4.durationMs,
  setup: [
    { type: "scorecard", visible: false },
    {
      type: "tminus.set",
      inMs: -(T.act1.durationMs + T.act2.durationMs + T.act3.durationMs)
    },
    ...corridorsNormal,
    { type: "flight.setPhase", flightNo: "SV 1044", phase: "DEPARTED_AIRPORT" },
    { type: "flight.setPhase", flightNo: "SV 102", phase: "DEPARTED_AIRPORT" },
    { type: "flight.setPhase", flightNo: "BA 263", phase: "DEPARTED_AIRPORT" },
    { type: "flight.setPhase", flightNo: "EK 2042", phase: "CHAUFFEUR_READY" },
    {
      type: "convoy.place",
      driver: "sultan",
      path: { from: 4, to: 5, stopShortMeters: 120 }
    },
    { type: "convoy.place", driver: "fahad", path: { from: 0, to: 3 } },
    { type: "convoy.place", driver: "rakan", path: { from: 0, to: 1 } },
    { type: "convoy.place", driver: "tariq", path: { from: 0, to: 2 } },
    { type: "convoy.place", driver: "nasser", path: { from: 0, to: 1 } },
    { type: "task.setStatus", task: "airport", status: "ARRIVED" },
    { type: "task.setStatus", task: "venue", status: "EN_ROUTE" }
  ],
  beats: [
    {
      at: 0,
      cmd: { type: "camera.frameCorridor", code: "SOVEREIGN_FINANCIAL" }
    },
    {
      at: 500,
      cmd: {
        type: "ticker.push",
        tag: "WEATHER",
        text: {
          en: "[WEATHER] NCM advisory: sandstorm cell crossing King Fahd Rd · visibility dropping.",
          ar: "[طقس] تنبيه المركز الوطني للأرصاد: خلية غبار تعبر طريق الملك فهد · انخفاض الرؤية."
        }
      }
    },
    {
      at: 6000,
      cmd: {
        type: "corridor.setState",
        code: "SOVEREIGN_FINANCIAL",
        state: "closed",
        reason: {
          en: "Sandstorm · visibility below limit",
          ar: "عاصفة رملية · الرؤية دون الحد"
        }
      }
    },
    {
      at: 6000,
      cmd: {
        type: "fleet.diverted",
        message: {
          en: "Sovereign Financial Corridor closed — Shuttle Charlie rerouting.",
          ar: "إغلاق الممر المالي السيادي — إعادة توجيه الحافلة تشارلي."
        }
      }
    },
    { at: 6000, cmd: { type: "highlight", panelId: "missionLog" } },
    {
      at: 6500,
      cmd: {
        type: "toast",
        tone: "alert",
        title: { en: "Corridor closed", ar: "إغلاق الممر" },
        message: {
          en: "Sovereign Financial Corridor · sandstorm.",
          ar: "الممر المالي السيادي · عاصفة رملية."
        }
      }
    },
    { at: 9000, cmd: { type: "ai.brief", promptId: "sandstorm_reroute" } },
    {
      at: 9200,
      cmd: {
        type: "ticker.push",
        tag: "AI",
        text: {
          en: "[AI] Sovereign AI evaluating alternates for Shuttle Charlie against the SLA buffer.",
          ar: "[ذكاء] الذكاء السيادي يقيّم المسارات البديلة للحافلة تشارلي ضمن هامش اتفاقية الخدمة."
        }
      }
    },
    {
      at: 14000,
      cmd: {
        type: "corridor.setState",
        code: "SOVEREIGN_FINANCIAL",
        state: "reroute",
        reason: {
          en: "Diverted via Prince Mohammed bin Salman Rd",
          ar: "تحويل عبر طريق الأمير محمد بن سلمان"
        }
      }
    },
    {
      at: 14200,
      cmd: {
        type: "ticker.push",
        tag: "REROUTE",
        text: {
          en: "[REROUTE] Charlie diverted via Prince Mohammed bin Salman Rd · inside the SLA buffer.",
          ar: "[تحويل] تشارلي عبر طريق الأمير محمد بن سلمان · ضمن هامش اتفاقية الخدمة."
        }
      }
    },
    {
      at: 16000,
      cmd: {
        type: "convoy.moveAlong",
        driver: "rakan",
        path: { points: CHARLIE_DETOUR },
        durationMs: 60000
      }
    },
    {
      at: 18000,
      cmd: { type: "camera.focusConvoy", driver: "rakan", zoom: 14 }
    },
    {
      at: 40000,
      cmd: {
        type: "ticker.push",
        tag: "ESCORT",
        text: {
          en: "[ESCORT] Traffic police clearing the Northern Ring junction ahead of Charlie.",
          ar: "[مرافقة] دوريات المرور تخلي تقاطع الدائري الشمالي أمام تشارلي."
        }
      }
    },
    {
      at: 62000,
      cmd: {
        type: "ticker.push",
        tag: "SLA",
        text: {
          en: "[SLA] Diversion absorbed within the contractual buffer · no delay alert raised.",
          ar: "[اتفاقية الخدمة] تم استيعاب التحويل ضمن الهامش التعاقدي · دون تنبيه تأخير."
        }
      }
    },
    { at: 78000, cmd: { type: "camera.overview" } },
    {
      at: 80000,
      cmd: {
        type: "ticker.push",
        tag: "ARRIVAL",
        text: {
          en: "[ARRIVAL] Charlie docked at the KAFD Plenary VIP drop-off.",
          ar: "[وصول] تشارلي رست عند نقطة إنزال كبار الشخصيات بكافد."
        }
      }
    },
    {
      at: 84000,
      cmd: {
        type: "corridor.setState",
        code: "SOVEREIGN_FINANCIAL",
        state: "normal"
      }
    },
    {
      at: 84200,
      cmd: {
        type: "ticker.push",
        tag: "CORRIDOR",
        text: {
          en: "[CORRIDOR] Sovereign Financial Corridor reopened.",
          ar: "[ممر] إعادة فتح الممر المالي السيادي."
        }
      }
    }
  ]
};

const act5: Act = {
  id: "arrival-scorecard",
  title: {
    en: "Act 5 · Arrival & Scorecard",
    ar: "الفصل 5 · الوصول وبطاقة الأداء"
  },
  subtitle: {
    en: "Docked at the delegation base; the operation's numbers",
    ar: "الرسو في مقر الوفود وأرقام العملية"
  },
  durationMs: T.act5.durationMs,
  setup: [
    { type: "scorecard", visible: false },
    {
      type: "tminus.set",
      inMs: -(
        T.act1.durationMs +
        T.act2.durationMs +
        T.act3.durationMs +
        T.act4.durationMs
      )
    },
    ...corridorsNormal,
    { type: "flight.setPhase", flightNo: "SV 1044", phase: "DEPARTED_AIRPORT" },
    { type: "flight.setPhase", flightNo: "SV 102", phase: "DEPARTED_AIRPORT" },
    { type: "flight.setPhase", flightNo: "BA 263", phase: "DEPARTED_AIRPORT" },
    { type: "flight.setPhase", flightNo: "EK 2042", phase: "DEPARTED_AIRPORT" },
    {
      type: "convoy.place",
      driver: "sultan",
      path: { from: 4, to: 5, stopShortMeters: 120 }
    },
    { type: "convoy.place", driver: "fahad", path: { from: 0, to: 3 } },
    { type: "convoy.place", driver: "rakan", path: { from: 3, to: 3 } },
    { type: "convoy.place", driver: "tariq", path: { from: 0, to: 2 } },
    { type: "convoy.place", driver: "nasser", path: { from: 0, to: 1 } },
    { type: "task.setStatus", task: "airport", status: "ARRIVED" },
    { type: "task.setStatus", task: "venue", status: "COMPLETED" }
  ],
  beats: [
    { at: 0, cmd: { type: "camera.focusConvoy", driver: "sultan", zoom: 17 } },
    {
      at: 3000,
      cmd: {
        type: "convoy.moveAlong",
        driver: "sultan",
        path: { toward: 5 },
        durationMs: 18000
      }
    },
    { at: 22000, cmd: { type: "guest.arrived", vipId: "vip-1" } },
    {
      at: 22000,
      cmd: { type: "task.setStatus", task: "airport", status: "COMPLETED" }
    },
    { at: 22000, cmd: { type: "highlight", panelId: "heartbeat" } },
    {
      at: 22200,
      cmd: {
        type: "ticker.push",
        tag: "PROTOCOL",
        text: {
          en: "[PROTOCOL] VIP arrived at The Ritz-Carlton delegation base · airport task closed.",
          ar: "[مراسم] وصول الضيفة إلى مقر الوفود بالريتز-كارلتون · إغلاق مهمة المطار."
        }
      }
    },
    {
      at: 23000,
      cmd: {
        type: "toast",
        tone: "success",
        title: { en: "Guest arrived", ar: "وصلت الضيفة" },
        message: {
          en: "Door-to-door under full escort.",
          ar: "من الباب إلى الباب بمرافقة كاملة."
        }
      }
    },
    {
      at: 28000,
      cmd: {
        type: "convoy.moveAlong",
        driver: "nasser",
        path: { from: 1, to: 2 },
        durationMs: 40000
      }
    },
    { at: 36000, cmd: { type: "scorecard", visible: true } },
    { at: 36000, cmd: { type: "audio.cue", cue: "chime" } },
    {
      at: 36200,
      cmd: {
        type: "ticker.push",
        tag: "SCORECARD",
        text: {
          en: "[SCORECARD] Sovereign Arrival complete · scorecard on screen.",
          ar: "[بطاقة الأداء] اكتمال الوصول السيادي · بطاقة الأداء على الشاشة."
        }
      }
    },
    { at: 60000, cmd: { type: "camera.overview" } },
    { at: 70000, cmd: { type: "ticker.push", text: filler(9) } }
  ]
};

export const sovereignArrival: Script = {
  id: "sovereign-arrival",
  title: { en: "Sovereign Arrival", ar: "الوصول السيادي" },
  acts: [act1, act2, act3, act4, act5]
};
