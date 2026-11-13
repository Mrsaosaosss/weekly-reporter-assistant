import type {FieldKey,ReportItem,SourceFragment,WorkbookDocument} from '../model'
import {reportUnitKey} from '../report/sourceMap'
import {cellAppearance} from './appearance'

const progressFields:FieldKey[]=['status','current','history','deviation','remarks']
const textKey=(value:string|undefined)=>(value||'').normalize('NFKC').replace(/\s+/g,'')
const meaningful=(value:string|undefined)=>!['','无','—','-','/'].includes(textKey(value))
type TodoRow=ReportItem|SourceFragment
const refsFor=(row:TodoRow)=>'targets' in row?row.targets:row.fieldRefs
const colored=(color:string|undefined)=>!!color&&!['#000000','#FFFFFF'].includes(color)

export function todoHasEmphasis(row:TodoRow,book:WorkbookDocument,peers:TodoRow[]=[row]){
 const refs=refsFor(row),content=cellAppearance(book,refs?.content)
 return progressFields.some(field=>{
  const ref=refs?.[field]
  if(!ref||!meaningful(row.fields[field]))return false
  const style=cellAppearance(book,ref)
  if(colored(style.color)||style.runs?.some(run=>run.text.trim()&&colored(run.color)))return true
  if(style.runs?.some(run=>run.bold&&run.text.trim())&&style.runs.some(run=>!run.bold&&run.text.trim()))return true
  const bold=style.bold,fill=colored(style.background)&&style.background!==content.background
  if(!bold&&!fill)return false
  const styles=peers.filter(peer=>meaningful(peer.fields[field])).flatMap(peer=>{
   const cell=refsFor(peer)?.[field]
   return cell?.sheet===ref.sheet?[cellAppearance(book,cell)]:[]
  })
  return !!(bold&&(styles.length<2||styles.filter(s=>s.bold).length*2<=styles.length)
    ||fill&&(styles.length<2||styles.filter(s=>s.background===style.background).length*2<=styles.length))
 })
}

function meetingDate(value:string|undefined){
 const match=textKey(value).match(/(20\d{2})[年./-](\d{1,2})[月./-](\d{1,2})/)
 return match&&[match[1],match[2].padStart(2,'0'),match[3].padStart(2,'0')].join('-')
}

export function updatedTodoRows(rows:SourceFragment[],baseline:ReportItem[],marked:(row:TodoRow)=>boolean,periodStart?:string){
 const byTask=new Map<string,ReportItem[]>()
 const key=(row:TodoRow)=>reportUnitKey(row.unit)+'|'+textKey(row.fields.content)
 for(const old of baseline.filter(row=>row.category==='todo')){
  const id=key(old)
  byTask.set(id,[...(byTask.get(id)||[]),old])
 }
 return rows.filter(row=>{
  const date=meetingDate(row.fields.meetingDate)
  const previous=(byTask.get(key(row))||[]).filter(old=>{
   const oldDate=meetingDate(old.fields.meetingDate)
   return !date||!oldDate||date===oldDate
  })
  if(!previous.length&&periodStart&&date&&date<periodStart)return marked(row)
  const same=previous.filter(old=>progressFields.every(field=>row.fields[field]===undefined||textKey(row.fields[field])===textKey(old.fields[field])))
  return !same.length||marked(row)&&same.every(old=>!marked(old))
 })
}
