import { describe, expect, it } from "vitest";
import { koreanHolidays } from "../src/lib/koreanHolidays";

describe("koreanHolidays", () => {
  it("includes fixed, lunar, and substitute holidays for 2026", () => {
    const holidays = koreanHolidays(2026);
    expect(holidays.get("2026-03-01")).toBe("삼일절");
    expect(holidays.get("2026-03-02")).toBe("대체공휴일");
    expect(holidays.get("2026-02-17")).toBe("설날");
    expect(holidays.get("2026-05-24")).toBe("부처님오신날");
    expect(holidays.get("2026-05-25")).toBe("대체공휴일");
    expect(holidays.get("2026-09-25")).toBe("추석");
  });
});
