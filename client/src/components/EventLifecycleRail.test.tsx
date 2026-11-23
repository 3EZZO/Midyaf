import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { EventLifecycleRail, deriveEventLifecycle } from "./EventLifecycleRail";

describe("EventLifecycleRail", () => {
  it("derives each of the 5 lifecycle stages accurately from event flags", () => {
    const noPlan = deriveEventLifecycle({ planApproved: false, hasPlan: false });
    expect(noPlan.currentIndex).toBe(1);
    expect(noPlan.stages.map((s) => s.state)).toEqual([
      "done",
      "active",
      "upcoming",
      "upcoming",
      "upcoming"
    ]);
    expect(noPlan.actionTab).toBe("plan");

    const awaitingApproval = deriveEventLifecycle({ planApproved: false });
    expect(awaitingApproval.currentIndex).toBe(2);
    expect(awaitingApproval.stages[2].id).toBe("approval");
    expect(awaitingApproval.stages[2].state).toBe("active");

    const rfqVault = deriveEventLifecycle({
      planApproved: true,
      contractSigned: false,
      operationalStatus: "PLANNING"
    });
    expect(rfqVault.currentIndex).toBe(3);
    expect(rfqVault.stages[3].id).toBe("rfq");
    expect(rfqVault.actionTab).toBe("vendors");

    const liveOps = deriveEventLifecycle({
      planApproved: true,
      contractSigned: true,
      operationalStatus: "ACTIVE"
    });
    expect(liveOps.currentIndex).toBe(4);
    expect(liveOps.stages[4].state).toBe("active");
    expect(liveOps.actionTab).toBe("radar");

    const completed = deriveEventLifecycle({
      planApproved: true,
      contractSigned: true,
      operationalStatus: "COMPLETED"
    });
    expect(completed.stages.every((s) => s.state === "done")).toBe(true);
  });

  it("renders full 5-stage rail with 390px-safe grid-cols-1 and Arabic labels", () => {
    const enHtml = renderToStaticMarkup(
      <EventLifecycleRail
        planApproved={false}
        isArabic={false}
        onNavigateTab={() => undefined}
      />
    );
    expect(enHtml).toContain('data-lifecycle-rail="full"');
    expect(enHtml).toContain('data-lifecycle-stage="approval"');
    expect(enHtml).toContain("grid-cols-1");
    expect(enHtml).toContain("Client Approval");
    expect(enHtml).toContain("Review &amp; approve plan");

    const arHtml = renderToStaticMarkup(
      <EventLifecycleRail
        planApproved={true}
        contractSigned={false}
        operationalStatus="PLANNING"
        isArabic={true}
        compact
      />
    );
    expect(arHtml).toContain('data-lifecycle-rail="compact"');
    expect(arHtml).toContain('data-lifecycle-stage="rfq"');
    expect(arHtml).toContain("الموردون والخزنة");
  });
});
