import type {WorkbookDocument} from '../model'
import {xml,nodes,colNumber,rowNumber} from './read'
type Range={r1:number;r2:number;c1:number;c2:number}
const cache=new WeakMap<WorkbookDocument,Map<string,Range[]>>()
/** Formula spill/array members can have no f node of their own. */
export function isFormulaTarget(book:WorkbookDocument|undefined,sheetName:string,address:string):boolean{
 if(!book)return false
 const sheet=book.sheets.find(s=>s.name===sheetName);if(!sheet)return false
 if(sheet.cells[address]?.formula!==undefined)return true
 let sheets=cache.get(book);if(!sheets){sheets=new Map();cache.set(book,sheets)}
 let ranges=sheets.get(sheetName)
 if(!ranges){
  const doc=xml(new TextDecoder().decode(book.parts[sheet.path]))
  ranges=nodes(doc,'f').flatMap(f=>{
   const ref=(f.getAttribute('ref')||'').replace(/\$/g,'').toUpperCase();if(!/^[A-Z]+[1-9]\d*(?::[A-Z]+[1-9]\d*)?$/.test(ref))return []
   const [a,b=a]=ref.split(':');return [{r1:Math.min(rowNumber(a),rowNumber(b)),r2:Math.max(rowNumber(a),rowNumber(b)),c1:Math.min(colNumber(a),colNumber(b)),c2:Math.max(colNumber(a),colNumber(b))}]
  });sheets.set(sheetName,ranges)
 }
 const r=rowNumber(address),c=colNumber(address)
 return ranges.some(v=>r>=v.r1&&r<=v.r2&&c>=v.c1&&c<=v.c2)
}
