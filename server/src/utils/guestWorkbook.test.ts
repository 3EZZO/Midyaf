import { expect,it } from 'vitest';
import ExcelJS from 'exceljs';
import { GUEST_COLUMNS,guestWorkbook,parseGuestWorkbook,inspectWorkbookZip } from './guestWorkbook.js';
async function workbook(rows: unknown[][]) { const book=new ExcelJS.Workbook();const sheet=book.addWorksheet('Guests');sheet.addRow([...GUEST_COLUMNS]);for(const row of rows)sheet.addRow(row);return Buffer.from(await book.xlsx.writeBuffer()); }
const row=['Synthetic guest','+966500000001','Suite','2026-11-01T10:00','2026-11-03T10:00','00123','Jeddah','Riyadh','Riyadh','GV01'];
it('parses exact columns, leading-zero codes/tickets and Riyadh wall-clock dates',async()=>{
 const result=await parseGuestWorkbook(await workbook([row]),[]);expect(result.errors).toEqual([]);expect(result.rows[0]).toMatchObject({guestCode:'GV01',isVip:true,ticketNumber:'00123',arrivalAt:new Date('2026-11-01T07:00:00Z')});
});
it('generates codes after existing event codes and reports duplicate rows without partial writes',async()=>{
 const result=await parseGuestWorkbook(await workbook([[...row.slice(0,9),''],row,row]),['G01']);expect(result.rows[0].guestCode).toBe('G02');expect(result.errors).toEqual([expect.objectContaining({row:4,message:'Duplicate guest code'})]);
});
it('rejects formula cells even with cached results, date reversal, numeric contact and bad headers',async()=>{
 for(const bad of [[{formula:'HYPERLINK("https://example.test")',result:'Cached secret'},...row.slice(1)],[row[0],12345,...row.slice(2)],[...row.slice(0,4),'2026-10-01T10:00',...row.slice(5)]]){
  expect((await parseGuestWorkbook(await workbook([bad]),[])).errors.length).toBeGreaterThan(0);
 }
 const book=new ExcelJS.Workbook();book.addWorksheet('Guests').addRow(['Name','Name']);await expect(parseGuestWorkbook(Buffer.from(await book.xlsx.writeBuffer()),[])).rejects.toThrow(/columns|Column/);
});
it('produces real XLSX templates and code-only privacy exports',async()=>{
 const template=await guestWorkbook([],true);expect(template.subarray(0,2).toString()).toBe('PK');expect(()=>inspectWorkbookZip(template)).not.toThrow();
 const bytes=await guestWorkbook([{id:'private',guestCode:'GV09',isVip:true,masked:true}]);const book=new ExcelJS.Workbook();await book.xlsx.load(new Uint8Array(bytes).buffer);expect(book.worksheets[0].getRow(2).getCell(1).value).toBe('');expect(book.worksheets[0].getRow(2).getCell(10).value).toBe('GV09');
});
it('rejects oversized, forged expanded-size, ZIP64 and encrypted archives before parser entry',async()=>{
 expect(()=>inspectWorkbookZip(Buffer.alloc(1_048_577))).toThrow();
 const valid=await workbook([row]);const central=valid.indexOf(Buffer.from([0x50,0x4b,0x01,0x02]));
 for(const mutate of [(b:Buffer)=>b.writeUInt32LE(0xffffffff,central+24),(b:Buffer)=>b.writeUInt16LE(1,central+8),(b:Buffer)=>b.writeUInt32LE(1,central+24)]){const bad=Buffer.from(valid);mutate(bad);expect(()=>inspectWorkbookZip(bad)).toThrow();}
});
