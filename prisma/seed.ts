import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.captainFeedback.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.fileAsset.deleteMany();
  await prisma.companyReport.deleteMany();
  await prisma.coordinatorRequest.deleteMany();
  await prisma.guestJourneyRecord.deleteMany();
  await prisma.vaultSession.deleteMany();
  await prisma.vendorContract.deleteMany();
  await prisma.vendorQuote.deleteMany();
  await prisma.aiLogisticsPlan.deleteMany();
  await prisma.activityIntake.deleteMany();
  await prisma.message.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.booking.deleteMany();
  await prisma.service.deleteMany();
  await prisma.supplier.deleteMany();
  await prisma.task.deleteMany();
  await prisma.driver.deleteMany();
  await prisma.hospitalityRider.deleteMany();
  await prisma.guest.deleteMany();
  await prisma.event.deleteMany();
  await prisma.user.deleteMany();
  await prisma.commissionConfig.deleteMany();
  await prisma.cityConfig.deleteMany();

  const passwordHash = await bcrypt.hash("Midyaf@2026", 12);

  const city = await prisma.cityConfig.create({
    data: {
      code: "riyadh",
      nameAr: "الرياض",
      nameEn: "Riyadh",
      centerLat: 24.7136,
      centerLng: 46.6753,
      defaultZoom: 12,
      timezone: "Asia/Riyadh",
      currency: "SAR",
      vatPercent: 15,
      enabled: true
    }
  });

  await prisma.commissionConfig.createMany({
    data: [
      { defaultPercent: 12, minPercent: 10, maxPercent: 15 },
      {
        category: "HOTEL",
        defaultPercent: 12,
        minPercent: 10,
        maxPercent: 15,
        sponsoredPlacementPrice: 2500
      },
      {
        category: "CAR",
        defaultPercent: 15,
        minPercent: 10,
        maxPercent: 15,
        sponsoredPlacementPrice: 1800
      },
      {
        category: "CATERING",
        defaultPercent: 11,
        minPercent: 10,
        maxPercent: 15,
        sponsoredPlacementPrice: 2200
      }
    ]
  });

  const [
    organizer,
    admin,
    companyUser,
    coordinatorUser,
    guestA,
    guestB,
    driverUser,
    sultanUser,
    rakanUser,
    tariqUser,
    nasserUser,
    supplierUser
  ] =
    await Promise.all([
      prisma.user.create({
        data: {
          name: "Rashed Mohamed",
          email: "organizer@midyaf.local",
          phone: "+966500000001",
          role: "LOGISTICS_MANAGER",
          language: "en",
          passwordHash
        }
      }),
      prisma.user.create({
        data: {
          name: "Mohamed Izeldin",
          email: "admin@midyaf.local",
          phone: "+966500000002",
          role: "SUPER_ADMIN",
          language: "en",
          passwordHash
        }
      }),
      prisma.user.create({
        data: {
          name: "Organizing Company Ops",
          email: "company@midyaf.local",
          phone: "+966500000007",
          role: "COMPANY_ORGANIZER",
          language: "en",
          passwordHash
        }
      }),
      prisma.user.create({
        data: {
          name: "Rakan Transport Coordinator",
          email: "coordinator@midyaf.local",
          phone: "+966500000008",
          role: "COORDINATOR",
          language: "ar",
          passwordHash
        }
      }),
      prisma.user.create({
        data: {
          name: "Noura Al Harbi",
          email: "guest.vip@midyaf.local",
          phone: "+966500000003",
          role: "GUEST",
          language: "ar",
          avatar: "/avatars/noura.png",
          passwordHash
        }
      }),
      prisma.user.create({
        data: {
          name: "Omar Khan",
          email: "guest@midyaf.local",
          phone: "+966500000004",
          role: "GUEST",
          language: "en",
          passwordHash
        }
      }),
      prisma.user.create({
        data: {
          name: "Fahad Al Qahtani",
          email: "driver@midyaf.local",
          phone: "+966500000005",
          role: "DRIVER",
          language: "ar",
          passwordHash
        }
      }),
      prisma.user.create({
        data: {
          name: "Sultan Al-Otaibi",
          email: "sultan.drv@midyaf.local",
          phone: "+966509991119",
          role: "DRIVER",
          language: "ar",
          passwordHash
        }
      }),
      prisma.user.create({
        data: {
          name: "Rakan Al-Dossary",
          email: "rakan.drv@midyaf.local",
          phone: "+966508882228",
          role: "DRIVER",
          language: "ar",
          passwordHash
        }
      }),
      prisma.user.create({
        data: {
          name: "Tariq Al-Ghamdi",
          email: "tariq.drv@midyaf.local",
          phone: "+966507773337",
          role: "DRIVER",
          language: "ar",
          passwordHash
        }
      }),
      prisma.user.create({
        data: {
          name: "Nasser Al-Mutairi",
          email: "nasser.drv@midyaf.local",
          phone: "+966506664446",
          role: "DRIVER",
          language: "ar",
          passwordHash
        }
      }),
      prisma.user.create({
        data: {
          name: "Riyadh Elite Hospitality",
          email: "supplier@midyaf.local",
          phone: "+966500000006",
          role: "SUPPLIER",
          language: "en",
          passwordHash
        }
      })
    ]);

  const [silaOps, silaFinance, midyafAuditor] = await Promise.all([
    prisma.user.create({
      data: {
        name: "Khalid Al-Omar (Sila Ops)",
        email: "khalid.ops@sila.com",
        phone: "+966501112233",
        role: "LOGISTICS_MANAGER",
        language: "en",
        passwordHash
      }
    }),
    prisma.user.create({
      data: {
        name: "Noura Al-Saud (Sila Finance)",
        email: "noura.fin@sila.com",
        phone: "+966504445566",
        role: "COMPANY_ORGANIZER",
        language: "en",
        passwordHash
      }
    }),
    prisma.user.create({
      data: {
        name: "Midyaf Compliance Auditor",
        email: "auditor@midyaf.com",
        phone: "+966507778899",
        role: "SUPER_ADMIN",
        language: "en",
        passwordHash
      }
    })
  ]);

  const event = await prisma.event.create({
    data: {
      name: "Riyadh Future Hospitality Summit",
      date: new Date("2026-09-21T17:00:00+03:00"),
      venue: "King Abdullah Financial District",
      venueLat: 24.7642,
      venueLng: 46.6406,
      cityId: city.id,
      organizerId: organizer.id,
      status: "LIVE",
      brief:
        "VIP investor reception and conference requiring airport transfers, premium hotel rooms, catering, and cultural tours."
    }
  });

  const [vipGuest, standardGuest] = await Promise.all([
    prisma.guest.create({
      data: {
        userId: guestA.id,
        eventId: event.id,
        rsvpStatus: "CONFIRMED",
        isVIP: true,
        tier: "platinum",
        qrCode: "MIDYAF-RUH-VIP-0001"
      }
    }),
    prisma.guest.create({
      data: {
        userId: guestB.id,
        eventId: event.id,
        rsvpStatus: "CONFIRMED",
        isVIP: false,
        qrCode: "MIDYAF-RUH-GST-0002"
      }
    })
  ]);

  await prisma.hospitalityRider.create({
    data: {
      guestId: vipGuest.id,
      dietaryNeeds: [
        "Halal catering only",
        "Ajwa Saudi dates upon arrival",
        "Chilled Evian mineral water in glass bottles",
        "Sugar-free Arabic coffee blend"
      ],
      roomPreferences: [
        "Room temperature maintained at 21°C",
        "King size bed with firm memory foam pillows",
        "High floor overlooking KAFD",
        "Welcome floral arrangement of white roses"
      ],
      vehicleRider: [
        "Black GMC Yukon or Mercedes S-Class only",
        "Maintain vehicle AC at 20°C",
        "Quiet driver / no unnecessary conversation",
        "Tinted privacy windows",
        "Apple Lightning and USB Type-C charging cables"
      ],
      securityNotes: [
        "Bilingual English/Arabic driver required",
        "VIP luggage priority handling at Gate A4"
      ],
      fulfilled: false
    }
  });

  const [driver, sultanDriver, rakanDriver, tariqDriver, nasserDriver] = await Promise.all([
    prisma.driver.create({
      data: {
        userId: driverUser.id,
        licenseNo: "RUH-DRV-8841",
        nationalIdIqama: "1029384756",
        currentLat: 24.7642,
        currentLng: 46.6406,
        zone: "CENTRAL_RIYADH",
        status: "AVAILABLE",
        shiftStart: new Date("2026-09-21T12:00:00+03:00"),
        shiftEnd: new Date("2026-09-21T23:00:00+03:00"),
        earnings: 420
      }
    }),
    prisma.driver.create({
      data: {
        userId: sultanUser.id,
        licenseNo: "RUH-DRV-9119",
        nationalIdIqama: "1088776655",
        currentLat: 24.9576,
        currentLng: 46.6988,
        zone: "NORTH_RIYADH",
        status: "EN_ROUTE",
        shiftStart: new Date("2026-09-21T10:00:00+03:00"),
        shiftEnd: new Date("2026-09-21T22:00:00+03:00"),
        earnings: 750
      }
    }),
    prisma.driver.create({
      data: {
        userId: rakanUser.id,
        licenseNo: "RUH-DRV-7788",
        nationalIdIqama: "1044332211",
        currentLat: 24.6661,
        currentLng: 46.6302,
        zone: "WEST_RIYADH",
        status: "EN_ROUTE",
        shiftStart: new Date("2026-09-21T08:00:00+03:00"),
        shiftEnd: new Date("2026-09-21T20:00:00+03:00"),
        earnings: 580
      }
    }),
    prisma.driver.create({
      data: {
        userId: tariqUser.id,
        licenseNo: "RUH-DRV-5544",
        nationalIdIqama: "1055667788",
        currentLat: 24.8500,
        currentLng: 46.7300,
        zone: "EAST_RIYADH",
        status: "AVAILABLE",
        shiftStart: new Date("2026-09-21T11:00:00+03:00"),
        shiftEnd: new Date("2026-09-21T23:00:00+03:00"),
        earnings: 490
      }
    }),
    prisma.driver.create({
      data: {
        userId: nasserUser.id,
        licenseNo: "RUH-DRV-1122",
        nationalIdIqama: "1099887766",
        currentLat: 24.7335,
        currentLng: 46.5742,
        zone: "DIRIYAH_CORRIDOR",
        status: "EN_ROUTE",
        shiftStart: new Date("2026-09-21T14:00:00+03:00"),
        shiftEnd: new Date("2026-09-22T02:00:00+03:00"),
        earnings: 820
      }
    })
  ]);

  await prisma.task.createMany({
    data: [
      {
        eventId: event.id,
        driverId: driver.id,
        guestId: vipGuest.id,
        type: "AIRPORT_PICKUP",
        status: "EN_ROUTE",
        pickupLocation: "King Khalid International Airport",
        dropoffLocation: "Mandarin Oriental Al Faisaliah",
        pickupLat: 24.9576,
        pickupLng: 46.6988,
        dropoffLat: 24.6907,
        dropoffLng: 46.6851,
        scheduledAt: new Date("2026-09-21T13:30:00+03:00")
      },
      {
        eventId: event.id,
        guestId: standardGuest.id,
        type: "VENUE_TRANSFER",
        status: "PENDING",
        pickupLocation: "Voco Riyadh",
        dropoffLocation: "King Abdullah Financial District",
        pickupLat: 24.6667,
        pickupLng: 46.7001,
        dropoffLat: 24.7642,
        dropoffLng: 46.6406,
        scheduledAt: new Date("2026-09-21T16:10:00+03:00")
      }
    ]
  });

  const hotel = await prisma.supplier.create({
    data: {
      userId: supplierUser.id,
      cityId: city.id,
      name: "Najd Palace Suites",
      category: "HOTEL",
      rating: 4.8,
      verified: true,
      crNumber: "1010999988",
      commissionPercent: 12,
      sponsoredRank: 1,
      zone: "CENTRAL_RIYADH"
    }
  });

  const fleet = await prisma.supplier.create({
    data: {
      cityId: city.id,
      name: "Diriyah Executive Cars",
      category: "CAR",
      rating: 4.7,
      verified: true,
      crNumber: "1010888877",
      commissionPercent: 15,
      sponsoredRank: 2,
      zone: "DIRIYAH_CORRIDOR"
    }
  });

  const catering = await prisma.supplier.create({
    data: {
      cityId: city.id,
      name: "Saffron Majlis Catering",
      category: "CATERING",
      rating: 4.6,
      verified: true,
      crNumber: "1010777766",
      commissionPercent: 11,
      zone: "CENTRAL_RIYADH"
    }
  });

  const [suiteService, carService, cateringService] = await Promise.all([
    prisma.service.create({
      data: {
        supplierId: hotel.id,
        name: "Executive suite night",
        price: 1850,
        unit: "night",
        description: "Premium room with Arabic welcome amenities."
      }
    }),
    prisma.service.create({
      data: {
        supplierId: fleet.id,
        name: "VIP SUV transfer",
        price: 320,
        unit: "trip",
        description: "Bilingual chauffeur and bottled water."
      }
    }),
    prisma.service.create({
      data: {
        supplierId: catering.id,
        name: "Luxury Saudi coffee service",
        price: 95,
        unit: "guest",
        description: "Dates, Saudi coffee, and premium display equipment."
      }
    })
  ]);

  await prisma.booking.createMany({
    data: [
      {
        eventId: event.id,
        supplierId: hotel.id,
        serviceId: suiteService.id,
        quantity: 12,
        totalPrice: 22200,
        commissionPercent: 12,
        commissionAmount: 2664,
        status: "CONFIRMED"
      },
      {
        eventId: event.id,
        supplierId: fleet.id,
        serviceId: carService.id,
        quantity: 28,
        totalPrice: 8960,
        commissionPercent: 15,
        commissionAmount: 1344,
        status: "CONFIRMED"
      },
      {
        eventId: event.id,
        supplierId: catering.id,
        serviceId: cateringService.id,
        quantity: 120,
        totalPrice: 11400,
        commissionPercent: 11,
        commissionAmount: 1254,
        status: "PENDING"
      }
    ]
  });

  await prisma.notification.createMany({
    data: [
      {
        userId: organizer.id,
        title: "VIP route active",
        body: "Fahad is en route from RUH airport to the hotel."
      },
      {
        userId: guestA.id,
        title: "Welcome to Riyadh",
        body: "Noura can suggest a Diriyah dinner after check-in."
      },
      {
        userId: admin.id,
        title: "Commission forecast",
        body: "Confirmed bookings generated SAR 4,008 in platform commission."
      }
    ]
  });

  await prisma.message.create({
    data: {
      senderId: guestA.id,
      receiverId: organizer.id,
      body: "Can Saud arrange a quiet dinner near Diriyah tonight?"
    }
  });

  const activityIntake = await prisma.activityIntake.create({
    data: {
      eventId: event.id,
      activityName: "Riyadh Season International Guests Program",
      activityPlace: "Boulevard City, Riyadh",
      visitorCount: 96,
      vipVisitorCount: 18,
      normalVisitorCount: 78,
      transportationType: "MIXED",
      ticketType: "MIXED",
      hotelType: "MIXED",
      carType: "MIXED",
      status: "OPERATIONS_OPEN",
      submittedBy: "Organizing Company Ops",
      submittedAt: new Date("2026-09-10T11:00:00+03:00")
    }
  });

  await prisma.aiLogisticsPlan.create({
    data: {
      intakeId: activityIntake.id,
      summary:
        "VIP guests receive dedicated cars for the full Riyadh stay. Normal guests are grouped into 3-4 person shuttle movements.",
      assumptions: [
        "18 VIP guests require full-stay vehicle allocation.",
        "78 normal guests grouped into shuttle movements.",
        "First class tickets are reserved for VIP guests.",
        "Five-star rooms are reserved for VIPs; four-star rooms for normal guests."
      ],
      visitorGrouping: "18 VIP dedicated vehicles; 78 normal guests in groups.",
      vipCars: 18,
      shuttleVehicles: 11,
      hotelRooms: 61,
      firstClassTickets: 18,
      normalTickets: 78,
      phases: [
        {
          name: "Vendor quotation collection",
          owner: "Procurement Manager",
          deadline: "2026-09-12T18:00:00+03:00",
          status: "CONFIRMED"
        },
        {
          name: "Arrival operations",
          owner: "Airport Supervisor",
          deadline: "2026-09-21T23:00:00+03:00",
          status: "IN_PROGRESS"
        }
      ],
      risks: [
        "Passport control delays could bunch VIP arrivals.",
        "Boulevard City evening traffic requires early departure windows."
      ],
      confirmed: true
    }
  });

  const [hotelQuote, carQuote, ritzQuote, fleetVipQuote] = await prisma.$transaction([
    prisma.vendorQuote.create({
      data: {
        intakeId: activityIntake.id,
        category: "HOTEL_OPERATOR",
        vendorName: "The Ritz-Carlton Riyadh",
        item: "100 Royal Suites (FII 2027 Delegation)",
        quantity: 100,
        unitPrice: 12500,
        totalPrice: 1250000,
        commissionPercent: 10,
        commissionAmount: 125000,
        score: 98,
        status: "APPROVED",
        isVaultSealed: true
      }
    }),
    prisma.vendorQuote.create({
      data: {
        intakeId: activityIntake.id,
        category: "CAR_RENTAL",
        vendorName: "Royal Fleet VIP Services",
        item: "50 Mercedes S-Class Chauffeur Fleet (5 Days)",
        quantity: 50,
        unitPrice: 9000,
        totalPrice: 450000,
        commissionPercent: 10,
        commissionAmount: 45000,
        score: 95,
        status: "RECOMMENDED",
        isVaultSealed: true
      }
    }),
    prisma.vendorQuote.create({
      data: {
        intakeId: activityIntake.id,
        category: "HOTEL_OPERATOR",
        vendorName: "Four Seasons Hotel Riyadh",
        item: "100 Luxury Executive Rooms",
        quantity: 100,
        unitPrice: 13000,
        totalPrice: 1300000,
        commissionPercent: 10,
        commissionAmount: 130000,
        score: 92,
        status: "RECEIVED",
        isVaultSealed: true
      }
    }),
    prisma.vendorQuote.create({
      data: {
        intakeId: activityIntake.id,
        category: "CAR_RENTAL",
        vendorName: "Elite Drive Co.",
        item: "50 BMW 7-Series VIP Fleet",
        quantity: 50,
        unitPrice: 8400,
        totalPrice: 420000,
        commissionPercent: 10,
        commissionAmount: 42000,
        score: 89,
        status: "RECEIVED",
        isVaultSealed: true
      }
    })
  ]);

  await prisma.vaultSession.create({
    data: {
      intakeId: activityIntake.id,
      status: "LOCKED"
    }
  });

  await prisma.vendorContract.createMany({
    data: [
      {
        quoteId: hotelQuote.id,
        vendorName: "The Ritz-Carlton Riyadh",
        category: "HOTEL_OPERATOR",
        amount: 1250000,
        commissionAmount: 125000,
        status: "SIGNED",
        signedAt: new Date("2026-09-14T10:00:00+03:00")
      },
      {
        quoteId: carQuote.id,
        vendorName: "Royal Fleet VIP Services",
        category: "CAR_RENTAL",
        amount: 450000,
        commissionAmount: 45000,
        status: "SIGNED",
        signedAt: new Date("2026-09-14T11:30:00+03:00")
      },
      {
        quoteId: ritzQuote.id,
        vendorName: "Najd Royal Catering & Banqueting",
        category: "CATERING",
        amount: 180000,
        commissionAmount: 19800,
        status: "SIGNED",
        signedAt: new Date("2026-09-15T09:15:00+03:00")
      },
      {
        quoteId: fleetVipQuote.id,
        vendorName: "Al-Faisal Stage & Acoustic Engineering",
        category: "EQUIPMENT",
        amount: 290000,
        commissionAmount: 34800,
        status: "SIGNED",
        signedAt: new Date("2026-09-15T14:20:00+03:00")
      }
    ]
  });

  await prisma.guestJourneyRecord.create({
    data: {
      guestId: vipGuest.id,
      stage: "ARRIVAL",
      visaStatus: "SENT",
      ticketStatus: "SENT",
      promoVideos: [
        "Welcome to Riyadh hospitality",
        "Riyadh Season experience preview"
      ],
      arrivalStatus: "LUGGAGE",
      arrivalGate: "A4",
      luggageStatus: "RECEIVED",
      driverName: driverUser.name,
      driverPhoto: "/midyaf-logo.jpeg",
      driverPhone: driverUser.phone,
      carDetails: "Black GMC Yukon - RUH 8841",
      etaMinutes: 3,
      personalTripRequests: ["Private dinner transfer after the venue"],
      notes: [
        "Guest photo shared with captain.",
        "Notify guest 3 minutes before car arrives."
      ],
      complaints: [],
      departureFlight: "SV1044",
      departurePickupTime: new Date("2026-09-24T08:40:00+03:00"),
      departureConfirmed: true,
      leavingWithMidyaf: true
    }
  });

  await prisma.coordinatorRequest.createMany({
    data: [
      {
        guestName: guestA.name,
        request: "Personal dinner trip after event",
        route: "Boulevard City to Diriyah, then hotel",
        priority: "VIP",
        status: "SENT_TO_SUPERVISOR",
        supervisor: "North Zone Supervisor",
        deadline: new Date("2026-09-21T20:45:00+03:00")
      },
      {
        guestName: "Normal group 4",
        request: "Add one passenger to shuttle group",
        route: "Voco Riyadh to Boulevard City",
        priority: "NORMAL",
        status: "ASSIGNED",
        supervisor: "Central Shuttle Supervisor",
        deadline: new Date("2026-09-21T16:00:00+03:00")
      }
    ]
  });

  await prisma.companyReport.create({
    data: {
      title: "Riyadh Season logistics daily report",
      status: "MANAGER_CONFIRMED",
      kpis: [
        { label: "Arrival completion", value: "72%" },
        { label: "VIP cars ready", value: "18/18" },
        { label: "Shuttle grouping", value: "20 groups" },
        { label: "Open guest requests", value: "2" }
      ],
      pdfUrl: "/reports/riyadh-season-logistics.pdf"
    }
  });

  await prisma.captainFeedback.create({
    data: {
      driverId: driver.id,
      taskId: "seed-task-feedback",
      rating: 5,
      note: "Guest received at gate A4. VIP vehicle ready."
    }
  });

  console.log("Seed complete: Midyaf Riyadh workspace data is ready.");
  console.log("Seeded local password for all users: Midyaf@2026");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
