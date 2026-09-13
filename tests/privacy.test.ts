import { describe, expect, it } from "vitest";
import { maskStudentName, studentLabel } from "../src/lib/privacy";

describe("student privacy display", () => {
  it.each([
    ["박민호", "박O호"],
    ["양희종", "양O종"],
    ["김철", "김O"],
    ["남궁민수", "남OO수"],
  ])("masks %s as %s", (name, masked) => {
    expect(maskStudentName(name)).toBe(masked);
  });

  it("places enrollment information before the masked name", () => {
    expect(
      studentLabel({ name: "박민호", grade: 2, class_no: 3, student_no: 6 }),
    ).toBe("2학년 3반 6번 · 박O호");
  });
});
