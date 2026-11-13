import type {ReportItem,SourceFragment,FieldKey} from '../model'
import {normalize} from './match'
export const unitParts=(s:string)=>s.split(/[\n、，,；;]/).map(s=>s.trim()).filter(Boolean)
export const sameUnit=(a:string,b:string)=>!!normalize(a)&&normalize(a)===normalize(b)
export const sharesUnit=(a:string,b:string)=>unitParts(a).some(x=>unitParts(b).some(y=>sameUnit(x,y)))
export function rowCompatible(item:ReportItem,source:SourceFragment,field?:FieldKey){
 const a=item.rowContext,b=source.rowContext
 if(!a||!b||a.size<2&&b.size<2)return true
 if(field&&a.sharedFields.includes(field)&&b.sharedFields.includes(field))return true
 return a.size===b.size&&a.index===b.index
}
export function sourceInScope(source:SourceFragment,item:ReportItem){return !source.targetUnits?.length||source.targetUnits.some(u=>sharesUnit(u,item.unit))}
