import {it,expect} from 'vitest'
import {render,screen,fireEvent,within} from '@testing-library/react'
import {IssueTable} from './IssueTable'
import type {ReportItem,SourceFragment} from '../../core/model'
const item:ReportItem={id:'i',reportId:'r',category:'source',unit:'株洲所',project:'盐沙坪',taskPath:['根因分析'],fields:{current:'上期进展',next:'上期计划'},targets:{current:{fileId:'b',sheet:'源头质量问题',address:'J5'},next:{fileId:'b',sheet:'源头质量问题',address:'K5'}}}
const source:SourceFragment={id:'s',category:'source',unit:'株洲所',project:'盐沙坪',taskPath:['根因分析'],fields:{current:'本期进展',next:''},refs:[],rawText:'本期进展'}
it('同屏显示原文、本期空白和选择结果，并允许单格操作',()=>{
 let action:any
 const props={items:[item],allItems:[item],sources:[source],state:{decisions:{},sources:{},completed:[]},files:[],books:new Map(),preview:false,busy:false,hideUnchanged:false,onAction:async(a:any)=>{action=a},onEdit:()=>{}}
 const view=render(<IssueTable {...props}/>);expect(screen.getByText('上期进展')).toBeVisible();expect(screen.getByText('本期进展')).toBeVisible();expect(screen.getByText('（本期为空白）')).toBeVisible()
 fireEvent.click(screen.getByRole('button',{name:'采用本期：根因分析 / 本周具体工作进展'}));expect(action.cells).toEqual([{itemId:'i',field:'current',mode:'source'}])
 view.rerender(<IssueTable {...props} preview state={{...props.state,decisions:{i:{current:{mode:'source',itemId:'i',field:'current',text:'本期进展',sourceId:'s'}}}}}/>);expect(screen.queryByText('上期进展')).not.toBeInTheDocument();expect(screen.getByText('上期计划')).toBeVisible();expect(screen.getByText('本期进展')).toBeVisible()
})
