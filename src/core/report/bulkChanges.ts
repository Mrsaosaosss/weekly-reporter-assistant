import {isFormulaTarget} from '../workbook/formulaProtection'
import type {ReportItem,SourceFragment,ManualReviewState,WorkbookDocument,FieldKey} from '../model'
import {normalizePlaceholder,reviewFields,resolveIssueSource,sourceFieldExists,sameText,targetKey,cellDecision} from './issueReview'
export function bulkChanges(items:ReportItem[],sources:SourceFragment[],state:ManualReviewState,books:Map<string,WorkbookDocument>){
 const candidates=new Map<string,{itemId:string;field:FieldKey;mode:'source';text:string}[]>(),skipped=new Set<string>()
 for(const item of items.filter(i=>i.category!=='todo')){
  const source=resolveIssueSource(item,sources,state,items).source
  for(const field of reviewFields){const ref=item.targets[field],key=targetKey(item,field);if(!ref||cellDecision(items,item,field,state))continue
   if(!sourceFieldExists(source,field)){skipped.add(key);continue}
   const text=normalizePlaceholder(source!.fields[field]!),book=books.get(ref.fileId),sheet=book?.sheets.find(s=>s.name===ref.sheet)
   if(!sheet||isFormulaTarget(book,ref.sheet,ref.address)){skipped.add(key);continue}
   // Include unchanged peers so a shared target cannot silently take a conflicting row's value.
   candidates.set(key,[...(candidates.get(key)||[]),{itemId:item.id,field,mode:'source',text}])
  }
 }
 const cells:{itemId:string;field:FieldKey;mode:'source'}[]=[]
 for(const [key,entries] of candidates){
  if(skipped.has(key)||new Set(entries.map(e=>e.text)).size>1||entries.some(e=>e.text.length>32767)){skipped.add(key);continue}
  const entry=entries[0],item=items.find(i=>i.id===entry.itemId)!
  if(!sameText(item.fields[entry.field]||'',entry.text))cells.push({itemId:entry.itemId,field:entry.field,mode:'source'})
 }
 return {cells,skipped:skipped.size}
}
