import {categories,type ReportItem,type SheetCategory,type WorkbookDocument} from '../model'
import {groupIssues} from '../report/issueReview'
import {normalize} from '../report/match'
import {parseReport,suggestMappings} from '../report/parse'
import {reportUnitKey,sourceRoute} from '../report/sourceMap'

export interface SummaryProject {
 id:string
 name:string
 info:string
 section:string
}
export interface SummaryOutput extends SummaryProject {
 current:string
 next:string
}
export type SummaryRole='主机厂'|'部件厂'|''
export interface SummaryGroup {
 key:string
 unit:string
 project:string
 category:SheetCategory
 role:SummaryRole
 rows:ReportItem[]
}
export interface SummaryLink {key:string;role:SummaryRole}
type SummaryResolution={status:'matched'|'unresolved';groups:SummaryGroup[];reason:string}

const keyText=(value:string)=>normalize(value.normalize('NFKC')).replace(/[：:]/g,'')
export const summaryKey=(project:SummaryProject)=>JSON.stringify([keyText(project.section),keyText(project.name),keyText(project.info)])
export const summaryCategory=(section:string):SheetCategory|undefined=>{
 if(section.includes('源头质量'))return 'source'
 if(section.includes('批量质量'))return 'batch'
 if(section.includes('自有风场'))return 'farm'
 if(/四防|专项|重点工作/.test(section))return 'special'
}
const primaryUnit=(item:ReportItem)=>{
 if(item.category!=='batch')return item.unit
 const unit=sourceRoute(item)?.unit
 return unit===reportUnitKey(item.unit)?item.unit:item.fields.supplier||item.unit
}
const defaultRole=(item:ReportItem,unit:string):SummaryRole=>{
 if(item.category==='batch'&&item.fields.supplier)return reportUnitKey(unit)===reportUnitKey(item.fields.supplier)?'部件厂':'主机厂'
 if(/株洲所|山东风电|启航新能源/.test(reportUnitKey(unit)))return '主机厂'
 if(/时代新材|株洲电机|永济电机|戚墅堰所|福伊特/.test(reportUnitKey(unit)))return '部件厂'
 return ''
}
export function readSummaryGroups(book:WorkbookDocument):SummaryGroup[]{
 const maps=suggestMappings(book).filter(map=>map.category!=='todo'&&(map.columns.current||map.columns.next))
 const items=parseReport(book,maps,{includePlanOnly:true}).items.filter(item=>item.project.trim())
 if(!items.length)throw new Error('本期 Excel 未识别到包含进展或计划的工作表，请核对表头')
 const groups=groupIssues(items).map(({items:rows,project,category})=>{
  const unit=primaryUnit(rows[0])
  const key=JSON.stringify([category,reportUnitKey(unit),keyText(project),category==='batch'?reportUnitKey(rows[0].unit):''])
  return {key,unit,project,category,role:defaultRole(rows[0],unit),rows}
 })
 // Only persist a title-only identity when it uniquely identifies a group.
 const counts=(values:string[])=>{
  const result=new Map<string,number>()
  for(const value of values)result.set(value,(result.get(value)||0)+1)
  return result
 }
 const common=counts(groups.map(group=>group.key))
 for(const group of groups)if(common.get(group.key)!>1){
  group.key=JSON.stringify([group.key,keyText(group.rows[0].fields.description||'')])
 }
 const repeated=counts(groups.map(group=>group.key))
 return groups.map(group=>repeated.get(group.key)!>1
  ?{...group,key:JSON.stringify([group.key,book.digest,Object.values(group.rows[0].targets)[0]?.sheet,group.rows[0].rowContext?.row])}
  :group)
}

