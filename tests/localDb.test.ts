import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import {
  clearLocalData,
  importLocalBackup,
  localApi,
  localBackup,
} from "../src/lib/localDb";

describe("local IndexedDB data mode", () => {
  beforeEach(async () => {
    await clearLocalData();
  });

  it("stores students and counseling records without the cloud API", async () => {
    await localApi.createStudent({
      name: "박민호",
      grade: 2,
      classNo: 3,
      studentNo: 6,
    });
    const [student] = await localApi.students();
    const [type] = await localApi.counselingTypes();

    await localApi.createCounseling({
      studentId: student.id,
      counselingTypeId: type.id,
      date: "2026-09-13",
      summary: "로컬 상담 기록",
      content: "브라우저 내부 저장소에만 저장됩니다.",
      status: "normal",
    });

    const records = await localApi.counseling();
    expect(student).toMatchObject({ grade: 2, class_no: 3, student_no: 6 });
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      student_name: "박민호",
      counseling_type_name: "학교생활",
    });
  });

  it("exports and restores the same portable backup structure", async () => {
    await localApi.createStudent({
      name: "양희종",
      grade: 2,
      classNo: 3,
      studentNo: 7,
    });
    const backup = await localBackup();

    await clearLocalData();
    await importLocalBackup(backup);

    const students = await localApi.students();
    expect(backup).toMatchObject({
      format: "student-counseling-backup",
      schemaVersion: 1,
    });
    expect(students).toHaveLength(1);
    expect(students[0].name).toBe("양희종");
  });
});
