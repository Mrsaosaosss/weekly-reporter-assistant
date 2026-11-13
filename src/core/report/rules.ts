import {rowCompatible,sourceInScope} from './correspondence'
import type {Proposal,ReportItem,SourceFragment,ValidationIssue} from '../model'
export function mergeHistory(before:string,incoming:string){
 const normalized=before.replace(/\s/g,'')
 const additions=incoming.split(/\r?\n/).filter(s=>s.trim()&&!normalized.includes(s.replace(/\s/g,'')))
 return [before,...additions].filter(Boolean).join('\n')
}
export function validateProposal(p:Proposal,item:ReportItem,sources:SourceFragment[]):ValidationIssue[]{
 const out:ValidationIssue[]=[];const issue=(code:string,message:string,severity:'warning'|'error'='warning')=>out.push({code,message,severity,itemId:item.id})
 const relevant=sources.filter(s=>p.sourceIds.includes(s.id)),raw=relevant.map(s=>s.rawText).join('\n')
 if(relevant.some(s=>!rowCompatible(item,s,p.field)))issue('subrow','同一合并任务的独立子行不能跨行复制进展','error')
 if(relevant.some(s=>!sourceInScope(s,item)))issue('unit-scope','来源未绑定到当前汇总表单位','error')
 if(!p.sourceIds.length||relevant.length!==new Set(p.sourceIds).size)issue('source','缺少有效来源，需手工补充依据','error')
 if(p.field==='status'&&/闭环|销号/.test(p.suggested)&&!/已闭环|已销号|完成闭环/.test(raw))issue('closeout','子任务完成不能推断整个问题已闭环')
 if(p.field==='current'&&/已完成|完成了/.test(p.suggested)&&/计划|预计/.test(raw)&&!/已完成|实际完成/.test(raw))issue('plan-fact','来源为计划或预计，不能确认为已完成')
 const numbers=p.suggested.replace(/^\s*\d+[、.．]/gm,'').match(/\d+(?:\.\d+)?/g)||[]
 if(numbers.some(n=>!raw.includes(n)&&!(item.fields[p.field]||'').includes(n)))issue('numbers','建议中的部分数字或日期没有直接来源，请核实')
 if(p.field==='current'&&/累计/.test(raw)&&!/本周/.test(raw)&&!/累计/.test(p.suggested))issue('cumulative','累计数不能直接作为本周完成数')
 const beforeCount=(item.fields[p.field]||'').match(/累计.*?(\d+)\s*[/／]/),afterCount=p.suggested.match(/累计.*?(\d+)\s*[/／]/)
 if(beforeCount&&afterCount&&+afterCount[1]<+beforeCount[1])issue('decrease','累计数量下降，请核对口径或修正依据')
 if(/\d+台/.test(p.suggested)&&/\d+支/.test(raw)&&!/\d+台/.test(raw))issue('unit','数量单位由支变为台，请核实')
 return out
}
