import {fireEvent,render,screen,waitFor,within} from '@testing-library/react'
import {expect,it,vi} from 'vitest'
import {zipSync,strToU8} from 'fflate'
import {makeWorkbookFixture,basicSheet} from '../../../tests/fixtures/workbookFactory'
import {WordSummaryPage} from './WordSummaryPage'
import {download} from '../../ui/download'
vi.mock('../../ui/download',()=>({download:vi.fn()}))

it('上传两份材料后，缺报确认解除下载限制，新生成两列可编辑',async()=>{
 const ns='http://schemas.openxmlformats.org/wordprocessingml/2006/main'
 const row=(...cells:string[])=>'<w:tr>'+cells.map(c=>'<w:tc><w:p><w:r><w:t>'+c+'</w:t></w:r></w:p></w:tc>').join('')+'</w:tr>'
 const doc=zipSync({'[Content_Types].xml':strToU8('<Types/>'),'word/document.xml':strToU8('<w:document xmlns:w="'+ns+'"><w:body><w:tbl>'+row('项目','项目基本信息','本周进展','下周计划')+row('一、源头质量整治')+row('甲单位共同项目','基本信息','旧内容','旧计划')+row('不在本期表的项目','基本信息','旧内容','旧计划')+'</w:tbl></w:body></w:document>')})
 const xlsx=makeWorkbookFixture([{name:'源头质量问题',xml:basicSheet}])
 const upload=(label:string,name:string,buffer:ArrayBuffer)=>{
  const file=new File([buffer],name)
  Object.defineProperty(file,'arrayBuffer',{value:async()=>buffer})
  fireEvent.change(screen.getByLabelText(label),{target:{files:[file]}})
 }
 render(<WordSummaryPage/>)
 upload('本期校核后 Excel','本期.xlsx',Uint8Array.from(new Uint8Array(xlsx)).buffer)
 upload('上期 Word 总结表','上期.docx',Uint8Array.from(doc).buffer)
 const button=await screen.findByRole('button',{name:'下载 Word 总结'})
 expect(button).toBeDisabled()
 expect(screen.getByLabelText('甲单位共同项目本周进展')).toHaveValue('1. 原因分析：本周完成1台\n2. 原因分析：计划评审')
 const currentSource=screen.getByRole('region',{name:'Excel 本周进展原文'})
 expect(currentSource).toHaveTextContent('源头质量问题!F5')
 expect(currentSource).toHaveTextContent('本周完成1台')
 expect(screen.getByRole('region',{name:'Excel 下周计划原文'})).not.toHaveTextContent('本周完成1台')
 fireEvent.click(screen.getByRole('button',{name:'确认本期未报送'}))
 await waitFor(()=>expect(button).toBeEnabled())
 fireEvent.change(screen.getByLabelText('甲单位共同项目本周进展'),{target:{value:'原因分析：已完成核对'}})
 expect(within(currentSource).getByText('本周完成1台')).toBeVisible()
 expect(currentSource).not.toHaveTextContent('已完成核对')
 fireEvent.click(button)
 expect(download).toHaveBeenCalledWith(expect.any(Blob),'本期_Word总结.docx')
})
