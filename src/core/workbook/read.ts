import {unzipSync,strFromU8} from 'fflate'
import type {WorkbookDocument,Worksheet,Cell} from '../model'
export const NS='http://schemas.openxmlformats.org/spreadsheetml/2006/main'
export const nodes=(node:Document|Element,name:string)=>Array.from(node.getElementsByTagNameNS('*',name))
export function xml(text:string):Document{
 const doc=new DOMParser().parseFromString(text,'application/xml')
 if(doc.getElementsByTagName('parsererror').length||/<!DOCTYPE|<!ENTITY/i.test(text))throw new Error('工作簿 XML 无效或包含不支持的定义')
 return doc
}
export function colNumber(s:string){return [...s.replace(/\d/g,'')].reduce((n,c)=>n*26+c.charCodeAt(0)-64,0)}
export function colName(n:number){let s='';for(;n>0;n=Math.floor((n-1)/26))s=String.fromCharCode(65+(n-1)%26)+s;return s}
export const rowNumber=(s:string)=>Number(s.match(/\d+/)?.[0]||0)
export function fingerprint(bytes:Uint8Array){let n=14695981039346656037n;for(const b of bytes)n=BigInt.asUintN(64,(n^BigInt(b))*1099511628211n);return `${bytes.length}-${n.toString(16)}`}
export function readWorkbook(buffer:ArrayBuffer,fileId:string):WorkbookDocument{
 const bytes=new Uint8Array(buffer)
 if(bytes.length>30*1024*1024)throw new Error('文件超过30MB，请拆分后导入')
 let total=0;let rejected=false
 let parts:Record<string,Uint8Array>
 try{parts=unzipSync(bytes,{filter:f=>{total+=f.originalSize;const ok=total<120*1024*1024&&f.originalSize<40*1024*1024;if(!ok)rejected=true;return ok}})}catch{throw new Error('无法读取工作簿，请确认是未加密且完整的 .xlsx 文件')}
 if(rejected)throw new Error('工作簿解压后过大，无法安全读取')
 const text=(p:string)=>{if(!parts[p])throw new Error('工作簿缺少部件：'+p);return strFromU8(parts[p])}
 const workbook=xml(text('xl/workbook.xml'))
 const relationships=xml(text('xl/_rels/workbook.xml.rels'))
 const rels=new Map(nodes(relationships,'Relationship').map(n=>[n.getAttribute('Id'),n.getAttribute('Target')||'']))
 const shared=parts['xl/sharedStrings.xml']?nodes(xml(text('xl/sharedStrings.xml')),'si').map(si=>({text:nodes(si,'t').map(t=>t.textContent||'').join(''),rich:nodes(si,'r').length>0})):[]
 const sheets:Worksheet[]=nodes(workbook,'sheet').map(s=>{
  const target=rels.get(s.getAttribute('r:id')||s.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships','id'))
  if(!target||target.includes('..')||/https?:/.test(target))throw new Error('工作表关系不支持：'+s.getAttribute('name'))
  const path=target.startsWith('/')?target.slice(1):'xl/'+target.replace(/^\.\//,'')
  const source=text(path),doc=xml(source),cells:Record<string,Cell>={}
  for(const c of nodes(doc,'c')){
   const address=c.getAttribute('r')||'';if(!/^[A-Z]+[1-9]\d*$/.test(address))continue
   const type=c.getAttribute('t')||'n',value=nodes(c,'v')[0]?.textContent||''
   const ss=type==='s'?shared[Number(value)]:undefined
   const t=ss?.text??(type==='inlineStr'?nodes(c,'t').map(t=>t.textContent||'').join(''):value)
   cells[address]={address,row:rowNumber(address),column:colNumber(address),text:t,type,formula:nodes(c,'f').length?(nodes(c,'f')[0].textContent||''):undefined,style:c.getAttribute('s')||undefined,rich:ss?.rich||nodes(c,'r').length>0}
  }
  return {name:s.getAttribute('name')||'',path,cells,merges:nodes(doc,'mergeCell').map(n=>n.getAttribute('ref')||''),xml:source}
 })
 if(!sheets.length)throw new Error('工作簿中没有可读取的工作表')
 return {fileId,digest:fingerprint(bytes),bytes,parts,sheets}
}
export function resolvedCell(sheet:Worksheet,row:number,column:number):Cell|undefined{
 const own=sheet.cells[colName(column)+row]
 for(const ref of sheet.merges){const [a,b]=ref.split(':');if(!b)continue;if(row>=rowNumber(a)&&row<=rowNumber(b)&&column>=colNumber(a)&&column<=colNumber(b))return sheet.cells[a]||own}
 return own
}
