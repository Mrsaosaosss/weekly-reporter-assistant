import {expect,it} from 'vitest'
import {zipSync,strToU8,unzipSync,strFromU8} from 'fflate'
import {makeWorkbookFixture,basicSheet,inline} from '../../../tests/fixtures/workbookFactory'
import {readWorkbook} from '../workbook/read'
import {readSummaryTemplate,writeSummaryDocument} from './wordTemplate'
import {readSummaryGroups,resolveSummary,formatSummary,summaryKey} from './summary'

const ns='http://schemas.openxmlformats.org/wordprocessingml/2006/main'
const row=(...cells:string[])=>'<w:tr>'+cells.map(c=>'<w:tc><w:p><w:r><w:t>'+c+'</w:t></w:r></w:p></w:tc>').join('')+'</w:tr>'
const template=()=>zipSync({
 '[Content_Types].xml':strToU8('<Types/>'),
 'word/document.xml':strToU8('<w:document xmlns:w="'+ns+'"><w:body><w:tbl>'+row('项目','项目基本信息','本周进展','下周计划')+row('一、源头质量整治')+row('甲单位共同项目','上期基本信息','上期不再沿用','上期计划')+row('问题名称','问题描述','本周进展','下周计划')+'</w:tbl><w:sectPr/></w:body></w:document>'),
})
const workbook=(fileId='current')=>readWorkbook(makeWorkbookFixture([{name:'源头质量问题',xml:basicSheet
 .replace(inline('F6','计划评审'),inline('F6','无'))
 .replace(inline('F7','无'),inline('F7','本周完成两项')+inline('G7','后续验证'))}]),fileId)

it('默认仅取对应单位，保存的跨单位映射跨文件复用，两个栏都按重点工作输出',()=>{
 const doc=readSummaryTemplate(template()),project=doc.projects[0]
 const groups=readSummaryGroups(workbook())
 const match=resolveSummary(project,groups)
 expect(match.status).toBe('matched')
 expect(formatSummary(match.groups,'current')).toBe('原因分析：本周完成1台')
 expect(formatSummary(match.groups,'next')).toBe('/')
 const selection=groups.map((g,i)=>({key:g.key,role:i===0?'主机厂' as const:'部件厂' as const}))
 const nextGroups=readSummaryGroups(workbook('next-week'))
 expect(summaryKey(project)).toBe(summaryKey(readSummaryTemplate(template()).projects[0]))
 const multiple=resolveSummary(project,nextGroups,selection)
 expect(formatSummary(multiple.groups,'current')).toBe('甲单位（主机厂）\n原因分析：本周完成1台\n\n乙单位（部件厂）\n试验：本周完成两项')
 expect(formatSummary(multiple.groups,'next')).toBe('乙单位（部件厂）\n试验：后续验证')
 expect(resolveSummary(project,nextGroups,[...selection,{key:'已失效',role:''}]).status).toBe('unresolved')
})

it('同名不同问题须确认，空白进展与未找到项目分开',()=>{
 const [first,...others]=readSummaryGroups(workbook())
 const project=readSummaryTemplate(template()).projects[0]
 expect(resolveSummary(project,[first,{...first,key:'different-incident'},...others]).status).toBe('unresolved')
 expect(resolveSummary({...project,name:'新项目'},[first,...others]).status).toBe('unresolved')
})

it('生成可重新导入的Word，替换两列并在指定分组加入新项目',()=>{
 const doc=readSummaryTemplate(template()),project=doc.projects[0]
 const bytes=writeSummaryDocument(doc,[{...project,current:'现场处置：完成 & 验收\n根因分析：复核',next:'现场处置：补录'},{
  id:'new',name:'新增工作',section:project.section,info:'基本信息',current:'/',next:'/',
 }])
 const reloaded=readSummaryTemplate(bytes)
 expect(reloaded.projects.map(p=>p.name)).toEqual(['甲单位共同项目','新增工作'])
 const xml=strFromU8(unzipSync(bytes)['word/document.xml'])
 expect(xml).toContain('完成 &amp; 验收')
 expect(xml).toContain('现场处置：补录')
 expect(xml).not.toContain('上期不再沿用')
 expect(xml).not.toContain('上期计划')
 expect(xml).toContain('上期基本信息')
 expect(xml).toContain('<w:t>问题描述</w:t>')
})


it('只有下周计划且无重点工作时保留该条，使用项目名作为工作前缀',()=>{
 const xml=basicSheet.replace(inline('D7','试验'),'').replace(inline('F7','无'),inline('G7','跟进评审'))
 const book=readWorkbook(makeWorkbookFixture([{name:'源头质量问题',xml}]),'only-plan')
 const group=readSummaryGroups(book).find(entry=>entry.unit==='乙单位')!
 expect(formatSummary([group],'current')).toBe('/')
 expect(formatSummary([group],'next')).toBe('共同项目：跟进评审')
})
