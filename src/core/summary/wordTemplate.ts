import {unzipSync,zipSync,strFromU8,strToU8} from 'fflate'
import {xml} from '../workbook/read'
import {summaryKey,type SummaryOutput,type SummaryProject} from './summary'

const WORD='http://schemas.openxmlformats.org/wordprocessingml/2006/main'
const MAIN='word/document.xml'
const LIMIT=30*1024*1024
const direct=(element:Element,tag:string)=>Array.from(element.children).filter(child=>child.namespaceURI===WORD&&child.localName===tag)
const wordText=(element:Element)=>{
 const paragraphs=direct(element,'p')
 return paragraphs.map(p=>Array.from(p.getElementsByTagNameNS(WORD,'t')).map(t=>t.textContent||'').join('')).join('\n').trim()
}
const label=(value:string)=>value.replace(/\s+/g,'')
const isHeader=(cells:Element[])=>cells.length===4&&
 /^(项目|项目名称|问题名称)$/.test(label(wordText(cells[0])))&&
 /^(项目基本信息|问题基本信息|问题描述|基本信息)$/.test(label(wordText(cells[1])))&&
 label(wordText(cells[2]))==='本周进展'&&label(wordText(cells[3]))==='下周计划'
const isSection=(value:string)=>/^[一二三四五六七八九十]+[、.．]/.test(value)

export interface SummaryTemplate {
 parts:Record<string,Uint8Array>
 document:Document
 table:Element
 projects:SummaryProject[]
 sections:string[]
}

export function readSummaryTemplate(bytes:Uint8Array):SummaryTemplate{
 if(bytes.length>LIMIT)throw new Error('上期 Word 文件超过 30 MB')
 let parts:Record<string,Uint8Array>
 let size=0,tooLarge=false
 try{
  parts=unzipSync(bytes,{filter:file=>{
   size+=file.originalSize
   const valid=size<4*LIMIT&&file.originalSize<40*1024*1024
   if(!valid)tooLarge=true
   return valid
  }})
 }catch{throw new Error('无法读取上期 Word，请选择未加密的 .docx 文件')}
 if(tooLarge)throw new Error('上期 Word 解压后过大')
 if(!parts[MAIN]||!parts['[Content_Types].xml'])throw new Error('无法找到 Word 正文')
 if(Object.keys(parts).some(name=>/vbaProject|^word\/activeX\//i.test(name)))throw new Error('请上传不含宏和 ActiveX 的 .docx 文件')
 const document=xml(strFromU8(parts[MAIN]))
 const body=document.getElementsByTagNameNS(WORD,'body')[0]
 const tables=body?direct(body,'tbl').filter(table=>direct(table,'tr').some(row=>isHeader(direct(row,'tc')))):[]
 if(tables.length!==1)throw new Error('请上传含一张“项目、项目基本信息、本周进展、下周计划”表格的 Word')
 const table=tables[0],projects:SummaryProject[]=[],sections:string[]=[]
 let section=''
 for(const [index,row] of direct(table,'tr').entries()){
  const cells=direct(row,'tc'),name=cells[0]?wordText(cells[0]):''
  if(isHeader(cells))continue
  if(cells.length===1&&isSection(name)){
   if(sections.includes(name))throw new Error('Word 中存在重复分组，请核对分组标题')
   section=name
   sections.push(name)
  }else if(cells.length===4&&name){
   if(!sections.includes(section))sections.push(section)
   projects.push({id:String(index),name,info:wordText(cells[1]),section})
  }else if(cells.some(cell=>wordText(cell))){
   throw new Error('Word 第 '+(index+1)+' 行的表格结构不符合样例，请核对四列和分组标题')
  }
 }
 const identities=projects.map(summaryKey)
 if(new Set(identities).size!==identities.length)throw new Error('上期 Word 中有重复的项目行，请先区分同名项目的基本信息')
 if(!projects.length)throw new Error('Word 表格中没有常设项目')
 return {parts,document,table,projects,sections}
}

function putText(cell:Element,text:string){
 const document=cell.ownerDocument
 const old=direct(cell,'p')[0]
 const paragraphStyle=old&&direct(old,'pPr')[0]
 const run=old?.getElementsByTagNameNS(WORD,'r')[0]
 const runStyle=run&&direct(run,'rPr')[0]
 for(const child of Array.from(cell.children))if(child.localName!=='tcPr')child.remove()
 for(const line of (text.trim()||'/').replace(/\r\n?/g,'\n').split('\n')){
  const paragraph=document.createElementNS(WORD,'w:p')
  if(paragraphStyle){
   const style=paragraphStyle.cloneNode(true) as Element
   for(const tag of ['numPr','pageBreakBefore'])for(const child of direct(style,tag))child.remove()
   paragraph.append(style)
  }
  const r=document.createElementNS(WORD,'w:r')
  if(runStyle){
   const style=runStyle.cloneNode(true) as Element
   for(const tag of ['color','highlight','shd','strike','dstrike','vanish'])for(const child of direct(style,tag))child.remove()
   r.append(style)
  }
  const t=document.createElementNS(WORD,'w:t')
  t.setAttributeNS('http://www.w3.org/XML/1998/namespace','xml:space','preserve')
  t.textContent=line.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'')
  r.append(t)
  paragraph.append(r)
  cell.append(paragraph)
 }
}

export function writeSummaryDocument(template:SummaryTemplate,output:SummaryOutput[]){
 const document=template.document.cloneNode(true) as Document
 const body=document.getElementsByTagNameNS(WORD,'body')[0]
 const table=direct(body,'tbl').find(candidate=>direct(candidate,'tr').some(row=>isHeader(direct(row,'tc'))))!
 const rows=direct(table,'tr')
 const originals=new Map(template.projects.map(project=>[project.id,project]))
 const outputById=new Map(output.map(project=>[project.id,project]))
 const lastBySection=new Map<string,Element>()
 for(const project of template.projects){
  const result=outputById.get(project.id)
  if(!result)throw new Error('缺少常设项目的生成结果：'+project.name)
  const row=rows[Number(project.id)],cells=direct(row,'tc')
  putText(cells[2],result.current)
  putText(cells[3],result.next)
  lastBySection.set(project.section,row)
 }
 for(const result of output.filter(project=>!originals.has(project.id))){
  const sibling=lastBySection.get(result.section)
  const heading=rows.find(row=>{
   const cells=direct(row,'tc')
   return cells.length===1&&wordText(cells[0])===result.section
  })
  const insertion=sibling||heading
  if(!insertion)throw new Error('请选择新增项目的分组')
  const row=(sibling||rows[Number(template.projects[0].id)]).cloneNode(true) as Element
  const cells=direct(row,'tc')
  for(const [index,value] of [result.name,result.info,result.current,result.next].entries())putText(cells[index],value)
  insertion.after(row)
  lastBySection.set(result.section,row)
 }
 // An exact row height from an older report must not clip new text.
 for(const row of direct(table,'tr')){
  if(isHeader(direct(row,'tc')))continue
  for(const p of direct(row,'trPr'))for(const height of direct(p,'trHeight')){
   if(height.getAttributeNS(WORD,'hRule')==='exact')height.setAttributeNS(WORD,'w:hRule','atLeast')
  }
 }
 return zipSync({...template.parts,[MAIN]:strToU8(new XMLSerializer().serializeToString(document))})
}
