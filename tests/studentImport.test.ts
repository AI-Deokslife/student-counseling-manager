import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import { readSheet } from "read-excel-file/node";
import { parseStudentSheet } from "../src/lib/studentImport";

function studentWorkbook(): Buffer {
  const files = {
    "[Content_Types].xml": strToU8(`<?xml version="1.0" encoding="UTF-8"?>
      <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
        <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
        <Default Extension="xml" ContentType="application/xml"/>
        <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
        <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
      </Types>`),
    "_rels/.rels": strToU8(`<?xml version="1.0" encoding="UTF-8"?>
      <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
        <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
      </Relationships>`),
    "xl/workbook.xml": strToU8(`<?xml version="1.0" encoding="UTF-8"?>
      <workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
        <sheets><sheet name="학생" sheetId="1" r:id="rId1"/></sheets>
      </workbook>`),
    "xl/_rels/workbook.xml.rels":
      strToU8(`<?xml version="1.0" encoding="UTF-8"?>
      <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
        <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
      </Relationships>`),
    "xl/worksheets/sheet1.xml": strToU8(`<?xml version="1.0" encoding="UTF-8"?>
      <worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>
        <row r="1"><c r="A1" t="inlineStr"><is><t>이름</t></is></c><c r="B1" t="inlineStr"><is><t>학년</t></is></c><c r="C1" t="inlineStr"><is><t>반</t></is></c><c r="D1" t="inlineStr"><is><t>번호</t></is></c></row>
        <row r="2"><c r="A2" t="inlineStr"><is><t>테스트학생</t></is></c><c r="B2"><v>2</v></c><c r="C2"><v>3</v></c><c r="D2"><v>21</v></c></row>
      </sheetData></worksheet>`),
  };
  return Buffer.from(zipSync(files));
}

describe("student Excel import", () => {
  it("reads an actual xlsx workbook and maps the required columns", async () => {
    const sheet = await readSheet(studentWorkbook());
    expect(parseStudentSheet(sheet)).toEqual([
      { name: "테스트학생", grade: 2, classNo: 3, studentNo: 21, sourceRow: 2 },
    ]);
  });

  it("rejects a workbook without the required columns", () => {
    expect(() => parseStudentSheet([["이름"], ["홍길동"]])).toThrow(
      "첫 행에 이름, 학년, 반, 번호 열이 필요합니다.",
    );
  });
});
