import {zipSync,strToU8} from 'fflate'
import type {WorkbookDocument,SheetMapping,SourceFragment,CellPatch,FieldKey} from '../model'
import {xml,nodes,NS,readWorkbook} from './read'
import {patchWorkbook} from './patch'
import {normalizePlaceholder} from '../report/issueReview'
export interface ReviewedAddition {source:SourceFragment;mapping:SheetMapping}
const column=(n:number):string=>n>26?column(Math.floor((n-1)/26))+String.fromCharCode(65+(n-1)%26):String.fromCharCode(64+n)
export function appendReviewed(book:WorkbookDocument,additions:ReviewedAddition[],existing:CellPatch[]=[]){
 if(!additions.length)return book.bytes
 const parts={...book.parts},patches:CellPatch[]=[...existing],workbook=xml(new TextDecoder().decode(parts['xl/workbook.xml']))
 for(const sheet of book.sheets){
  const entries=additions.filter(a=>a.mapping.sheet===sheet.name);if(!entries.length)continue
  const doc=xml(sheet.xml),data=nodes(doc,'sheetData')[0];if(!data)throw new Error('新增目标缺少数据区')
  const rows=nodes(data,'row');let end=Math.max(0,...rows.map(r=>Number(r.getAttribute('r'))),...sheet.merges.flatMap(m=>m.match(/\d+/g)?.map(Number)||[]))
  const last=rows.filter(r=>Number(r.getAttribute('r'))>entries[0].mapping.headerRow).at(-1)
  for(const {source,mapping} of entries){
   end++;if(end>1048576)throw new Error('新增内容超出Excel最大行数')
   const row=doc.createElementNS(NS,'row');row.setAttribute('r',String(end));row.setAttribute('ht','60');row.setAttribute('customHeight','1');data.appendChild(row)
   const values={...source.fields,unit:source.unit,project:source.project,work:source.fields.work||source.taskPath[0]||'',content:source.fields.content||source.taskPath.at(-1)||''}
   for(const [field,col] of Object.entries(mapping.columns) as [FieldKey,number][]){
    const address=column(col)+end,c=doc.createElementNS(NS,'c');c.setAttribute('r',address)
    const style=last&&nodes(last,'c').find(c=>c.getAttribute('r')?.replace(/\d+/g,'')===column(col))?.getAttribute('s');if(style)c.setAttribute('s',style);row.appendChild(c)
    patches.push({ref:{fileId:book.fileId,sheet:sheet.name,address},before:'',text:normalizePlaceholder(values[field]||''),textStyle:'confirmed-plain',highlight:'changed'})
   }
   if(mapping.sequenceColumn){const col=mapping.sequenceColumn;const max=Math.max(0,...Object.values(sheet.cells).filter(c=>c.column===col&&c.row>mapping.headerRow).map(c=>Number(c.text)||0));patches.push({ref:{fileId:book.fileId,sheet:sheet.name,address:column(col)+end},before:'',text:String(max+entries.indexOf(entries.find(e=>e.source.id===source.id)!)+1),textStyle:'confirmed-plain',valueType:'number'})}
  }
  const width=Math.max(...Object.values(sheet.cells).map(c=>c.column),...entries.flatMap(e=>Object.values(e.mapping.columns)))
  nodes(doc,'dimension')[0]?.setAttribute('ref',`A1:${column(width)}${end}`)
  // Extend a simple print area without changing existing rows, formulas, or drawings.
  const sheetIndex=book.sheets.indexOf(sheet)
  for(const name of nodes(workbook,'definedName').filter(n=>n.getAttribute('name')==='_xlnm.Print_Area'&&n.getAttribute('localSheetId')===String(sheetIndex))){
   const text=name.textContent||''
   if(!/^[^!]+!\$?[A-Z]+\$?\d+:\$?[A-Z]+\$?\d+$/.test(text))throw new Error(`${sheet.name}打印区域包含多个范围，请先在Excel中设为单一范围再导出新增事项`)
   name.textContent=text.replace(/\d+$/,String(Math.max(end,Number(text.match(/\d+$/)?.[0]))))
  }
  parts[sheet.path]=strToU8(new XMLSerializer().serializeToString(doc))
 }
 parts['xl/workbook.xml']=strToU8(new XMLSerializer().serializeToString(workbook))
 return patchWorkbook(readWorkbook(zipSync(parts).buffer as ArrayBuffer,book.fileId),patches)
}
