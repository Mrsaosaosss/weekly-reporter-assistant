import {rowCompatible,sourceInScope} from './correspondence'
import type {ReportItem,SourceFragment,MatchResult} from '../model'
export const normalize=(s:string)=>s.replace(/股份有限公司|有限责任公司|有限公司|公司|企业/g,'').replace(/^[\d一二三四五六七八九十]+[、.．]/,'').replace(/[\s，,。；;（）()\-_/、]/g,'').toLowerCase()
function similarity(a:string,b:string){a=normalize(a);b=normalize(b);if(!a||!b)return 0;if(a===b)return 1;if(a.includes(b)||b.includes(a))return .85;const grams=(s:string)=>new Set([...s].slice(1).map((_,i)=>s.slice(i,i+2))),x=grams(a),y=grams(b);return [...x].filter(c=>y.has(c)).length/Math.max(1,Math.max(x.size,y.size))}
export function matchItems(items:ReportItem[],fragments:SourceFragment[]):MatchResult[]{
 return items.map(item=>{
  const scored=fragments.filter(s=>sourceInScope(s,item)&&(!s.category||s.category===item.category)&&rowCompatible(item,s)&&normalize(s.unit)===normalize(item.unit)&&!!normalize(item.unit)).map(s=>({s,score:similarity(item.project,s.project)*.6+similarity(item.taskPath.join(' '),s.taskPath.join(' '))*.4})).filter(s=>s.score>=.60).sort((a,b)=>b.score-a.score)
  const selected=scored.filter(x=>x.score>=Math.max(.60,(scored[0]?.score||0)-.05))
  const ambiguous=selected.length>1||((selected[0]?.score||0)<.90&&selected.length>0)
  return {itemId:item.id,sourceIds:selected.map(x=>x.s.id),ambiguous,reason:selected.length?(ambiguous?'存在多个或近似候选，请核对任务归属':'单位、项目和任务一致'):'未找到对应报送，请手工关联或确认缺报'}
 })
}
