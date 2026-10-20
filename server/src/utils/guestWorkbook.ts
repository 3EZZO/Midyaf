import ExcelJS from "exceljs";
import { DateTime } from "luxon";
import { inflateRawSync } from "node:zlib";
import { z } from "zod";
import { guestCreateSchema, nextGuestCode, type GuestDto } from "../../../shared/overhaul.js";
import { HttpError } from "./http.js";

export const GUEST_COLUMNS = ['Name','Contact','Room Type','Arrival Date/Time','Departure Date/Time','Ticket #','Origin City','Arrival City','Departure City','Guest Code'] as const;
export const WORKBOOK_MAX_BYTES = 1_048_576;
export const WORKBOOK_MAX_ROWS = 2000;
export type ImportedGuest = z.infer<typeof guestCreateSchema> & { guestCode: string };
function invalid(message: string): never { throw new HttpError(400,message); }

/** Validate ZIP metadata and bounded actual inflation BEFORE ExcelJS sees the archive. */
export function inspectWorkbookZip(bytes: Buffer) {
 if (bytes.length > WORKBOOK_MAX_BYTES || bytes.length < 22) invalid('Workbook must be a valid .xlsx file of at most 1 MiB');
 let end = -1;
 for (let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--) if(bytes.readUInt32LE(i)===0x06054b50){end=i;break;}
 if(end<0 || end+22+bytes.readUInt16LE(end+20)!==bytes.length) invalid('Invalid ZIP directory');
 const count=bytes.readUInt16LE(end+10),size=bytes.readUInt32LE(end+12),start=bytes.readUInt32LE(end+16);
 if(bytes.readUInt16LE(end+4)||bytes.readUInt16LE(end+6)||count!==bytes.readUInt16LE(end+8)||!count||count>2000||start+size!==end||start===0xffffffff) invalid('Unsupported or oversized ZIP directory');
 let offset=start,total=0;const names=new Set<string>();
 for(let i=0;i<count;i++){
  if(offset+46>end||bytes.readUInt32LE(offset)!==0x02014b50)invalid('Invalid ZIP entry');
  const flags=bytes.readUInt16LE(offset+8),method=bytes.readUInt16LE(offset+10),compressed=bytes.readUInt32LE(offset+20),expanded=bytes.readUInt32LE(offset+24),length=bytes.readUInt16LE(offset+28),extra=bytes.readUInt16LE(offset+30),comment=bytes.readUInt16LE(offset+32),local=bytes.readUInt32LE(offset+42);
  if(offset+46+length+extra+comment>end)invalid('Truncated ZIP entry');
  const name=bytes.subarray(offset+46,offset+46+length).toString('utf8');
  total+=expanded;
  if(flags&1||![0,8].includes(method)||compressed===0xffffffff||expanded>8*1024*1024||total>20*1024*1024||expanded/Math.max(1,compressed)>200||names.has(name)||name.includes('..')||name.startsWith('/')||name.includes('\\')||name.includes('externalLinks')||bytes.readUInt16LE(offset+34)!==0)invalid('Unsafe or unsupported workbook archive');
  names.add(name);
  if(local+30>start||bytes.readUInt32LE(local)!==0x04034b50)invalid('Invalid ZIP local entry');
  const localLength=bytes.readUInt16LE(local+26),localExtra=bytes.readUInt16LE(local+28),dataStart=local+30+localLength+localExtra;
  if(bytes.readUInt16LE(local+8)!==method||bytes.subarray(local+30,local+30+localLength).toString('utf8')!==name||dataStart+compressed>start)invalid('ZIP entry mismatch');
  try {
   const packed=bytes.subarray(dataStart,dataStart+compressed);
   const actual=method===8?inflateRawSync(packed,{maxOutputLength:Math.max(1,expanded)}):packed;
   if(actual.length!==expanded)invalid('ZIP expanded size mismatch');
   if(/\.xml$|\.rels$/.test(name) && /<!DOCTYPE|<!ENTITY|TargetMode\s*=\s*["']External/i.test(actual.toString('utf8')))invalid('External references and XML declarations are not supported');
  } catch(error) { if(error instanceof HttpError)throw error; invalid('Invalid compressed workbook content'); }
  offset+=46+length+extra+comment;
 }
 if(offset!==end||!names.has('[Content_Types].xml')||!names.has('xl/workbook.xml'))invalid('Not an XLSX workbook');
}

function text(cell: ExcelJS.Cell, column: string) {
 const value=cell.value;
 if(value===null||value===undefined)return '';
 if(typeof value==='string')return value.trim().replace(/^'(?=[=+@-])/, '');
 if(typeof value==='number'&&column==='Ticket #')return String(value);
 invalid(`${column}: use plain text; formulas, links and rich objects are not accepted`);
}
function date(cell: ExcelJS.Cell, zone: string): string | null {
 const value=cell.value;if(value===null||value===undefined||value==='')return null;
 let parsed: DateTime;
 if(value instanceof Date){parsed=DateTime.fromISO(value.toISOString().slice(0,19),{zone});}
 else if(typeof value==='number'){ const wall=new Date(Date.UTC(1899,11,30)+value*86400000);parsed=DateTime.fromISO(wall.toISOString().slice(0,19),{zone}); }
 else if(typeof value==='string'){parsed=DateTime.fromISO(value.trim(),{zone,setZone:true});}
 else invalid('Dates must be Excel dates or ISO date/time text; formulas are not accepted');
 if(!parsed.isValid||parsed.year<2000||parsed.year>2100)invalid('Invalid date/time (use YYYY-MM-DDTHH:mm or an explicit UTC offset)');
 return parsed.toUTC().toISO();
}
export async function parseGuestWorkbook(bytes: Buffer, existingCodes: string[], defaultVip=false, zone='Asia/Riyadh') {
 if(!DateTime.now().setZone(zone).isValid)invalid('Invalid timezone');
 inspectWorkbookZip(bytes);
 const book=new ExcelJS.Workbook();
 try { await book.xlsx.load(new Uint8Array(bytes).buffer); } catch { invalid('Unable to read workbook'); }
 if(book.worksheets.length!==1)invalid('Use exactly one worksheet');
 const sheet=book.worksheets[0];
 if(sheet.columnCount!==GUEST_COLUMNS.length||sheet.rowCount>WORKBOOK_MAX_ROWS+1)invalid('Workbook has extra columns or too many rows');
 for(let i=0;i<GUEST_COLUMNS.length;i++)if(text(sheet.getCell(1,i+1),GUEST_COLUMNS[i])!==GUEST_COLUMNS[i])invalid(`Column ${i+1} must be ${GUEST_COLUMNS[i]}`);
 const codes=new Set(existingCodes),rows:ImportedGuest[]=[],errors:Array<{row:number;message:string}>=[];
 for(let i=2;i<=sheet.rowCount;i++){
  const row=sheet.getRow(i);if(!row.values||row.actualCellCount===0)continue;
  try {
   for(let j=1;j<=GUEST_COLUMNS.length;j++)if(row.getCell(j).type===ExcelJS.ValueType.Formula)invalid('Formulas are not accepted, including cached results');
   const manual=text(row.getCell(10),'Guest Code'),isVip=manual?manual.startsWith('GV'):defaultVip;
   const guestCode=manual||nextGuestCode(codes,isVip);if(!guestCode)invalid('No guest codes available');
   if(codes.has(guestCode))invalid('Duplicate guest code');
   const contact=text(row.getCell(2),'Contact');
   const parsed=guestCreateSchema.safeParse({guestCode,isVip,fullName:text(row.getCell(1),'Name'),contactPhone:contact&&!contact.includes('@')?contact:null,contactEmail:contact.includes('@')?contact:null,roomType:text(row.getCell(3),'Room Type')||null,arrivalAt:date(row.getCell(4),zone),departureAt:date(row.getCell(5),zone),ticketNumber:text(row.getCell(6),'Ticket #')||null,originCity:text(row.getCell(7),'Origin City')||null,arrivalCity:text(row.getCell(8),'Arrival City')||null,departureCity:text(row.getCell(9),'Departure City')||null});
   if(!parsed.success)invalid(parsed.error.issues.map(issue=>`${issue.path.join('.')}: ${issue.message}`).join('; '));
   rows.push({...parsed.data,guestCode});codes.add(guestCode);
  }catch(error){errors.push({row:i,message:error instanceof HttpError?error.message:'Invalid row'});}
 }
 if(!rows.length&&!errors.length)errors.push({row:2,message:'No guest rows found'});
 return {rows,errors};
}
export function safeWorkbookText(value: string | null | undefined) { return value && /^[\s]*[=+@-]/.test(value) ? `'${value}` : value ?? ''; }
export async function guestWorkbook(guests: GuestDto[] = [], template=false) {
 const book=new ExcelJS.Workbook(),sheet=book.addWorksheet('Guests');
 sheet.addRow([...GUEST_COLUMNS]);sheet.getRow(1).font={bold:true};sheet.views=[{state:'frozen',ySplit:1}];
 for(const column of sheet.columns){column.width=24;column.numFmt='@';}
 for(const guest of guests){
  const values=guest.masked?['','','','','','','','','',guest.guestCode]:[guest.fullName,guest.contactPhone??guest.contactEmail,guest.roomType,guest.arrivalAt,guest.departureAt,guest.ticketNumber,guest.originCity,guest.arrivalCity,guest.departureCity,guest.guestCode];
  sheet.addRow(values.map(value=>safeWorkbookText(value)));
 }
 if(template){sheet.getCell('A1').note='Plain text only. Blank Guest Code creates G01… or GV01… using the import tier. Dates use ISO format; timezone is selected on import.';}
 return Buffer.from(await book.xlsx.writeBuffer());
}
