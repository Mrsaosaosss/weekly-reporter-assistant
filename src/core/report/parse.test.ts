import {it,expect} from 'vitest'
import {readWorkbook} from '../workbook/read'
import {parseReport,suggestMappings} from './parse'
import {makeWorkbookFixture,basicSheet} from '../../../tests/fixtures/workbookFactory'
it('只在合并范围内继承单位，支持5表分类',()=>{
 const names=['源头质量问题','批量质量问题','自有风场重点问题','专项工作','周例会待办事项']
 const book=readWorkbook(makeWorkbookFixture(names.map(name=>({name,xml:basicSheet}))),'f')
 const result=parseReport(book,suggestMappings(book))
 expect(new Set(result.items.map(i=>i.category)).size).toBe(5)
 expect(result.items.filter(i=>i.category==='source').map(i=>i.unit)).toEqual(['甲单位','甲单位','乙单位'])
 expect(result.items[1].taskPath).toEqual(['原因分析','报告'])
})
it('计划日期按日期显示，不能向用户暴露Excel序号',()=>{
 const source=basicSheet.replace('</row><row r="5">','<c r="H4" t="inlineStr"><is><t>计划完成时间</t></is></c></row><row r="5"><c r="H5" s="4"><v>46295</v></c>')
 const book=readWorkbook(makeWorkbookFixture([{name:'专项工作',xml:source}]),'f'),result=parseReport(book,suggestMappings(book))
 expect(result.items[0].fields.deadline).toBe('2026-09-30')
})
it('Excel给合并区域子格保留空样式格时仍继承合并锚点',()=>{
 const styled=basicSheet.replace('<row r="6">','<row r="6"><c r="A6" s="1"/><c r="B6" s="1"/><c r="C6" s="1"/>')
 const book=readWorkbook(makeWorkbookFixture([{name:'源头质量问题',xml:styled}]),'f')
 const result=parseReport(book,suggestMappings(book))
 expect(result.items[1].unit).toBe('甲单位');expect(result.items[1].project).toBe('共同项目');expect(result.items[1].taskPath).toEqual(['原因分析','报告'])
 expect(result.items[2].unit).toBe('乙单位')
})
it('合并任务名称下的独立子行保留行序及空白，不把第二行当成第一行',()=>{
 const body=`<sheetData><row r="4"><c r="A4" t="inlineStr"><is><t>企业名称</t></is></c><c r="B4" t="inlineStr"><is><t>项目名称</t></is></c><c r="C4" t="inlineStr"><is><t>工作内容</t></is></c><c r="D4" t="inlineStr"><is><t>完成进度</t></is></c><c r="E4" t="inlineStr"><is><t>本周具体工作进展</t></is></c></row><row r="5"><c r="A5" t="inlineStr"><is><t>甲单位</t></is></c><c r="B5" t="inlineStr"><is><t>共同项目</t></is></c><c r="C5" t="inlineStr"><is><t>风险叶片消缺</t></is></c><c r="D5" t="inlineStr"><is><t>排查阶段已完成</t></is></c></row><row r="6"><c r="D6" t="inlineStr"><is><t>维修阶段进行中</t></is></c><c r="E6" t="inlineStr"><is><t>本周完成1支</t></is></c></row></sheetData><mergeCells><mergeCell ref="A5:A6"/><mergeCell ref="B5:B6"/><mergeCell ref="C5:C6"/></mergeCells>`
 const book=readWorkbook(makeWorkbookFixture([{name:'源头质量问题',xml:body}]),'f'),parsed=parseReport(book,suggestMappings(book))
 expect(parsed.items[0].rowContext?.index).toBe(0)
 expect(parsed.items[1].rowContext?.index).toBe(1)
 expect(parsed.fragments[0].fields.current).toBe('')
 expect(parsed.fragments[1].fields.current).toBe('本周完成1支')
})
it('专项工作仅用于排版的纵向合并仍对应单条工作',()=>{
 const body=basicSheet.replace('</mergeCells>','<mergeCell ref="D7:D9"/></mergeCells>')
 const book=readWorkbook(makeWorkbookFixture([{name:'专项工作',xml:body}]),'f')
 expect(parseReport(book,suggestMappings(book)).items.find(i=>i.rowContext?.row===7)?.rowContext?.size).toBe(1)
})
