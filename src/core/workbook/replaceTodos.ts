import {reportUnitKey} from '../report/sourceMap'
import {inspectTodoTemplate,protectedRow,todoDestinations} from './todoProtection'
import {zipSync,strFromU8,strToU8} from 'fflate'
import type {WorkbookDocument,SheetMapping,SourceFragment,ReportTask,FileAsset} from '../model'
import {xml,nodes,NS,colName,rowNumber,colNumber} from './read'
export function selectedTodoSources(task:ReportTask,files:FileAsset[],sources:SourceFragment[],mappings:{fileId:string;values:SheetMapping[]}[]){
 const eligible=files.filter(f=>f.role==='source'&&mappings.some(m=>m.fileId===f.id&&m.values.some(v=>v.category==='todo'))).sort((a,b)=>task.sourceFileIds.indexOf(a.id)-task.sourceFileIds.indexOf(b.id)),chosen=new Map<string,FileAsset>()
 for(const file of eligible){if(file.todoSource===false)continue;const key=reportUnitKey(file.unit)||file.id;const prior=chosen.get(key);if(!prior||file.todoSource===true||prior.todoSource!==true)chosen.set(key,file)}
 const order=[...chosen.values()].sort((a,b)=>task.sourceFileIds.indexOf(a.id)-task.sourceFileIds.indexOf(b.id)).map(f=>f.id)
 return sources.filter(s=>s.fields.content?.trim()&&s.fields.content.trim()!=='/'&&s.refs.some(ref=>order.includes(ref.fileId)&&mappings.some(m=>m.fileId===ref.fileId&&m.values.some(v=>v.sheet===ref.sheet&&v.category==='todo')))).sort((a,b)=>{
  const ref=(s:SourceFragment)=>s.fieldRefs?.content||s.refs.find(r=>order.includes(r.fileId))!
  const sheetOrder=(s:SourceFragment)=>mappings.find(m=>m.fileId===ref(s).fileId)?.values.findIndex(v=>v.sheet===ref(s).sheet)??0
  return order.indexOf(ref(a).fileId)-order.indexOf(ref(b).fileId)||sheetOrder(a)-sheetOrder(b)||(a.rowContext?.row||Math.max(...a.refs.map(r=>rowNumber(r.address))))-(b.rowContext?.row||Math.max(...b.refs.map(r=>rowNumber(r.address))))
 })
}
export function replaceTodoSheet(book:WorkbookDocument,map:SheetMapping,rows:SourceFragment[]):Uint8Array{
 const sheet=book.sheets.find(s=>s.name===map.sheet);if(!sheet)throw new Error('未找到周例会待办目标表')
 const protection=inspectTodoTemplate(book,map),destinations=todoDestinations(map.headerRow,rows.length,protection.reserved)
 if(!destinations)return book.bytes
 const parts={...book.parts},doc=xml(sheet.xml),data=nodes(doc,'sheetData')[0];if(!data)throw new Error('待办表缺少数据区')
 const originalRows=nodes(data,'row'),template=originalRows.find(r=>Number(r.getAttribute('r'))>map.headerRow),maxCol=Math.max(map.sequenceColumn||0,...Object.values(map.columns).filter((n):n is number=>!!n))
 const styles=new Map<number,string>();for(const c of template?Array.from(template.children):[]){const style=c.getAttribute('s');if(style)styles.set(colNumber(c.getAttribute('r')||''),style)}
 for(const row of originalRows)if(Number(row.getAttribute('r'))>map.headerRow&&!protectedRow(Number(row.getAttribute('r')),protection.reserved))row.remove()
 for(const m of nodes(doc,'mergeCell')){const [a,b=a]=m.getAttribute('ref')!.split(':');if(rowNumber(b)>map.headerRow&&!protection.reserved.some(r=>rowNumber(a)<=r.to&&rowNumber(b)>=r.from))m.remove()}
 const merges=nodes(doc,'mergeCells')[0];if(merges)merges.setAttribute('count',String(nodes(merges,'mergeCell').length))
 for(let i=0;i<rows.length;i++){
  const source=rows[i],r=destinations[i],row=doc.createElementNS(NS,'row');row.setAttribute('r',String(r))
  if(source.rowContext?.height){row.setAttribute('ht',source.rowContext.height);row.setAttribute('customHeight','1')}
  if(template)for(const attr of Array.from(template.attributes))if((!source.rowContext?.height||!['ht','customHeight'].includes(attr.name))&&['ht','customHeight','s','customFormat'].includes(attr.name))row.setAttribute(attr.name,attr.value)
  for(let col=1;col<=maxCol;col++){
   const field=Object.entries(map.columns).find(([,n])=>n===col)?.[0] as keyof SourceFragment['fields']|undefined
   const text=col===map.sequenceColumn?String(i+1):field==='unit'?source.unit:field?source.fields[field]||'':''
   const c=doc.createElementNS(NS,'c');c.setAttribute('r',colName(col)+r);if(styles.has(col))c.setAttribute('s',styles.get(col)!);c.setAttribute('t','inlineStr')
   const is=doc.createElementNS(NS,'is'),t=doc.createElementNS(NS,'t');t.setAttributeNS('http://www.w3.org/XML/1998/namespace','xml:space','preserve');t.textContent=text;is.appendChild(t);c.appendChild(is);row.appendChild(c)
  }
  data.appendChild(row)
 }
 for(const row of nodes(data,'row').sort((a,b)=>Number(a.getAttribute('r'))-Number(b.getAttribute('r'))))data.appendChild(row)
 const displayCol=Math.max(maxCol,...nodes(data,'c').map(c=>colNumber(c.getAttribute('r')||'A1')),...nodes(doc,'mergeCell').map(m=>colNumber((m.getAttribute('ref')||'').split(':').at(-1)||'A1')))
 const last=Math.max(map.headerRow,...nodes(data,'row').map(r=>Number(r.getAttribute('r'))),...protection.reserved.map(r=>r.to)),dimension=nodes(doc,'dimension')[0];if(dimension)dimension.setAttribute('ref',`A1:${colName(displayCol)}${last}`)
 for(const tag of protection.notices.length?[]:['autoFilter','conditionalFormatting','dataValidations','rowBreaks'])for(const node of nodes(doc,tag))node.remove()
 parts[sheet.path]=strToU8(new XMLSerializer().serializeToString(doc))
 if(parts['xl/workbook.xml']){
  const wb=xml(strFromU8(parts['xl/workbook.xml'])),sheetIndex=book.sheets.indexOf(sheet)
  for(const n of nodes(wb,'definedName'))if(n.getAttribute('name')==='_xlnm.Print_Area'&&Number(n.getAttribute('localSheetId'))===sheetIndex)n.textContent=`'${sheet.name.replace(/'/g,"''")}'!$A$1:$${colName(displayCol)}$${last}`
  parts['xl/workbook.xml']=strToU8(new XMLSerializer().serializeToString(wb))
 }
 return zipSync(parts)
}
