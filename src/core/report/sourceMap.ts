import type {ReportItem,SourceFragment} from '../model'
import {normalize} from './match'

export const reportUnitKey=(name:string)=>normalize(name.normalize('NFKC'))
 .replace(/^中车/,'')
 .replace(/^株洲电力机车研究所$/,'株洲所')
 .replace(/^株洲时代新材料科技$/,'时代新材')
 .replace(/^永济(?:电机)?$/,'永济电机')
 .replace(/^戚墅堰机车车辆工艺研究所$/,'戚墅堰所')

export const sourceMappingRules=[
 ['源头质量问题','按企业名称。株洲所查叶片断裂、机舱起火、轮毂坠落三张源头表，其他企业查本单位源头表。'],
 ['批量质量问题','按部件厂。福伊特相关问题按主机厂分别查株洲所或山东风电的批量质量表。'],
 ['自有风场重点问题','仅更新风机功率不达标、风机发电机因轴流风扇故障引发高温停机，均取山东风电。'],
 ['专项工作','按企业名称取本单位专项表，山东风电、启航新能源的“其他工作”按专项处理。'],
 ['周例会待办事项','对照上期提取新增或有更新的事项，按选定周报上传顺序重建并编号。'],
] as const

export function sourceRoute(item:ReportItem){
 const project=normalize(item.project)
 switch(item.category){
  case 'source':{
   const unit=reportUnitKey(item.unit)
   const description=item.fields.description||''
   const incident=/轮毂.{0,8}(坠落|掉落|脱落)/.test(description)?'轮毂坠落'
    :/机舱.{0,8}(起火|着火|火灾)/.test(description)?'机舱起火'
    :/叶片.{0,16}(断裂|折断)/.test(description)?'叶片断裂':undefined
   const sheets=unit==='株洲所'
    ?(incident?[incident]:['叶片断裂','机舱起火','轮毂坠落']).map(type=>'源头质量问题（'+type+'）')
    :['源头质量问题']
   return {unit,sheets}
  }
  case 'batch':{
   const supplier=reportUnitKey(item.fields.supplier||'')
   return {unit:supplier==='福伊特'?reportUnitKey(item.unit):supplier,sheets:['批量质量问题','批量性质量问题','批量质量问题专项']}
  }
  case 'farm':
   return ['风机功率不达标','风机发电机因轴流风扇故障引发高温停机'].includes(project)?{unit:'山东风电',sheets:['自有风场重点问题']}:undefined
  case 'special':{
   const unit=reportUnitKey(item.unit)
   return {unit,sheets:['启航新能源','山东风电'].includes(unit)?['专项工作','其他工作']:['专项工作']}
  }
  default:return undefined
 }
}

export function routeMatches(item:ReportItem,source:SourceFragment){
 const route=sourceRoute(item),sheet=source.refs[0]?.sheet
 if(!route?.unit||item.category!==source.category)return false
 if(reportUnitKey(source.reportingUnit||source.unit)!==route.unit)return false
 if(sheet&&!route.sheets.some(name=>normalize(name)===normalize(sheet)))return false
 if(item.category==='batch'){
  if(source.unit&&reportUnitKey(source.unit)!==reportUnitKey(item.unit))return false
  if(source.fields.supplier&&item.fields.supplier&&reportUnitKey(source.fields.supplier)!==reportUnitKey(item.fields.supplier))return false
 }
 if((item.category==='source'||item.category==='special')&&source.unit&&reportUnitKey(source.unit)!==route.unit)return false
 return true
}
