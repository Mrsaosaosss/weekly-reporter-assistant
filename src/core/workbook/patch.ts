import {isFormulaTarget} from './formulaProtection'
import {zipSync,strFromU8,strToU8} from 'fflate'
import type {WorkbookDocument,CellPatch} from '../model'
import {xml,nodes,NS,resolvedCell,colNumber,rowNumber} from './read'
import {clearHighlights,highlighting} from './highlights'
export function patchWorkbook(book:WorkbookDocument,patches:CellPatch[]):Uint8Array{
 const parts={...book.parts},cleared=clearHighlights(parts),changes=new Map<string,CellPatch[]>()
 if(!patches.length)return cleared?zipSync(parts):book.bytes
 const marker=patches.some(p=>p.highlight)?highlighting(parts):undefined
 for(const p of patches){
  if(p.ref.fileId!==book.fileId)throw new Error('目标文件不匹配')
  const sheet=book.sheets.find(s=>s.name===p.ref.sheet);if(!sheet)throw new Error('工作表不存在')
  const cell=resolvedCell(sheet,rowNumber(p.ref.address),colNumber(p.ref.address))
  if(cell&&cell.address!==p.ref.address)throw new Error('请编辑合并单元格左上角')
  if(isFormulaTarget(book,p.ref.sheet,p.ref.address)&&p.text!==p.before)throw new Error('公式格不能被普通文字覆盖')
  if((cell?.text||'')!==p.before)throw new Error('底稿内容已经变化，请重新审核')
  if(cell?.rich&&p.text!==p.before&&p.textStyle!=='confirmed-plain')throw new Error('富文本需确认使用原格基础字体')
  changes.set(sheet.path,[...(changes.get(sheet.path)||[]),p])
 }
 for(const [path,list] of changes){
  const doc=xml(strFromU8(parts[path])),data=nodes(doc,'sheetData')[0];if(!data)throw new Error('工作表缺少数据区')
  const seen=new Map<string,string>()
  for(const p of list){
   if(seen.has(p.ref.address)){if(seen.get(p.ref.address)!==p.text)throw new Error('多个事项修改同一格且内容冲突');continue}seen.set(p.ref.address,p.text)
   let c=nodes(data,'c').find(c=>c.getAttribute('r')===p.ref.address)
   if(!c){let row=nodes(data,'row').find(r=>r.getAttribute('r')===String(rowNumber(p.ref.address)));if(!row){row=doc.createElementNS(NS,'row');row.setAttribute('r',String(rowNumber(p.ref.address)));const next=nodes(data,'row').find(r=>Number(r.getAttribute('r'))>rowNumber(p.ref.address));data.insertBefore(row,next||null)}c=doc.createElementNS(NS,'c');c.setAttribute('r',p.ref.address);const next=Array.from(row.children).find(n=>colNumber(n.getAttribute('r')||'')>colNumber(p.ref.address));row.insertBefore(c,next||null)}
   if(p.highlight)marker?.styleFor(c,path,p.highlight)
   if(p.text===p.before)continue
   for(const child of Array.from(c.children))if(['v','is','f'].includes(child.localName))c.removeChild(child)
   if(p.valueType==='number'){if(!/^-?\d+(\.\d+)?$/.test(p.text)||!Number.isFinite(+p.text))throw new Error('日期或数值无效');c.removeAttribute('t');const v=doc.createElementNS(NS,'v');v.textContent=p.text;c.appendChild(v)}else{c.setAttribute('t','inlineStr');const is=doc.createElementNS(NS,'is'),t=doc.createElementNS(NS,'t');t.setAttributeNS('http://www.w3.org/XML/1998/namespace','xml:space','preserve');t.textContent=p.text;is.appendChild(t);c.appendChild(is)}
  }
  parts[path]=strToU8(new XMLSerializer().serializeToString(doc))
 }
 marker?.save()
 return zipSync(parts)
}
