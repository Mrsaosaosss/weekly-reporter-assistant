import type {ParsedReport,SourceFragment,FileAsset} from '../model'
import {reportUnitKey} from './sourceMap'
import {sharesUnit} from './correspondence'
export function bindSourceFragments(parsed:ParsedReport,file:Pick<FileAsset,'unit'|'targetUnits'>):SourceFragment[]{
 return parsed.fragments.flatMap(fragment=>{
  const unit=fragment.unit||(fragment.category==='todo'?file.unit||parsed.reportingUnit:'')||file.targetUnits?.length===1&&file.targetUnits[0]||file.unit||parsed.reportingUnit||''
  if(fragment.category==='todo'){if(file.unit&&reportUnitKey(unit)!==reportUnitKey(file.unit))return []}
  else if(fragment.category!=='batch'&&fragment.category!=='farm'&&file.targetUnits?.length&&!file.targetUnits.some(target=>sharesUnit(unit,target)))return []
  return [{...fragment,unit,reportingUnit:file.unit||parsed.reportingUnit||unit,targetUnits:file.targetUnits,fields:{...fragment.fields,unit}}]
 })
}
