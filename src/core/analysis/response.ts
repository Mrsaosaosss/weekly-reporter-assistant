import {uid,type Proposal,type FieldKey} from '../model'
import type {AnalysisInput} from './provider'
import {validateProposal} from '../report/rules'
export function validateAIResult(result:unknown,input:AnalysisInput):Proposal[]{
 if(!result||typeof result!=='object'||!Array.isArray((result as {proposals?:unknown}).proposals))throw new Error('AI 返回结构无效')
 const list=(result as {proposals:unknown[]}).proposals;if(list.length>100)throw new Error('AI 返回过多建议')
 return list.map(value=>{
  if(!value||typeof value!=='object')throw new Error('AI 建议格式无效')
  const v=value as Record<string,unknown>,item=input.items.find(i=>i.id===v.itemId)
  if(!item||typeof v.field!=='string'||!Object.prototype.hasOwnProperty.call(item.targets,v.field)||!['unit','project','description','owner','deadline','history','current','next','deviation','result','status','content','work'].includes(v.field)||typeof v.text!=='string'||v.text.length>50000||!Array.isArray(v.sourceIds)||!v.sourceIds.length||v.sourceIds.some(id=>typeof id!=='string'||!input.sources.some(s=>s.id===id)))throw new Error('AI 返回了无效事项、字段或来源')
  const p:Proposal={id:uid(),reportId:item.reportId,itemId:item.id,field:v.field as FieldKey,before:item.fields[v.field as FieldKey]||'',suggested:v.text,sourceIds:[...new Set(v.sourceIds as string[])],warnings:[],batchId:input.batchId,baseRevision:input.baseRevision}
  p.warnings=validateProposal(p,item,input.sources).map(i=>i.message);return p
 })
}
