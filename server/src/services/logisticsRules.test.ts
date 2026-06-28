import { describe, expect, it } from "vitest";
import {
  calculateCommission,
  calculateShuttleGroups,
  calculateShuttleVehicles,
  calculateVipCars
} from "./logisticsRules.js";

describe("Midyaf logistics rules", () => {
  it("allocates one dedicated car per VIP guest", () => {
    expect(calculateVipCars(18)).toBe(18);
    expect(calculateVipCars(0)).toBe(0);
  });

  it("groups normal guests into shuttle groups of up to four", () => {
    expect(calculateShuttleGroups(78)).toBe(20);
    expect(calculateShuttleGroups(4)).toBe(1);
    expect(calculateShuttleGroups(5)).toBe(2);
  });

  it("adds shuttle vehicle capacity from calculated groups", () => {
    expect(calculateShuttleVehicles(78)).toBe(11);
    expect(calculateShuttleVehicles(1)).toBe(1);
  });

  it("calculates Midyaf commission from supplier quotations", () => {
    expect(calculateCommission(76250, 12)).toBe(9150);
    expect(calculateCommission(22620, 15)).toBe(3393);
    expect(calculateCommission(55296, 10)).toBe(5529.6);
  });
});
