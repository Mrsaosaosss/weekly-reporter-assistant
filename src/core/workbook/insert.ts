import {zipSync,strToU8} from 'fflate'
import type {WorkbookDocument,InsertRequest,ExportPlan} from '../model'
import {xml,nodes,readWorkbook,rowNumber,NS} from './read'
export function planInsertions(book:WorkbookDocument,requests:InsertRequest[]):ExportPlan{
 const blockers:string[]=[]
 for(const request of requests){const s=book.sheets.find(s=>s.name===request.sheet)
  if(!s){blockers.push('找不到插入目标工作表');continue}
  if(/Print_Area|Print_Titles/.test(new TextDecoder().decode(book.parts['xl/workbook.xml']))||/rowBreaks|colBreaks/.test(s.xml))blockers.push(`${s.name}存在打印区域、标题或手工分页，新增事项请另列附表，暂不自动插行`)
  if(/<(?:\w+:)?(?:drawing|tablePart|legacyDrawing|conditionalFormatting|dataValidation)\b/.test(s.xml)||Object.values(s.cells).some(c=>c.formula)||Object.keys(book.parts).some(p=>/calcChain|externalLink|pivotTable/.test(p)))blockers.push(`${s.name}存在公式、图形或复杂引用；请将新增事项另列附表，不能自动插行`)
  if(book.sheets.some(other=>other!==s&&Object.values(other.cells).some(c=>c.formula?.includes(s.name))))blockers.push(`${s.name}被其他表公式引用，不能自动插行`)
  if(!Number.isInteger(request.row)||request.row<1||request.items.length<1)blockers.push('插入位置或内容无效')
 }
 return {patches:[],insertions:requests,warnings:[],blockers}
}
export function applyInsertions(book:WorkbookDocument,plan:ExportPlan):WorkbookDocument{
 if(plan.blockers.length)throw new Error(plan.blockers.join('；'))
 const check=planInsertions(book,plan.insertions);if(check.blockers.length)throw new Error(check.blockers.join('；'))
 const parts={...book.parts}
 for(const req of [...plan.insertions].sort((a,b)=>b.row-a.row)){
  const sheet=book.sheets.find(s=>s.name===req.sheet)!,doc=xml(new TextDecoder().decode(parts[sheet.path])),data=nodes(doc,'sheetData')[0],count=req.items.length
  const shift=(s:string)=>s.replace(/(\$?[A-Z]{1,3}\$?)(\d+)/g,(_,col,r)=>col+(Number(r)>=req.row?Number(r)+count:Number(r)))
  const template=nodes(data,'row').find(r=>Number(r.getAttribute('r'))===req.templateRow)?.cloneNode(true) as Element|undefined
  for(const n of Array.from(doc.getElementsByTagName('*'))){for(const attr of ['r','ref','sqref','topLeftCell'])if(n.hasAttribute(attr))n.setAttribute(attr,attr==='r'&&n.localName==='row'?String(Number(n.getAttribute(attr))>=req.row?Number(n.getAttribute(attr))+count:Number(n.getAttribute(attr))):shift(n.getAttribute(attr)!))}
  for(let i=0;i<count;i++){const row=template?template.cloneNode(true) as Element:doc.createElementNS(NS,'row');row.setAttribute('r',String(req.row+i));for(const c of Array.from(row.children)){c.setAttribute('r',(c.getAttribute('r')||'A1').replace(/\d+$/,String(req.row+i)));for(const ch of Array.from(c.children))c.removeChild(ch);c.removeAttribute('t')}
   const next=nodes(data,'row').find(r=>Number(r.getAttribute('r'))>req.row+i);data.insertBefore(row,next||null)
  }
  parts[sheet.path]=strToU8(new XMLSerializer().serializeToString(doc))
 }
 const bytes=zipSync(parts);return readWorkbook(bytes.buffer as ArrayBuffer,book.fileId)
}
