import type { SheetData } from "read-excel-file/browser";
import type { StudentImportRow } from "./api";

export type ParsedStudentRow = StudentImportRow & { sourceRow: number };

export function parseStudentSheet(sheet: SheetData): ParsedStudentRow[] {
  if (sheet.length < 2) throw new Error("학생 데이터가 없습니다.");

  const headers = sheet[0].map((cell) => String(cell ?? "").trim());
  const column = (aliases: string[]) =>
    headers.findIndex((header) => aliases.includes(header));
  const nameIndex = column(["이름", "학생이름", "성명", "name"]);
  const gradeIndex = column(["학년", "grade"]);
  const classIndex = column(["반", "학급", "class", "classNo"]);
  const numberIndex = column(["번호", "학생번호", "studentNo"]);
  if ([nameIndex, gradeIndex, classIndex, numberIndex].includes(-1)) {
    throw new Error("첫 행에 이름, 학년, 반, 번호 열이 필요합니다.");
  }

  const rows = sheet.slice(1).flatMap((cells, index) => {
    const name = String(cells[nameIndex] ?? "").trim();
    if (!name && cells.every((cell) => cell === null)) return [];
    const grade = Number(cells[gradeIndex]);
    const classNo = Number(cells[classIndex]);
    const studentNo = Number(cells[numberIndex]);
    if (
      !name ||
      !Number.isInteger(grade) ||
      grade < 1 ||
      grade > 12 ||
      !Number.isInteger(classNo) ||
      classNo < 1 ||
      classNo > 99 ||
      !Number.isInteger(studentNo) ||
      studentNo < 1 ||
      studentNo > 999
    ) {
      throw new Error(`${index + 2}행의 이름·학년·반·번호를 확인해주세요.`);
    }
    return [{ name, grade, classNo, studentNo, sourceRow: index + 2 }];
  });
  if (!rows.length) throw new Error("등록할 학생 데이터가 없습니다.");
  return rows;
}
