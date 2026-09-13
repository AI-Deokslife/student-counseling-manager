import type { CounselingSummary, StudentSummary } from "./api";
import { maskStudentName } from "./privacy";

export async function downloadStudentCounselingExcel(
  student: StudentSummary,
  records: CounselingSummary[],
) {
  const XLSX = await import("xlsx-js-style");
  const rows = records.map((record, index) => ({
    No: index + 1,
    상담일: record.counseling_date,
    상담유형: record.counseling_type_name ?? "미지정",
    상태: record.status,
    한줄기록: record.summary,
    상세내용: record.content,
    후속상담일: record.follow_up_date ?? "",
  }));
  const sheet = XLSX.utils.aoa_to_sheet([]);
  XLSX.utils.sheet_add_json(sheet, rows, {
    header: [
      "No",
      "상담일",
      "상담유형",
      "상태",
      "한줄기록",
      "상세내용",
      "후속상담일",
    ],
    origin: "A4",
  });
  XLSX.utils.sheet_add_aoa(
    sheet,
    [
      ["학생 상담 기록"],
      [
        `${student.grade ?? "-"}학년 ${student.class_no ?? "-"}반 ${student.student_no ?? "-"}번 · ${maskStudentName(student.name)}`,
      ],
      [],
    ],
    { origin: "A1" },
  );
  const title = sheet.A1;
  title.s = {
    font: { bold: true, sz: 16, color: { rgb: "FFFFFF" } },
    fill: { fgColor: { rgb: "00AFAE" } },
    alignment: { horizontal: "center", vertical: "center" },
  };
  sheet["!merges"] = [
    XLSX.utils.decode_range("A1:G1"),
    XLSX.utils.decode_range("A2:G2"),
  ];
  sheet["!rows"] = [{ hpt: 28 }, { hpt: 22 }];
  const headerRow = 4;
  for (let column = 0; column < 7; column += 1) {
    const cell = sheet[XLSX.utils.encode_cell({ r: headerRow - 1, c: column })];
    cell.s = {
      font: { bold: true, color: { rgb: "FFFFFF" } },
      fill: { fgColor: { rgb: "178A87" } },
      alignment: { horizontal: "center", vertical: "center" },
    };
  }
  const range = XLSX.utils.decode_range(sheet["!ref"] ?? "A1:G4");
  for (let row = headerRow; row <= range.e.r; row += 1) {
    for (let column = 0; column <= range.e.c; column += 1) {
      const cell = sheet[XLSX.utils.encode_cell({ r: row, c: column })];
      if (!cell) continue;
      cell.s = {
        alignment: { vertical: "top", wrapText: true },
        border: {
          top: { style: "thin", color: { rgb: "D1D5DB" } },
          bottom: { style: "thin", color: { rgb: "D1D5DB" } },
          left: { style: "thin", color: { rgb: "D1D5DB" } },
          right: { style: "thin", color: { rgb: "D1D5DB" } },
        },
      };
    }
  }
  sheet["!cols"] = [
    { wch: 6 },
    { wch: 13 },
    { wch: 14 },
    { wch: 12 },
    { wch: 36 },
    { wch: 64 },
    { wch: 14 },
  ];
  sheet["!autofilter"] = { ref: `A4:G${Math.max(4, rows.length + 4)}` };
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "상담기록");
  XLSX.writeFile(
    workbook,
    `${student.grade ?? "-"}학년_${student.class_no ?? "-"}반_${student.student_no ?? "-"}번_${maskStudentName(student.name)}_상담기록.xlsx`,
  );
}
