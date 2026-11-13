import {zipSync,strToU8} from 'fflate'
export function makeWorkbookFixture(sheets:{name:string;xml:string}[],extras:Record<string,string>={}):ArrayBuffer {
 const parts:Record<string,Uint8Array>={}
 const xml=(s:string)=>strToU8('<?xml version="1.0" encoding="UTF-8"?>'+s)
 parts['xl/workbook.xml']=xml(`<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s,i)=>`<sheet name="${s.name}" sheetId="${i+1}" r:id="rId${i+1}"/>`).join('')}</sheets></workbook>`)
 parts['xl/_rels/workbook.xml.rels']=xml(`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_,i)=>`<Relationship Id="rId${i+1}" Target="worksheets/sheet${i+1}.xml" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet"/>`).join('')}</Relationships>`)
 sheets.forEach((s,i)=>parts[`xl/worksheets/sheet${i+1}.xml`]=xml(`<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${s.xml}</worksheet>`))
 Object.entries(extras).forEach(([k,v])=>parts[k]=xml(v))
 return zipSync(parts).buffer as ArrayBuffer
}
export const inline=(ref:string,text:string)=>`<c r="${ref}" t="inlineStr"><is><t>${text.replaceAll('&','&amp;').replaceAll('<','&lt;')}</t></is></c>`
export const basicSheet=`<sheetData><row r="4">${['企业名称','项目名称','重点工作','工作内容','完成进度','本周具体工作进展','下周工作计划'].map((t,i)=>inline(String.fromCharCode(65+i)+'4',t)).join('')}</row><row r="5">${inline('A5','甲单位')}${inline('B5','共同项目')}${inline('C5','原因分析')}${inline('D5','试验')}${inline('E5','累计完成2台')}${inline('F5','本周完成1台')}</row><row r="6">${inline('D6','报告')}${inline('F6','计划评审')}</row><row r="7">${inline('A7','乙单位')}${inline('B7','共同项目')}${inline('D7','试验')}${inline('F7','无')}</row></sheetData><mergeCells><mergeCell ref="A5:A6"/><mergeCell ref="B5:B6"/><mergeCell ref="C5:C6"/></mergeCells>`
