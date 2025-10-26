import { Prisma, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const dayMs = 24 * 60 * 60 * 1000;
const isoDaysFromNow = (days: number) => new Date(Date.now() + days * dayMs).toISOString();

const buildOnboardingForm = () => {
  const nowIso = new Date().toISOString();
  return {
    id: "founders-intake",
    version: 1,
    title: "Founders Intake",
    summary: "Baseline information required for new startups joining the programme.",
    updatedAt: nowIso,
    sections: [
      {
        id: "company-overview",
        title: "Company Overview",
        description: "Tell us who you are and what you are building.",
        fields: [
          {
            id: "company-name",
            label: "Company Name",
            type: "text",
            required: true,
            placeholder: "Acme Innovations",
          },
          {
            id: "company-stage",
            label: "Stage",
            type: "select",
            required: true,
            options: [
              { id: "idea", label: "Idea", value: "idea" },
              { id: "mvp", label: "MVP", value: "mvp" },
              { id: "seed", label: "Seed", value: "seed" },
              { id: "growth", label: "Growth", value: "growth" },
            ],
          },
          {
            id: "headcount",
            label: "Full-time team members",
            type: "text",
            required: true,
            placeholder: "e.g. 5",
          },
        ],
      },
      {
        id: "traction",
        title: "Traction",
        description: "Share traction and proof points so far.",
        fields: [
          {
            id: "traction-summary",
            label: "Highlights",
            type: "textarea",
            required: true,
            placeholder: "Monthly revenue, pilots, partnerships, etc.",
          },
          {
            id: "funding-raised",
            label: "Capital raised so far",
            type: "text",
            required: false,
            placeholder: "e.g. INR 50L pre-seed",
          },
        ],
      },
      {
        id: "documents",
        title: "Supporting Documents",
        fields: [
          {
            id: "pitch-deck",
            label: "Pitch deck",
            type: "file",
            required: false,
            description: "Upload the most recent version of your pitch deck.",
          },
        ],
      },
    ],
    scoring: {
      rules: [
        {
          id: "stage-seed",
          fieldId: "company-stage",
          operator: "equals",
          target: "seed",
          points: 20,
          label: "Seed ready traction",
          description: "Seed stage and beyond gets highest priority.",
        },
        {
          id: "team-strong",
          fieldId: "headcount",
          operator: "gte",
          target: "4",
          points: 15,
          label: "Core team assembled",
          description: "Four or more full-time members.",
        },
        {
          id: "traction-keywords",
          fieldId: "traction-summary",
          operator: "contains",
          target: "revenue",
          points: 10,
          label: "Revenue signals",
          description: "Mentions of revenue or paying pilots earn bonus points.",
        },
      ],
      autoRejectBelow: 20,
      autoAdvanceAt: 55,
      totalPoints: 45,
    },
  } satisfies Record<string, unknown>;
};

const seedUsers = async () => {
  // Seed application users
  const users = [
    {
      id: "user-admin",
      email: "director@unified-platform.test",
      name: "Programme Director",
      phone: "+91-90000-00001",
      avatarUrl: "https://avatars.example.com/director.png",
      timezone: "Asia/Kolkata",
      locale: "en-IN",
      metadata: {
        role: "admin",
        permissions: ["onboarding:manage", "grants:approve", "facilities:manage"],
      } satisfies Prisma.JsonObject,
    },
    {
      id: "user-program-manager",
      email: "manager@unified-platform.test",
      name: "Programme Manager",
      phone: "+91-90000-00002",
      avatarUrl: "https://avatars.example.com/manager.png",
      timezone: "Asia/Kolkata",
      locale: "en-IN",
      metadata: {
        role: "program_manager",
        permissions: ["onboarding:review", "grants:review"],
      } satisfies Prisma.JsonObject,
    },
  ];

  for (const user of users) {
    await prisma.user.upsert({
      where: { id: user.id },
      update: {
        email: user.email,
        name: user.name,
        phone: user.phone,
        avatarUrl: user.avatarUrl,
        timezone: user.timezone,
        locale: user.locale,
        metadata: user.metadata,
        isActive: true,
        lastLoginAt: new Date(),
      },
      create: {
        id: user.id,
        email: user.email,
        name: user.name,
        phone: user.phone,
        avatarUrl: user.avatarUrl,
        timezone: user.timezone,
        locale: user.locale,
        metadata: user.metadata,
        isActive: true,
        lastLoginAt: new Date(),
      },
    });
  }
};

const seedOnboardingConfig = async () => {
  const payload = buildOnboardingForm();
  await prisma.onboardingConfig.upsert({
    where: { id: "startup-onboarding-config" },
    update: {
      payload: payload as Prisma.InputJsonValue,
    },
    create: {
      id: "startup-onboarding-config",
      payload: payload as Prisma.InputJsonValue,
      createdAt: new Date(),
    },
  });
};

const seedOnboardingSubmissions = async () => {
  const submissionScore: Record<string, unknown> = {
    total: 45,
    awarded: 32,
    percentage: 71.1,
    status: "advance",
    thresholdAdvance: 55,
    thresholdReject: 20,
    breakdown: [
      {
        ruleId: "stage-seed",
        label: "Seed ready traction",
        points: 20,
        matched: true,
      },
      {
        ruleId: "team-strong",
        label: "Core team assembled",
        points: 12,
        matched: true,
      },
    ],
    source: "auto",
    updatedAt: new Date().toISOString(),
    updatedBy: "user-admin",
  };

  const submissions = [
    {
      id: "submission-aeroedge-001",
      userId: "user-admin",
      formId: "founders-intake",
      submittedAt: isoDaysFromNow(-14),
      payload: {
        id: "submission-aeroedge-001",
        userId: "user-admin",
        formId: "founders-intake",
        submittedAt: isoDaysFromNow(-14),
        companyName: "AeroEdge Labs",
        responses: [
          { fieldId: "company-name", value: "AeroEdge Labs" },
          { fieldId: "company-stage", value: "seed" },
          { fieldId: "headcount", value: "6" },
          {
            fieldId: "traction-summary",
            value: "Signed 3 paying pilots with aerospace OEMs and INR 18L ARR.",
          },
          { fieldId: "funding-raised", value: "INR 45L pre-seed" },
        ],
        score: submissionScore,
        scoreAuto: submissionScore,
      },
    },
    {
      id: "submission-biopulse-001",
      userId: "user-program-manager",
      formId: "founders-intake",
      submittedAt: isoDaysFromNow(-10),
      payload: {
        id: "submission-biopulse-001",
        userId: "user-program-manager",
        formId: "founders-intake",
        submittedAt: isoDaysFromNow(-10),
        companyName: "BioPulse Analytics",
        responses: [
          { fieldId: "company-name", value: "BioPulse Analytics" },
          { fieldId: "company-stage", value: "mvp" },
          { fieldId: "headcount", value: "4" },
          {
            fieldId: "traction-summary",
            value: "AI biomarker engine live in 2 hospitals, 200+ patient records processed.",
          },
        ],
        score: {
          ...submissionScore,
          awarded: 28,
          percentage: 62.2,
          updatedBy: "user-program-manager",
        },
        scoreAuto: {
          ...submissionScore,
          awarded: 28,
          percentage: 62.2,
          updatedBy: "user-program-manager",
        },
      },
    },
  ];

  for (const submission of submissions) {
    await prisma.onboardingSubmissionRecord.upsert({
      where: { id: submission.id },
      update: {
        userId: submission.userId,
        formId: submission.formId,
        submittedAt: new Date(submission.submittedAt),
        payload: submission.payload as Prisma.InputJsonValue,
      },
      create: {
        id: submission.id,
        userId: submission.userId,
        formId: submission.formId,
        submittedAt: new Date(submission.submittedAt),
        payload: submission.payload as Prisma.InputJsonValue,
        createdAt: new Date(submission.submittedAt),
      },
    });
  }
};

const seedOnboardingChecklists = async () => {
  const checklists = [
    {
      startupId: "startup-demo-001",
      payload: {
        startupId: "startup-demo-001",
        createdAt: isoDaysFromNow(-15),
        updatedAt: isoDaysFromNow(-3),
        notes: "Kick-off completed, awaiting compliance documents.",
        items: [
          {
            id: "kickoff-call",
            title: "Kick-off call",
            description: "Initial alignment with founder and core team.",
            status: "complete",
            dueDate: isoDaysFromNow(-13),
            updatedAt: isoDaysFromNow(-13),
            completedAt: isoDaysFromNow(-13),
          },
          {
            id: "legal-docs",
            title: "Submit legal documents",
            description: "Articles of incorporation, PAN, GST.",
            status: "in_progress",
            dueDate: isoDaysFromNow(2),
            updatedAt: isoDaysFromNow(-1),
          },
          {
            id: "goal-alignment",
            title: "Define programme goals",
            status: "pending",
            dueDate: isoDaysFromNow(7),
            updatedAt: isoDaysFromNow(-3),
          },
        ],
      },
    },
    {
      startupId: "startup-demo-002",
      payload: {
        startupId: "startup-demo-002",
        createdAt: isoDaysFromNow(-9),
        updatedAt: isoDaysFromNow(-2),
        notes: "Medical compliance review scheduled.",
        items: [
          {
            id: "data-room",
            title: "Set up data room",
            status: "in_progress",
            updatedAt: isoDaysFromNow(-2),
          },
          {
            id: "clinical-advisory",
            title: "Clinical advisory board onboarding",
            status: "pending",
            dueDate: isoDaysFromNow(10),
            updatedAt: isoDaysFromNow(-2),
          },
        ],
      },
    },
  ];

  for (const checklist of checklists) {
    await prisma.onboardingChecklistRecord.upsert({
      where: { startupId: checklist.startupId },
      update: {
        payload: checklist.payload as Prisma.InputJsonValue,
      },
      create: {
        startupId: checklist.startupId,
        payload: checklist.payload as Prisma.InputJsonValue,
      },
    });
  }
};

const seedMilestonePlans = async () => {
  const plans = [
    {
      startupId: "startup-demo-001",
      payload: {
        startupId: "startup-demo-001",
        updatedAt: isoDaysFromNow(-1),
        milestones: [
          {
            id: "milestone-aeroedge-01",
            startupId: "startup-demo-001",
            title: "Wind tunnel validation",
            description: "Complete wind tunnel validation for drone aero surfaces.",
            owner: "Programme Manager",
            category: "Product",
            kpiKey: "validation_runs",
            unit: "tests",
            baselineValue: 0,
            currentValue: 6,
            targetValue: 10,
            dueDate: isoDaysFromNow(21),
            reminderLeadDays: 5,
            reminderCadenceDays: 7,
            status: "on_track",
            progress: 60,
            createdAt: isoDaysFromNow(-20),
            updatedAt: isoDaysFromNow(-1),
          },
        ],
        logs: [
          {
            id: "milestone-aeroedge-01-log-1",
            milestoneId: "milestone-aeroedge-01",
            timestamp: isoDaysFromNow(-5),
            author: "Programme Manager",
            note: "First batch of tests completed with positive lift improvements.",
            progress: 45,
          },
          {
            id: "milestone-aeroedge-01-log-2",
            milestoneId: "milestone-aeroedge-01",
            timestamp: isoDaysFromNow(-1),
            author: "Programme Manager",
            note: "Second batch scheduled for next week.",
            progress: 60,
          },
        ],
      },
    },
    {
      startupId: "startup-demo-002",
      payload: {
        startupId: "startup-demo-002",
        updatedAt: isoDaysFromNow(-2),
        milestones: [
          {
            id: "milestone-biopulse-01",
            startupId: "startup-demo-002",
            title: "Clinical pilot expansion",
            description: "Add two more partner hospitals to the pilot cohort.",
            owner: "Programme Manager",
            category: "Growth",
            kpiKey: "hospitals_onboarded",
            unit: "count",
            baselineValue: 2,
            currentValue: 3,
            targetValue: 4,
            dueDate: isoDaysFromNow(30),
            reminderLeadDays: 7,
            reminderCadenceDays: 10,
            status: "at_risk",
            progress: 50,
            createdAt: isoDaysFromNow(-15),
            updatedAt: isoDaysFromNow(-2),
            notes: "Awaiting compliance clearance from one hospital.",
          },
        ],
        logs: [
          {
            id: "milestone-biopulse-01-log-1",
            milestoneId: "milestone-biopulse-01",
            timestamp: isoDaysFromNow(-4),
            author: "Programme Manager",
            note: "Third hospital onboarded; fourth pending contract signature.",
            progress: 50,
          },
        ],
      },
    },
  ];

  for (const plan of plans) {
    await prisma.onboardingMilestonePlanRecord.upsert({
      where: { startupId: plan.startupId },
      update: {
        payload: plan.payload as Prisma.InputJsonValue,
      },
      create: {
        startupId: plan.startupId,
        payload: plan.payload as Prisma.InputJsonValue,
      },
    });
  }
};

const seedAlumniRecords = async () => {
  const records = [
    {
      startupId: "startup-demo-001",
      payload: {
        startupId: "startup-demo-001",
        status: "in_program",
        cohort: "A-Hub Fall 2024",
        programStartAt: isoDaysFromNow(-30),
        primaryMentor: "Dr. N. Rao",
        supportOwner: "Programme Manager",
        tags: ["aerospace", "hardware"],
        notes: "Strong technical team, needs support on GTM.",
        impactScore: 7.5,
        fundingRaised: 45_00_000,
        revenueRunRate: 18_00_000,
        jobsCreated: 14,
        currency: "INR",
        lastContactAt: isoDaysFromNow(-1),
        nextCheckInAt: isoDaysFromNow(6),
        createdAt: isoDaysFromNow(-30),
        updatedAt: isoDaysFromNow(-1),
        metrics: [
          {
            id: "metric-aeroedge-revenue",
            key: "monthly-revenue",
            label: "Monthly Recurring Revenue",
            value: 180000,
            unit: "INR",
            recordedAt: isoDaysFromNow(-5),
          },
          {
            id: "metric-aeroedge-pilots",
            key: "pilots",
            label: "Active Pilots",
            value: 3,
            recordedAt: isoDaysFromNow(-5),
          },
        ],
        touchpoints: [
          {
            id: "touchpoint-aeroedge-1",
            recordedAt: isoDaysFromNow(-1),
            recordedBy: "Programme Manager",
            channel: "meeting",
            highlight: "Demoed updated aerofoil; investors impressed.",
            sentiment: "positive",
            notes: "Working on manufacturing partner shortlist.",
            nextActionAt: isoDaysFromNow(5),
            nextActionOwner: "Programme Director",
          },
        ],
      },
    },
    {
      startupId: "startup-demo-002",
      payload: {
        startupId: "startup-demo-002",
        status: "in_program",
        cohort: "A-Hub Fall 2024",
        programStartAt: isoDaysFromNow(-28),
        primaryMentor: "Dr. S. Iyer",
        supportOwner: "Programme Manager",
        tags: ["healthtech", "ai"],
        notes: "Need regulatory expert introductions.",
        impactScore: 6.8,
        fundingRaised: 30_00_000,
        revenueRunRate: 12_00_000,
        jobsCreated: 9,
        currency: "INR",
        lastContactAt: isoDaysFromNow(-2),
        nextCheckInAt: isoDaysFromNow(4),
        createdAt: isoDaysFromNow(-28),
        updatedAt: isoDaysFromNow(-2),
        metrics: [
          {
            id: "metric-biopulse-patients",
            key: "patients-analysed",
            label: "Patient Records Analysed",
            value: 200,
            recordedAt: isoDaysFromNow(-3),
          },
        ],
        touchpoints: [
          {
            id: "touchpoint-biopulse-1",
            recordedAt: isoDaysFromNow(-2),
            recordedBy: "Programme Manager",
            channel: "call",
            highlight: "Secured new pilot hospital in Vizag.",
            sentiment: "positive",
            notes: "Need follow-up call with legal on data sharing.",
          },
        ],
      },
    },
  ];

  for (const record of records) {
    await prisma.onboardingAlumniRecordStorage.upsert({
      where: { startupId: record.startupId },
      update: {
        payload: record.payload as Prisma.InputJsonValue,
      },
      create: {
        startupId: record.startupId,
        payload: record.payload as Prisma.InputJsonValue,
      },
    });
  }
};

const seedGrantCatalogs = async () => {
  const grantCatalogs = [
    {
      startupId: "startup-demo-001",
      payload: {
        version: 1,
        updatedAt: new Date().toISOString(),
        grants: [
          {
            id: "grant-aeroedge-ignite",
            name: "Ignite Innovation Grant",
            fundingAgency: "National Innovation Fund",
            program: "Ignite",
            sanctionNumber: "IGN-2024-001",
            sanctionDate: isoDaysFromNow(-40),
            totalSanctionedAmount: 50_00_000,
            currency: "INR",
            managingDepartment: "Innovation",
            purpose: "Product validation and manufacturing readiness.",
            startDate: isoDaysFromNow(-35),
            endDate: isoDaysFromNow(180),
            disbursements: [
              {
                id: "disb-aeroedge-1",
                amount: 10_00_000,
                date: isoDaysFromNow(-20),
                tranche: "Phase 1",
                reference: "IGN-2024-001-T1",
                status: "released",
                approvals: [
                  {
                    id: "approval-aeroedge-1",
                    status: "approved",
                    note: "Milestone validated.",
                    actorId: "user-program-manager",
                    actorName: "Programme Manager",
                    actorEmail: "manager@unified-platform.test",
                    decidedAt: isoDaysFromNow(-19),
                  },
                ],
                releasedAt: isoDaysFromNow(-18),
                metadata: { notes: "Released after milestone review" },
              },
              {
                id: "disb-aeroedge-2",
                amount: 8_00_000,
                date: isoDaysFromNow(7),
                tranche: "Phase 2",
                status: "pending",
                targetReleaseDate: isoDaysFromNow(7),
                approvals: [],
              },
            ],
            expenditures: [
              {
                id: "exp-aeroedge-1",
                category: "R&D Equipment",
                description: "Additive manufacturing for aerofoil prototypes",
                amount: 2_50_000,
                date: isoDaysFromNow(-10),
                vendor: "RapidFab Labs",
                invoiceNumber: "RF-INV-4451",
                supportingDocs: ["s3://documents/aeroedge/rf-invoice.pdf"],
              },
            ],
            compliance: [
              {
                id: "comp-aeroedge-1",
                title: "Quarterly utilisation certificate",
                dueDate: isoDaysFromNow(20),
                status: "in_progress",
                owner: "Programme Manager",
              },
            ],
            metadata: { focusArea: "Aerospace" },
          },
        ],
      },
    },
    {
      startupId: "startup-demo-002",
      payload: {
        version: 1,
        updatedAt: new Date().toISOString(),
        grants: [
          {
            id: "grant-biopulse-health",
            name: "Digital Health Acceleration Grant",
            fundingAgency: "Healthcare Innovation Council",
            program: "Digital Health",
            sanctionNumber: "DH-2024-112",
            sanctionDate: isoDaysFromNow(-50),
            totalSanctionedAmount: 35_00_000,
            currency: "INR",
            managingDepartment: "Healthcare",
            purpose: "Clinical validation and AI explainability tooling.",
            startDate: isoDaysFromNow(-45),
            endDate: isoDaysFromNow(150),
            disbursements: [
              {
                id: "disb-biopulse-1",
                amount: 7_50_000,
                date: isoDaysFromNow(-25),
                tranche: "Phase 1",
                reference: "DH-2024-112-T1",
                status: "released",
                approvals: [
                  {
                    id: "approval-biopulse-1",
                    status: "approved",
                    note: "Pilot metrics verified.",
                    actorId: "user-program-manager",
                    actorName: "Programme Manager",
                    actorEmail: "manager@unified-platform.test",
                    decidedAt: isoDaysFromNow(-24),
                  },
                ],
                releasedAt: isoDaysFromNow(-23),
              },
            ],
            expenditures: [
              {
                id: "exp-biopulse-1",
                category: "Clinical Ops",
                description: "Regulatory documentation and ethics approvals",
                amount: 1_20_000,
                date: isoDaysFromNow(-12),
                vendor: "Compliance Partners LLP",
                invoiceNumber: "CP-2024-09",
              },
            ],
            compliance: [
              {
                id: "comp-biopulse-1",
                title: "IRB compliance report",
                dueDate: isoDaysFromNow(15),
                status: "pending",
                owner: "Programme Manager",
              },
            ],
            metadata: { focusArea: "HealthTech" },
          },
        ],
      },
    },
  ];

  for (const catalog of grantCatalogs) {
    await prisma.onboardingGrantCatalogRecord.upsert({
      where: { startupId: catalog.startupId },
      update: {
        payload: catalog.payload as Prisma.InputJsonValue,
      },
      create: {
        startupId: catalog.startupId,
        payload: catalog.payload as Prisma.InputJsonValue,
      },
    });
  }
};

const seedDocuments = async () => {
  const documents = [
    {
      id: "doc-aeroedge-charter",
      startupId: "startup-demo-001",
      key: "aeroedge/company-charter.pdf",
      name: "Company Charter",
      size: 24576,
      contentType: "application/pdf",
      uploadedAt: new Date(isoDaysFromNow(-12)),
      uploadedBy: "director@unified-platform.test",
      metadata: { category: "legal", tags: ["foundational", "verified"] } satisfies Prisma.JsonObject,
    },
    {
      id: "doc-biopulse-compliance",
      startupId: "startup-demo-002",
      key: "biopulse/compliance-summary.pdf",
      name: "Clinical Compliance Summary",
      size: 19760,
      contentType: "application/pdf",
      uploadedAt: new Date(isoDaysFromNow(-8)),
      uploadedBy: "manager@unified-platform.test",
      metadata: { category: "compliance", tags: ["medical", "confidential"] } satisfies Prisma.JsonObject,
    },
  ];

  for (const doc of documents) {
    await prisma.onboardingDocumentRecord.upsert({
      where: { id: doc.id },
      update: {
        startupId: doc.startupId,
        key: doc.key,
        name: doc.name,
        size: doc.size,
        contentType: doc.contentType,
        uploadedAt: doc.uploadedAt,
        uploadedBy: doc.uploadedBy,
        metadata: doc.metadata,
      },
      create: {
        id: doc.id,
        startupId: doc.startupId,
        key: doc.key,
        name: doc.name,
        size: doc.size,
        contentType: doc.contentType,
        uploadedAt: doc.uploadedAt,
        uploadedBy: doc.uploadedBy,
        metadata: doc.metadata,
      },
    });
  }
};

const main = async () => {
  console.info("Seeding Prisma data...");
  await seedUsers();
  await seedOnboardingConfig();
  await seedOnboardingSubmissions();
  await seedOnboardingChecklists();
  await seedMilestonePlans();
  await seedAlumniRecords();
  await seedGrantCatalogs();
  await seedDocuments();
  console.info("Seed completed.");
};

main()
  .catch((error) => {
    console.error("Seeding failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
