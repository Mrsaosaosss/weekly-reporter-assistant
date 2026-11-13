import {it,expect} from 'vitest'
import {makeWorkbookFixture} from '../../../tests/fixtures/workbookFactory'
import {readWorkbook} from './read'
import {patchWorkbook} from './patch'
it('独立修改共享字符串，等号保持文字，其他部件不变',()=>{
 const book=readWorkbook(makeWorkbookFixture([{name:'源头质量问题',xml:'<sheetData><row r="1"><c r="A1" t="s" s="2"><v>0</v></c><c r="B1" t="s"><v>0</v></c><c r="C1"><f>1+1</f><v>2</v></c></row></sheetData><mergeCells><mergeCell ref="A2:B2"/></mergeCells><pageMargins left="0.5"/>'}],{'xl/sharedStrings.xml':'<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><si><t>原文</t></si></sst>','custom/keep.xml':'<root>unchanged</root>'}),'b')
 const bytes=patchWorkbook(book,[{ref:{fileId:'b',sheet:'源头质量问题',address:'A1'},before:'原文',text:'=外部文本',textStyle:'base'}])
 const next=readWorkbook(bytes.buffer as ArrayBuffer,'n')
 expect(next.sheets[0].cells.A1.text).toBe('=外部文本');expect(next.sheets[0].cells.A1.formula).toBeUndefined()
 expect(next.sheets[0].cells.B1.text).toBe('原文');expect(next.sheets[0].cells.A1.style).toBe('2')
 expect(next.parts['custom/keep.xml']).toEqual(book.parts['custom/keep.xml'])
 expect(()=>patchWorkbook(book,[{ref:{fileId:'b',sheet:'源头质量问题',address:'C1'},before:'2',text:'bad',textStyle:'base'}])).toThrow(/公式/)
 expect(patchWorkbook(book,[])).toEqual(book.bytes)
})
it('数值日期更新后保留Excel数值类型与原日期样式',()=>{
 const b=readWorkbook(makeWorkbookFixture([{name:'专项工作',xml:'<sheetData><row r="1"><c r="A1" s="4"><v>46295</v></c></row></sheetData>'}]),'b')
 const next=readWorkbook(patchWorkbook(b,[{ref:{fileId:'b',sheet:'专项工作',address:'A1'},before:'46295',text:'46302',textStyle:'base',valueType:'number'} as any]).buffer as ArrayBuffer,'n')
 expect(next.sheets[0].cells.A1.type).toBe('n');expect(next.sheets[0].cells.A1.style).toBe('4');expect(next.sheets[0].cells.A1.text).toBe('46302')
})
it('变更标红、异常标黄，同时保留边框/换行；下一期清理旧标记',()=>{
 const styles='<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="1"><font><name val="宋体"/><sz val="12"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="1"><xf fontId="0" fillId="0" borderId="0"><alignment wrapText="1"/></xf></cellXfs></styleSheet>'
 const book=readWorkbook(makeWorkbookFixture([{name:'专项工作',xml:'<sheetData><row r="1"><c r="A1" s="0" t="inlineStr"><is><t>上期</t></is></c><c r="B1" s="0" t="inlineStr"><is><r><rPr><b/></rPr><t>待核实</t></r></is></c></row></sheetData>'}],{'xl/styles.xml':styles}),'b')
 const out=readWorkbook(patchWorkbook(book,[{ref:{fileId:'b',sheet:'专项工作',address:'A1'},before:'上期',text:'本期',textStyle:'base',highlight:'changed'},{ref:{fileId:'b',sheet:'专项工作',address:'B1'},before:'待核实',text:'待核实',textStyle:'base',highlight:'attention'}] as any).buffer as ArrayBuffer,'out')
 const style=new TextDecoder().decode(out.parts['xl/styles.xml'])
 expect(style).toContain('FFB42318');expect(style).toContain('FFFFF2CC');expect(style).toContain('wrapText="1"')
 expect(out.sheets[0].cells.B1.rich).toBe(true)
 const next=readWorkbook(patchWorkbook(out,[]).buffer as ArrayBuffer,'next')
 expect(next.sheets[0].cells.A1.style).toBe('0');expect(next.sheets[0].cells.A1.text).toBe('本期')
})

it('最终写入保护数组公式覆盖的成员格和共享公式从格',()=>{
 const b=readWorkbook(makeWorkbookFixture([{name:'问题',xml:'<sheetData><row r="1"><c r="A1"><f t="array" ref="A1:A2">{1;2}</f><v>1</v></c></row><row r="2"><c r="A2"><v>2</v></c><c r="B2"><f t="shared" si="0"/><v>2</v></c></row></sheetData>'}]),'b')
 for(const address of ['A2','B2'])expect(()=>patchWorkbook(b,[{ref:{fileId:'b',sheet:'问题',address},before:'2',text:'新内容',textStyle:'base'}])).toThrow(/公式/)
})
