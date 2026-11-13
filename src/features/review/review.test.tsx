import {it,expect} from 'vitest'
import {render,screen,fireEvent} from '@testing-library/react'
import {SourcePanel} from './SourcePanel'
import {ProposalEditor} from './ReviewPage'
import type {Proposal} from '../../core/model'
it('来源可追溯到坐标，长原文不截断丢失',()=>{
 render(<SourcePanel sources={[{id:'s',unit:'甲单位',project:'项目',taskPath:[],fields:{current:'本周完成1台'},rawText:'本周完成1台',refs:[{fileId:'f',sheet:'专项工作',address:'K5'}]}]} files={[{id:'f',name:'单位报送.xlsx'}]}/> )
 expect(screen.getByText('单位报送.xlsx')).toBeVisible();expect(screen.getByText(/专项工作 · K5/)).toBeVisible();expect(screen.getByText('本周完成1台')).toBeVisible()
})
it('AI新建议到达时保留尚未提交的文字和审核依据',()=>{
 const p:Proposal={id:'p',reportId:'r',itemId:'i',field:'current',before:'上期',suggested:'旧建议',sourceIds:['s'],warnings:[],batchId:'b',baseRevision:0}
 const view=render(<ProposalEditor proposal={p} disabled={false} onSave={async()=>true}/>)
 fireEvent.change(screen.getByLabelText('本期内容（可编辑）'),{target:{value:'人工正在修改'}})
 fireEvent.change(screen.getByLabelText('审核说明 / 人工补充依据'),{target:{value:'电话核对'}})
 view.rerender(<ProposalEditor proposal={{...p,suggested:'新建议'}} disabled={false} onSave={async()=>true}/>)
 expect(screen.getByLabelText('本期内容（可编辑）')).toHaveValue('人工正在修改')
 expect(screen.getByLabelText('审核说明 / 人工补充依据')).toHaveValue('电话核对')
 expect(screen.getByRole('button',{name:'查看并载入新建议'})).toBeVisible()
})
