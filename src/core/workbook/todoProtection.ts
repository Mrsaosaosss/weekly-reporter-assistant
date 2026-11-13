import type {WorkbookDocument,SheetMapping} from '../model'
import {xml,nodes,rowNumber,colName} from './read'
export interface TodoNotice {kind:string;location:string;message:string}
export interface ProtectedRows {from:number;to:number}
export function inspectTodoTemplate(book:WorkbookDocument,map:SheetMapping){
 const sheet=book.sheets.find(s=>s.name===map.sheet)
 const notices:TodoNotice[]=[],reserved:ProtectedRows[]=[]
 if(!sheet)return {notices,reserved,last:map.headerRow}
 const doc=xml(sheet.xml),last=Math.max(map.headerRow,...nodes(doc,'row').map(r=>Number(r.getAttribute('r'))))
 const reserve=(range:string)=>{const [a,b=a]=range.replaceAll('$','').split(':');if(rowNumber(a)&&rowNumber(b))reserved.push({from:rowNumber(a),to:rowNumber(b)})}
 const note=(kind:string,range:string,message:string)=>notices.push({kind,location:`${sheet.name}!${range}`,message})
 const filePart=(path:string)=>book.parts[path]?xml(new TextDecoder().decode(book.parts[path])):undefined
 const parent=sheet.path.slice(0,sheet.path.lastIndexOf('/')+1),relPath=parent+'_rels/'+sheet.path.split('/').at(-1)+'.rels',rels=filePart(relPath)
 const related=(id:string)=>{const rel=rels&&nodes(rels,'Relationship').find(r=>r.getAttribute('Id')===id);if(!rel||rel.getAttribute('TargetMode')==='External')return undefined;const target=rel.getAttribute('Target')||'';const pieces=(target.startsWith('/')?target.slice(1):parent+target).split('/'),parts:string[]=[];for(const p of pieces){if(p==='..')parts.pop();else if(p&&p!=='.')parts.push(p)}return filePart(parts.join('/'))}
 for(const c of nodes(doc,'c'))for(const f of nodes(c,'f')){
  const address=c.getAttribute('r')||'',range=f.getAttribute('ref')||address
  reserve(range);note('公式',range,'原公式及所在行保留，需在Excel中人工核对或替换。')
 }
 for(const tag of ['tablePart','pivotTablePart'])for(const part of nodes(doc,tag)){
  const id=part.getAttribute('r:id')||'',table=related(id)?.documentElement,range=table?.getAttribute('ref')||table&&nodes(table,'location')[0]?.getAttribute('ref')
  if(range)reserve(range);else reserved.push({from:map.headerRow+1,to:last})
  note('表对象',range||`对象 ${table?.getAttribute('name')||id}（范围未识别）`,'表对象、原区域内容和结构保留，需在Excel中人工替换。')
 }
 const rowNodes=new Map(nodes(doc,'row').map(r=>[Number(r.getAttribute('r')),r]))
 const defaultHeight=Number(nodes(doc,'sheetFormatPr')[0]?.getAttribute('defaultRowHeight')||15)
 const height=(row:number)=>{const node=rowNodes.get(row);return node?.getAttribute('hidden')==='1'?0:Number(node?.getAttribute('ht')||defaultHeight)*12700}
 const bottomRow=(start:number,extent:number)=>{let row=start,remaining=Math.max(0,extent);while(row<1048576&&remaining>height(row)){remaining-=height(row);row++}return row}
 const positionRow=(offset:number)=>{let row=1,left=Math.max(0,offset);while(row<1048576&&left>=height(row)){left-=height(row);row++}return {row,offset:left}}
 for(const tag of ['drawing','legacyDrawing','legacyDrawingHF'])for(const part of nodes(doc,tag)){
  const id=part.getAttribute('r:id')||'',drawing=related(id),anchors=drawing?[...nodes(drawing,'twoCellAnchor'),...nodes(drawing,'oneCellAnchor'),...nodes(drawing,'absoluteAnchor')]:[]
  if(anchors.length){for(const anchor of anchors){
   const from=nodes(anchor,'from')[0],to=nodes(anchor,'to')[0],extent=Number(nodes(anchor,'ext')[0]?.getAttribute('cy')||0)
   let range=''
   if(from){
    const fromRow=Number(nodes(from,'row')[0]?.textContent||0)+1,fromCol=Number(nodes(from,'col')[0]?.textContent||0)+1
    const start=colName(fromCol)+fromRow
    const end=to?colName(Number(nodes(to,'col')[0]?.textContent||0)+1)+(Number(nodes(to,'row')[0]?.textContent||0)+1):colName(fromCol)+bottomRow(fromRow,Number(nodes(from,'rowOff')[0]?.textContent||0)+extent)
    range=start+(end!==start?':'+end:'');reserve(range)
   }else if(anchor.localName==='absoluteAnchor'&&nodes(anchor,'pos')[0]){
    const pos=nodes(anchor,'pos')[0],start=positionRow(Number(pos.getAttribute('y')||0)),end=bottomRow(start.row,start.offset+extent)
    reserved.push({from:start.row,to:end});range=`第${start.row}–${end}行（绝对定位图形，x=${pos.getAttribute('x')||0}，y=${pos.getAttribute('y')||0} EMU）`
   }else reserved.push({from:map.headerRow+1,to:last})
   note('图形',range||`图形 ${id}（锚点未识别）`,'图形及原锚点保留，对应行不自动替换，请人工处理。')
  }}else {reserved.push({from:map.headerRow+1,to:last});const coordinates=drawing&&nodes(drawing,'ClientData').map(n=>{const row=nodes(n,'Row')[0]?.textContent,col=nodes(n,'Column')[0]?.textContent;return row!==undefined&&col!==undefined?colName(Number(col)+1)+(Number(row)+1):''}).filter(Boolean);note('图形',coordinates?.join('、')||`图形 ${id}（绝对定位或锚点未识别）`,'图形部件保持原样；旧正文保留，本期待办另排在旧正文后，需人工核对。')}
 }
 // Preserve merged regions touching retained rows; never leave orphaned merge anchors.
 let expanded=true;const merges=nodes(doc,'mergeCell').map(m=>m.getAttribute('ref')||'')
 for(const range of merges){const [a,b=a]=range.split(':');if(rowNumber(a)<=map.headerRow&&rowNumber(b)>map.headerRow){reserve(range);note('跨表头合并',range,'跨表头合并区域保留，本期待办跳过对应行。')}}
 while(expanded){expanded=false;for(const range of merges){const [a,b=a]=range.split(':'),from=rowNumber(a),to=rowNumber(b);if(reserved.some(r=>from<=r.to&&to>=r.from)&&!reserved.some(r=>r.from<=from&&r.to>=to)){reserved.push({from,to});expanded=true}}}
 return {notices,reserved,last}
}
export function protectedRow(row:number,ranges:ProtectedRows[]){return ranges.some(r=>row>=r.from&&row<=r.to)}
export function todoDestinations(headerRow:number,count:number,ranges:ProtectedRows[]){
 const result:number[]=[];let row=headerRow+1
 for(let i=0;i<count;i++){
  for(;;){const hits=ranges.filter(r=>row>=r.from&&row<=r.to);if(!hits.length)break;row=Math.max(...hits.map(r=>r.to))+1}
  if(row>1048576)return undefined
  result.push(row++)
 }
 return result
}

export function todoNotices(book:WorkbookDocument,maps:SheetMapping[],count:number):TodoNotice[]{return maps.flatMap(map=>{const result=inspectTodoTemplate(book,map);return [...result.notices,...(todoDestinations(map.headerRow,count,result.reserved)?[]:[{kind:'可用行不足',location:map.sheet,message:'未能完整写入本期待办，原待办表保持不变。请下载“本期待办排序表”人工粘贴。'}])]})}
