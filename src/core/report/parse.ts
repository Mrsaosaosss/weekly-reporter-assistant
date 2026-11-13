import {categories,type FieldKey,type SheetCategory,type SheetMapping,type WorkbookDocument,type ParsedReport,type ValidationIssue} from '../model'
import {resolvedCell,colName,colNumber,rowNumber,xml,nodes} from '../workbook/read'
const clean=(s:string)=>s.replace(/\s/g,'')
const aliases:Record<string,FieldKey>={'企业名称':'unit','主机厂':'unit','部件厂':'supplier','整机企业':'unit','项目名称':'project','问题名称':'project','专项工作':'project','工作事项':'project','待办事项':'content','问题描述':'description','问题概况':'description','重点工作':'work','工作内容':'content','计划完成时间':'deadline','完成时间':'deadline','计划完成日期':'deadline','责任人':'owner','完成进度':'history','完成情况':'status','本周具体工作进展':'current','下周工作计划':'next','偏差说明及纠偏措施':'deviation','异常说明':'deviation','周例会时间':'meetingDate','备注':'remarks','阶段性结论/成果':'result'}
export function suggestMappings(book:WorkbookDocument):SheetMapping[]{
 return book.sheets.flatMap(sheet=>{
  let category=(Object.entries(categories).find(([,n])=>clean(sheet.name).includes(n))?.[0]) as SheetCategory|undefined
  if(!category&&/批量/.test(sheet.name))category='batch'
  if(!category&&/其他工作/.test(sheet.name))category='special'
  if(!category)return []
  const rows=new Map<number,typeof sheet.cells[string][]>()
  for(const c of Object.values(sheet.cells)){if(c.row<25)rows.set(c.row,[...(rows.get(c.row)||[]),c])}
  const best=[...rows.entries()].map(([row,cells])=>({row,cells,score:cells.filter(c=>aliases[clean(c.text)]).length})).sort((a,b)=>b.score-a.score)[0]
  if(!best||best.score<3)return []
  const columns:SheetMapping['columns']={}
  for(const c of best.cells){const field=aliases[clean(c.text)];if(field&&!columns[field])columns[field]=c.column}
  const metadataTargets=Object.values(sheet.cells).filter(c=>c.row<best.row&&/\d{4}.*年|报告周期/.test(c.text)&&!clean(c.text).startsWith('报告周期')).map(c=>c.address)
  return [{sheet:sheet.name,category,headerRow:best.row,columns,metadataTargets,sequenceColumn:best.cells.find(c=>clean(c.text)==='序号')?.column}]
 })
}
export function parseReport(book:WorkbookDocument,mappings:SheetMapping[],options:{includePlanOnly?:boolean}={}):ParsedReport{
 let reportingUnit=''
 for(const sheet of book.sheets)for(const cell of Object.values(sheet.cells)){if(cell.row>4||!/^报告部门[：:]?$/.test(clean(cell.text)))continue;const next=Object.values(sheet.cells).filter(c=>c.row===cell.row&&c.column>cell.column&&c.text.trim()).sort((a,b)=>a.column-b.column)[0];if(next&&!reportingUnit)reportingUnit=next.text.trim()}
 const items:ParsedReport['items']=[],fragments:ParsedReport['fragments']=[],warnings:ValidationIssue[]=[]
 for(const sheet of book.sheets){
  const map=mappings.find(m=>m.sheet===sheet.name)
  const rowElements=nodes(xml(sheet.xml),'row')
  if(!map){warnings.push({code:'unmapped-sheet',message:`“${sheet.name}”未映射，需确认是否作为无关材料排除`,severity:'warning'});continue}
  const firstItem=items.length
  for(const row of [...new Set(Object.values(sheet.cells).map(c=>c.row))].filter(r=>r>map.headerRow).sort((a,b)=>a-b)){
   const fields:ParsedReport['items'][number]['fields']={},targets:ParsedReport['items'][number]['targets']={}
   let hasOwned=false
   for(const [field,col] of Object.entries(map.columns) as [FieldKey,number][]){
    const c=resolvedCell(sheet,row,col)
    fields[field]=c?.text||'';targets[field]={fileId:book.fileId,sheet:sheet.name,address:c?.address||colName(col)+row}
    if(c){fields[field]=c.text;if(['deadline','meetingDate'].includes(field)&&c.type==='n'&&/^\d+(\.\d+)?$/.test(c.text)&&+c.text>30000&&+c.text<90000){const date1904=/date1904=["'](?:1|true)["']/.test(new TextDecoder().decode(book.parts['xl/workbook.xml']));fields[field]=new Date((date1904?Date.UTC(1904,0,1):Date.UTC(1899,11,30))+Math.floor(+c.text)*86400000).toISOString().slice(0,10)}targets[field]={fileId:book.fileId,sheet:sheet.name,address:c.address};if(c.row===row&&c.text.trim())hasOwned=true}
   }
   if(/^备注[：:]/.test(fields.unit||'')||!hasOwned||(!fields.content&&!fields.current&&!fields.history&&!fields.status&&!fields.work&&!(options.includePlanOnly&&fields.next)))continue
   const id=`${book.fileId}:${sheet.name}:${row}`
   const taskPath=[fields.work,fields.content].filter((s):s is string=>!!s&&s!=='/'&&s!=='—')
   const project=fields.project||((map.category==='todo'||!fields.project)?fields.content:'')||''
   const group=sheet.merges.map(ref=>ref.split(':')).find(([a,b])=>b&&map.columns.content&&colNumber(a)===map.columns.content&&colNumber(b)===map.columns.content&&rowNumber(a)<=row&&rowNumber(b)>=row)
   const start=group?rowNumber(group[0]):row,size=group?rowNumber(group[1])-start+1:1
   const sharedFields=(Object.entries(map.columns) as [FieldKey,number][]).filter(([,col])=>sheet.merges.some(ref=>{const [a,b]=ref.split(':');return b&&col>=colNumber(a)&&col<=colNumber(b)&&rowNumber(a)<=row&&rowNumber(b)>=row&&rowNumber(b)>rowNumber(a)})).map(([field])=>field)
   const rowContext={row,start,size,index:row-start,sharedFields,height:rowElements.find(r=>r.getAttribute('r')===String(row))?.getAttribute('ht')||undefined}
   items.push({id,rowContext,reportId:'',category:map.category,unit:fields.unit||'',project,taskPath,fields,targets})
   fragments.push({id:'src:'+id,rowContext,category:map.category,fieldRefs:targets,refs:Object.values(targets),unit:fields.unit||'',project,taskPath,fields,rawText:Object.entries(fields).map(([k,v])=>`${k}: ${v}`).join('\n')})
  }
  if(map.category==='special'){
   const rows=items.slice(firstItem)
   for(const item of rows){
    const context=item.rowContext!
    if(context.size>1&&context.row===context.start&&rows.filter(peer=>peer.rowContext?.start===context.start).length===1){
     context.size=1
     context.index=0
    }
   }
  }
  warnings.push({code:'period-check',message:`“${sheet.name}”报告周期需与本期设置核对；不得用旧表头判定本周`,severity:'warning'})
 }
 return {items,fragments,warnings,mappings,reportingUnit}
}
