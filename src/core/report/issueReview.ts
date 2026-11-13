import {type FieldKey,type ReportItem,type SourceFragment,type ManualReviewState,type ManualCellDecision} from '../model'
import {normalize} from './match'
import {rowCompatible} from './correspondence'
import {reportUnitKey,routeMatches,sourceRoute} from './sourceMap'
export const reviewFields:FieldKey[]=['owner','deadline','history','status','deviation','result','current','next','remarks']
export const emptyManualState=():ManualReviewState=>({decisions:{},sources:{},completed:[]})
export interface IssueGroup {id:string;category:ReportItem['category'];unit:string;project:string;description:string;title:string;items:ReportItem[]}
export function physicalItems(items:ReportItem[]){return [...items].sort((a,b)=>{const order=['source','batch','farm','special','todo'];if(a.category!==b.category)return order.indexOf(a.category)-order.indexOf(b.category);const ar=Object.values(a.targets)[0],br=Object.values(b.targets)[0];const sheet=(ar?.sheet||'').localeCompare(br?.sheet||'');if(sheet)return sheet;const row=(i:ReportItem)=>i.rowContext?.row||Math.max(0,...Object.values(i.targets).map(r=>Number(r.address.match(/\d+/)?.[0]||0)));return row(a)-row(b)||a.id.localeCompare(b.id)})}
export function groupIssues(items:ReportItem[]):IssueGroup[]{
 const groups=new Map<string,IssueGroup>()
 for(const item of physicalItems(items).filter(i=>i.category!=='todo')){
  const ref=item.targets.description,projectRef=item.targets.project
  const identity=ref?`${ref.fileId}|${ref.sheet}|${ref.address}`:projectRef?`${projectRef.fileId}|${projectRef.sheet}|${projectRef.address}`:normalize(item.fields.description||item.project)
  const key=[item.category,normalize(item.unit),normalize(item.project),identity].join('|')
  const description=item.fields.description||''
  const turbine=description.match(/[A-Za-z]?\d{1,3}\s*(?:号)?\s*(?:风机|机组)/)?.[0]?.replace(/\s/g,'')||''
  const fault=description.match(/叶片断裂|叶片开裂|叶片损伤|齿轮箱故障|轴承故障|发电机故障|螺栓断裂|漏油/)?.[0]||description.replace(/^问题描述[：:]\s*/,'').split(/[。\n]/)[0].slice(0,30)
  if(!groups.has(key))groups.set(key,{id:item.id,category:item.category,unit:item.unit,project:item.project,description,title:[item.unit,item.project,[turbine,fault].filter(Boolean).join(' ')].filter(Boolean).join(' · '),items:[]})
  groups.get(key)!.items.push(item)
 }
 return [...groups.values()]
}
function projectMatchKey(item:Pick<ReportItem,'category'|'project'>){
 const key=normalize(item.project.normalize('NFKC')).replace(/(?:项目|风场)+$/,'')
 if(item.category==='source')return key.replace(/^湖北(?=红安$)|^湖南(?=桃花山$)/,'')
 if(item.category==='special'&&['海西喀什项目交付','海西州项目交付','海西洲项目交付'].includes(key))return '海西州项目交付'
 return key
}
function workMatchKey(path:string[],category:ReportItem['category']){
 let text=path.join('|').normalize('NFKC').replace(/原因分析[（(]应急排查[、,，]根因分析[）)]/g,'原因分析').replace(/√/g,'')
 if(category==='special')text=text.replace(/海西洲项目/g,'海西州项目')
 return normalize(text)
}
export function sourceCandidates(item:ReportItem,sources:SourceFragment[],items:ReportItem[]=[item]){
 const scoped=sources.filter(source=>routeMatches(item,source)
  &&projectMatchKey({...source,category:item.category})===projectMatchKey(item)
  &&rowCompatible(item,source))
 const exact=scoped.filter(source=>workMatchKey(source.taskPath,item.category)===workMatchKey(item.taskPath,item.category))
 if(exact.length)return exact
 // These two sites change their task description as their equipment totals change.
 // Only use the work heading when it identifies one physical row on both sides.
 const siteTask=item.category==='batch'
  &&['6.25MW江苏中车电机挡边带脱落批量问题','发电机轴承漏脂批量问题'].map(normalize).includes(projectMatchKey(item))
  &&workMatchKey(item.taskPath.slice(0,1),item.category)==='现场处置'
 if(!siteTask)return []
 const peers=items.filter(peer=>peer.category===item.category
  &&reportUnitKey(peer.unit)===reportUnitKey(item.unit)
  &&reportUnitKey(peer.fields.supplier||'')===reportUnitKey(item.fields.supplier||'')
  &&projectMatchKey(peer)===projectMatchKey(item)
  &&workMatchKey(peer.taskPath.slice(0,1),peer.category)==='现场处置')
 const sameHeading=scoped.filter(source=>workMatchKey(source.taskPath.slice(0,1),item.category)==='现场处置')
 return peers.length===1&&sameHeading.length===1?sameHeading:[]
}
export function resolveIssueSource(item:ReportItem,sources:SourceFragment[],_state:ManualReviewState,items:ReportItem[]=[item]){
 const route=sourceRoute(item)
 const candidates=sourceCandidates(item,sources,items)
 const description=normalize(item.fields.description||'')
 const exact=candidates.filter(s=>normalize(s.fields.description||'')===description)
 // A different named turbine is a different incident even when the project is the same.
 const machine=(text:string)=>[...text.normalize('NFKC').matchAll(/(?<![a-z0-9])([a-z]?\d{1,3})\s*(?:#|号\s*(?:风机|机组|机位))|#\s*([a-z]?\d{1,3})(?!\d)|\b([a-z]\d{2})叶片/gi)].map(m=>(m[1]||m[2]||m[3]).toLowerCase().replace(/^0+(?=\d)/,''))
 const turbines=machine(item.fields.description||'')
 const compatible=candidates.filter(s=>{
  const other=machine(s.fields.description||'')
  return !turbines.length||!other.length||other.some(t=>turbines.includes(t))
 })
 const matches=exact.length?exact:compatible
 const source=matches.length===1?matches[0]:undefined
 return {candidates,source,route,reason:source?'已按规则定位到本期工作行':!route?'按规则保留上期':!route.unit?'底稿缺少映射单位，保留上期':matches.length>1?'同一映射范围内存在重复工作行，保留上期':'本期未找到对应工作行，保留上期'}
}
export function targetKey(item:ReportItem,field:FieldKey){const r=item.targets[field];return r?`${r.fileId}|${r.sheet}|${r.address}`:''}
export function decisionOwner(items:ReportItem[],item:ReportItem,field:FieldKey){const key=targetKey(item,field);return physicalItems(items).find(i=>key&&targetKey(i,field)===key)?.id||item.id}
export function cellDecision(items:ReportItem[],item:ReportItem,field:FieldKey,state:ManualReviewState):ManualCellDecision|undefined{const key=targetKey(item,field);return physicalItems(items).filter(i=>key&&targetKey(i,field)===key).map(i=>state.decisions[i.id]?.[field]).find(Boolean)}
export function sourceFieldExists(source:SourceFragment|undefined,field:FieldKey){return !!source&&Object.prototype.hasOwnProperty.call(source.fields,field)}
export function normalizePlaceholder(text:string){return /^[\s/／\\—–－−-]+$/.test(text)?'-':text}
export function sameText(a:string,b:string){return normalizePlaceholder(a).replace(/\r\n/g,'\n')===normalizePlaceholder(b).replace(/\r\n/g,'\n')}