// Exact aliases verified against the supplied summary and workbook. Unit and section still constrain matching.
const projectAliases=new Map([
 ['株洲所华润山西五寨项目11#机组叶片断裂','株洲所五寨项目'],
 ['株洲所华润红安轮毂掉落项目','株洲所红安项目'],
 ['株洲所龙溪风场叶片断裂项目','株洲所湖南龙溪项目'],
 ['株洲所桃花山项目机组起火','株洲所桃花山项目'],
 ['山东风电汶上叶片断裂项目','山东风电中广核汶上项目'],
 ['风机防雷专项工作','株洲所风机防雷专项'],
 ['风机防塔架倾覆专项工作','山东风电风力发电机组预防塔架倾覆关键技术研究'],
 ['启航新能源叶根螺栓设计项目','启航新能源叶根螺栓设计'],
 ['福伊特-宜阳五期全厂机组的齿轮箱批量铁屑剥落问题','株洲所宜阳五期全场机组的齿轮箱（中车福伊特）批量铁屑、剥落问题'],
 ['株洲电机-6.25MW江苏中车电机无纬带脱落批量问题','株洲电机6.25MW江苏中车电机挡边带脱落批量问题'],
].map(([word,excel])=>[keyText(word),keyText(excel)]))

export function resolveSummary(project:SummaryProject,groups:SummaryGroup[],saved?:SummaryLink[]):SummaryResolution{
 if(saved?.length){
  const selected=saved.map(link=>{
   const group=groups.find(entry=>entry.key===link.key)
   return group&&{...group,role:link.role}
  })
  if(selected.every(group=>!!group))return {status:'matched',groups:selected,reason:'按已确认的项目映射取数'}
  return {status:'unresolved',groups:selected.filter(group=>!!group),reason:'部分已保存记录在本期无法定位，请重新确认'}
 }
 const sectionCategory=summaryCategory(project.section)
 const originalName=keyText(project.name)
 const name=projectAliases.get(originalName)||originalName
 const qualified=groups.filter(group=>(!sectionCategory||group.category===sectionCategory)
  &&!!group.unit&&name===keyText(group.unit+group.project))
 const candidates=qualified.length?qualified:groups.filter(group=>(!sectionCategory||group.category===sectionCategory)&&name===keyText(group.project))
 return candidates.length===1
  ?{status:'matched',groups:candidates,reason:'按分组、项目名称和单位匹配'}
  :{status:'unresolved',groups:[],reason:candidates.length?'有多个同名候选，请确认对应记录':'未找到唯一对应记录，请选择来源或确认本期未报送'}
}

const cleanText=(value:string)=>value.replace(/\r\n?/g,'\n').trim()
const meaningful=(value:string|undefined)=>!!value&&!/^(?:[\s/／—–－-]+|无|暂无|无进展|本周无进展|暂无进展)[。.]?$/.test(value.trim())
export function workLabel(row:ReportItem){
 return [row.fields.work,row.fields.content,row.project].find(meaningful)?.replace(/\s*\n\s*/g,' ').trim()||'工作'
}
export function formatSummary(groups:SummaryGroup[],field:'current'|'next'){
 const units=new Map<string,{heading:string;lines:Set<string>}>()
 for(const group of groups){
  const unit=reportUnitKey(group.unit)
  const entry=units.get(unit)||{heading:group.unit.replace(/\s*\n\s*/g,'、')+(group.role?'（'+group.role+'）':''),lines:new Set<string>()}
  units.set(unit,entry)
  for(const row of group.rows){
   const raw=row.fields[field]
   if(!meaningful(raw))continue
   const label=workLabel(row),value=cleanText(raw!)
   entry.lines.add(value.startsWith(label+'：')||value.startsWith(label+':')?value:label+'：'+value)
  }
 }
 const blocks=[...units.values()].filter(entry=>entry.lines.size).map(entry=>{
  const lines=[...entry.lines]
  const body=lines.length>1?lines.map((line,i)=>`${i+1}. ${line}`).join('\n'):lines[0]
  return units.size>1&&entry.heading?entry.heading+'\n'+body:body
 })
 return blocks.join('\n\n')||'/'
}

export const groupLocation=(group:SummaryGroup)=>{
 const sheet=Object.values(group.rows[0].targets)[0]?.sheet||categories[group.category]
 return sheet+' · 第 '+group.rows.map(row=>row.rowContext?.row).filter(Boolean).join('、')+' 行'
}
