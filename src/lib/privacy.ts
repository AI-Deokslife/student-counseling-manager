import type { StudentSummary } from "./api";

export function maskStudentName(name: string) {
  const characters = Array.from(name.trim());
  if (characters.length <= 1)
    return characters[0] ? `${characters[0]}O` : "이름 미입력";
  if (characters.length === 2) return `${characters[0]}O`;
  return `${characters[0]}${"O".repeat(characters.length - 2)}${characters.at(-1)}`;
}

export function studentLabel(
  student: Pick<StudentSummary, "name" | "grade" | "class_no" | "student_no">,
) {
  const enrollment = student.grade
    ? `${student.grade}학년 ${student.class_no ?? "-"}반 ${student.student_no ?? "-"}번`
    : "학적 미입력";
  return `${enrollment} · ${maskStudentName(student.name)}`;
}
