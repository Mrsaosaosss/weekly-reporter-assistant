import type {ReportItem,SourceFragment,MatchResult,CoverageResult} from '../model'
export function measureCoverage(items:ReportItem[],sources:SourceFragment[],matches:MatchResult[],exclusions:Record<string,string>):CoverageResult{
 const used=new Set(matches.flatMap(m=>m.sourceIds)),mapped=new Set(matches.filter(m=>m.sourceIds.length).map(m=>m.itemId))
 return {unmatchedItems:items.filter(i=>!mapped.has(i.id)).map(i=>i.id),unmappedSources:sources.filter(s=>!used.has(s.id)&&!exclusions[s.id]?.trim()).map(s=>s.id),excluded:exclusions}
}
