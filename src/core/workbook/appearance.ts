import type {CellRef,WorkbookDocument} from '../model'
import {nodes,xml} from './read'
export interface CellAppearance {color?:string;background?:string;bold?:boolean;runs?:{text:string;color?:string;bold?:boolean}[]}
const cache=new WeakMap<WorkbookDocument,{styles?:Document;shared?:Document;theme?:Document;sheets:Map<string,Document>;cells:Map<string,CellAppearance>}>()
const indexed=['000000','FFFFFF','FF0000','00FF00','0000FF','FFFF00','FF00FF','00FFFF','000000','FFFFFF','FF0000','00FF00','0000FF','FFFF00','FF00FF','00FFFF','800000','008000','000080','808000','800080','008080','C0C0C0','808080','9999FF','993366','FFFFCC','CCFFFF','660066','FF8080','0066CC','CCCCFF','000080','FF00FF','FFFF00','00FFFF','800080','800000','008080','0000FF','00CCFF','CCFFFF','CCFFCC','FFFF99','99CCFF','FF99CC','CC99FF','FFCC99','3366FF','33CCCC','99CC00','FFCC00','FF9900','FF6600','666699','969696','003366','339966','003300','333300','993300','993366','333399','333333']
export function cellAppearance(book:WorkbookDocument,ref:CellRef|undefined):CellAppearance{
 if(!ref)return {}
 let data=cache.get(book)
 if(!data){const part=(p:string)=>book.parts[p]?xml(new TextDecoder().decode(book.parts[p])):undefined;data={styles:part('xl/styles.xml'),shared:part('xl/sharedStrings.xml'),theme:part('xl/theme/theme1.xml'),sheets:new Map(),cells:new Map()};cache.set(book,data)}
 const key=ref.sheet+'!'+ref.address,hit=data.cells.get(key);if(hit)return hit
 const color=(node:Element|undefined)=>{
  if(!node)return undefined
  let rgb=node.getAttribute('rgb')?.slice(-6)
  if(!rgb&&node.hasAttribute('indexed'))rgb=indexed[Number(node.getAttribute('indexed'))]
  if(!rgb&&node.hasAttribute('theme')&&data!.theme){const scheme=nodes(data!.theme,'clrScheme')[0],themeIndex=[1,0,3,2,4,5,6,7,8,9,10,11][Number(node.getAttribute('theme'))],entry=scheme?.children[themeIndex]?.children[0];rgb=entry?.getAttribute('val')||entry?.getAttribute('lastClr')||undefined;if(rgb&&!/^[a-f\d]{6}$/i.test(rgb))rgb=entry?.getAttribute('lastClr')||undefined}
  if(!rgb||!/^[a-f\d]{6}$/i.test(rgb))return undefined
  const tint=Number(node.getAttribute('tint')||0)
  return '#'+(tint?rgb.match(/../g)!.map(v=>{const n=parseInt(v,16);return Math.round(tint<0?n*(1+tint):n+(255-n)*tint).toString(16).padStart(2,'0')}).join(''):rgb).toUpperCase()
 }
 const sheet=book.sheets.find(s=>s.name===ref.sheet);if(!sheet)return {}
 if(!data.sheets.has(ref.sheet))data.sheets.set(ref.sheet,xml(sheet.xml))
 const c=nodes(data.sheets.get(ref.sheet)!,'c').find(c=>c.getAttribute('r')===ref.address)
 const xf=data.styles?nodes(data.styles,'cellXfs')[0]?.children[Number(c?.getAttribute('s')||0)]:undefined
 const font=data.styles?nodes(data.styles,'fonts')[0]?.children[Number(xf?.getAttribute('fontId')||0)]:undefined,fill=data.styles?nodes(data.styles,'fills')[0]?.children[Number(xf?.getAttribute('fillId')||0)]:undefined
 const pattern=fill&&nodes(fill,'patternFill')[0]
 const bold=(el:Element|undefined)=>{const node=el&&nodes(el,'b')[0];return !!node&&!['0','false'].includes(node.getAttribute('val')||'')}
 const result:CellAppearance={bold:bold(font),color:font?color(nodes(font,'color')[0]):undefined,background:pattern?.getAttribute('patternType')==='solid'?color(nodes(pattern,'fgColor')[0]):undefined}
 const textNode=c?.getAttribute('t')==='s'&&data.shared?nodes(data.shared,'si')[Number(c&&nodes(c,'v')[0]?.textContent)]:c&&nodes(c,'is')[0]
 if(textNode&&nodes(textNode,'r').length)result.runs=nodes(textNode,'r').map(r=>({text:nodes(r,'t').map(t=>t.textContent||'').join(''),color:color(nodes(r,'color')[0]),bold:bold(r)}))
 data.cells.set(key,result);return result
}
