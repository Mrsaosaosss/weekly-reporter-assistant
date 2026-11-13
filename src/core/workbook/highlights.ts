import {strFromU8,strToU8} from 'fflate'
import {xml,nodes,NS} from './read'
const MARKS='xl/weeklyReportHighlights.xml'
const DEFAULT_STYLES=`<styleSheet xmlns="${NS}"><fonts count="1"><font><sz val="11"/><name val="宋体"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="1"><xf fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs></styleSheet>`
export function clearHighlights(parts:Record<string,Uint8Array>):boolean{
 if(!parts[MARKS])return false
 const marks=nodes(xml(strFromU8(parts[MARKS])),'mark'),docs=new Map<string,Document>()
 for(const mark of marks){
  const path=mark.getAttribute('path')||'',address=mark.getAttribute('cell')||'',style=mark.getAttribute('style')||''
  if(!path.startsWith('xl/worksheets/')||!parts[path]||!/^\d*$/.test(style))continue
  const doc=docs.get(path)||xml(strFromU8(parts[path]));docs.set(path,doc)
  const c=nodes(doc,'c').find(c=>c.getAttribute('r')===address)
  if(c){if(style)c.setAttribute('s',style);else c.removeAttribute('s')}
 }
 for(const [path,doc] of docs)parts[path]=strToU8(new XMLSerializer().serializeToString(doc))
 delete parts[MARKS];return true
}
export function highlighting(parts:Record<string,Uint8Array>){
 const styles=xml(parts['xl/styles.xml']?strFromU8(parts['xl/styles.xml']):DEFAULT_STYLES)
 const fonts=nodes(styles,'fonts')[0],fills=nodes(styles,'fills')[0],xfs=nodes(styles,'cellXfs')[0]
 if(!fonts||!fills||!xfs)throw new Error('模板样式缺少字体、填充或单元格样式，不能安全标色')
 const marks=xml('<highlights xmlns="urn:weekly-report-tool:highlights"/>'),cache=new Map<string,string>()
 function styleFor(c:Element,path:string,kind:'changed'|'attention'){
  const original=c.getAttribute('s')||'',base=original||'0',key=base+':'+kind
  if(!cache.has(key)){
   const originalXf=xfs.children[Number(base)];if(!originalXf)throw new Error('模板引用了不存在的样式：'+base)
   const xf=originalXf.cloneNode(true) as Element
   if(kind==='changed'){
    const originalFont=fonts.children[Number(xf.getAttribute('fontId')||0)];if(!originalFont)throw new Error('模板字体引用无效')
    const font=originalFont.cloneNode(true) as Element
    for(const color of nodes(font,'color'))color.remove()
    const color=styles.createElementNS(NS,'color');color.setAttribute('rgb','FFB42318');font.appendChild(color)
    xf.setAttribute('fontId',String(fonts.children.length));xf.setAttribute('applyFont','1');fonts.appendChild(font)
   }else{
    const fill=styles.createElementNS(NS,'fill'),pattern=styles.createElementNS(NS,'patternFill'),fg=styles.createElementNS(NS,'fgColor'),bg=styles.createElementNS(NS,'bgColor')
    pattern.setAttribute('patternType','solid');fg.setAttribute('rgb','FFFFF2CC');bg.setAttribute('indexed','64');pattern.append(fg,bg);fill.appendChild(pattern)
    xf.setAttribute('fillId',String(fills.children.length));xf.setAttribute('applyFill','1');fills.appendChild(fill)
   }
   cache.set(key,String(xfs.children.length));xfs.appendChild(xf)
  }
  const mark=marks.createElementNS('urn:weekly-report-tool:highlights','mark');mark.setAttribute('path',path);mark.setAttribute('cell',c.getAttribute('r')||'');mark.setAttribute('style',original);marks.documentElement.appendChild(mark)
  c.setAttribute('s',cache.get(key)!)
 }
 function save(){if(!cache.size)return;fonts.setAttribute('count',String(fonts.children.length));fills.setAttribute('count',String(fills.children.length));xfs.setAttribute('count',String(xfs.children.length));parts['xl/styles.xml']=strToU8(new XMLSerializer().serializeToString(styles));parts[MARKS]=strToU8(new XMLSerializer().serializeToString(marks))}
 return {styleFor,save}
}
