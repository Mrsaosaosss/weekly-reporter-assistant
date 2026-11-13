import type {ReportItem,SourceFragment,MatchResult} from '../model'
import type {AnalysisInput} from './provider'
import {matchItems} from '../report/match'
export function buildAnalysisInput(items:ReportItem[],sources:SourceFragment[],reviewedMatches?:MatchResult[]):AnalysisInput[]{
 const matches=reviewedMatches||matchItems(items,sources)
 return items.flatMap(item=>{const m=matches.find(m=>m.itemId===item.id),relevant=sources.filter(s=>m?.sourceIds.includes(s.id));if(!relevant.length)return []
  const input={items:[item],sources:relevant,batchId:'',baseRevision:0}
  if(JSON.stringify(input).length>75000)throw new Error(`${item.project}的相关材料过长，请先缩小匹配范围；内容没有被截断`)
  return [input]
 })
}
